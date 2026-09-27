import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { Pool } from 'pg';
import pool from '../database/db';
import {
  invalidatePublicEventsCache,
  invalidatePublicVenuesCache,
  invalidatePublicSessionsCache,
  invalidatePublicVenueRelatedCache,
} from '../utils/cache';
import { reconcileUploadsToR2 } from '../utils/reconcileR2';
import { UPLOAD_DIR } from '../utils/imageVariants';
import type {
  PluginContext,
  PluginScriptHandle,
  SpawnScriptOptions,
} from './types';

const OUTPUT_TAIL_LIMIT = 3000;
const SETTING_KEY_PATTERN = /^[A-Za-z0-9_]+$/;
const PLUGIN_KEY_PREFIX = 'plugin';

export const fullSettingKey = (pluginId: string, key: string) => `${PLUGIN_KEY_PREFIX}.${pluginId}.${key}`;

const asString = (value: string | number | boolean) => String(value);

const logFor = (pluginId: string, level: 'info' | 'warn' | 'error', message: string, err?: unknown) => {
  const line = `[plugin:${pluginId}] ${message}`;
  if (level === 'error') console.error(line, err ?? '');
  else if (level === 'warn') console.warn(line);
  else console.log(line);
};

interface ScriptSlot {
  running: boolean;
  output: string;
}

export const createPluginContext = (pluginId: string, pluginDir?: string): PluginContext => {
  const slots = new Map<string, ScriptSlot>();

  const getSlot = (slot: string): ScriptSlot => {
    let entry = slots.get(slot);
    if (!entry) {
      entry = { running: false, output: '' };
      slots.set(slot, entry);
    }
    return entry;
  };

  const readSettingRaw = async (key: string): Promise<string | null> => {
    const result = await pool.query('SELECT value FROM settings WHERE key = $1', [fullSettingKey(pluginId, key)]);
    return result.rows[0]?.value ?? null;
  };

  const upsertSetting = async (key: string, value: string) => {
    await pool.query(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
      [fullSettingKey(pluginId, key), value]
    );
  };

  const ctx: PluginContext = {
    pluginId,
    logger: {
      info: (message) => logFor(pluginId, 'info', message),
      warn: (message) => logFor(pluginId, 'warn', message),
      error: (message, err) => logFor(pluginId, 'error', message, err),
    },

    settings: {
      get: async <T extends string | number | boolean>(key: string): Promise<T | null> => {
        const raw = await readSettingRaw(key);
        if (raw === null) return null;
        if ((typeof raw === 'string' && (raw === 'true' || raw === 'false'))) {
          return (raw === 'true') as T;
        }
        const numeric = Number(raw);
        if (raw !== '' && Number.isFinite(numeric) && /^[+-]?\d+(\.\d+)?$/.test(raw.trim())) {
          return numeric as T;
        }
        return raw as T;
      },
      getRaw: readSettingRaw,
      getAll: async () => {
        const prefix = `${PLUGIN_KEY_PREFIX}.${pluginId}.`;
        const result = await pool.query('SELECT key, value FROM settings WHERE key LIKE $1', [`${prefix}%`]);
        return result.rows.reduce<Record<string, string>>((acc, row) => {
          acc[String(row.key).slice(prefix.length)] = String(row.value ?? '');
          return acc;
        }, {});
      },
      set: (key, value) => upsertSetting(key, asString(value)),
      setMany: async (entries) => {
        for (const [key, value] of Object.entries(entries)) {
          await upsertSetting(key, asString(value));
        }
      },
      remove: async (key) => {
        await pool.query('DELETE FROM settings WHERE key = $1', [fullSettingKey(pluginId, key)]);
      },
    },

    db: pool,

    paths: {
      projectRoot: process.env.ANIMAP_PROJECT_ROOT || path.resolve(process.cwd(), '..'),
      uploadDir: path.resolve(UPLOAD_DIR),
      pluginDir,
      resolveScript: (candidates) => candidates.find((candidate) => fs.existsSync(candidate)) || null,
    },

    readEnvFile: (filePath) => {
      if (!fs.existsSync(filePath)) return {};
      const content = fs.readFileSync(filePath, 'utf8');
      return content.split(/\r?\n/).reduce<Record<string, string>>((acc, line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return acc;
        const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (!match) return acc;
        acc[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
        return acc;
      }, {});
    },

    spawnScript: (options: SpawnScriptOptions): PluginScriptHandle => {
      const slot = getSlot(options.slot);
      if (slot.running) {
        return { started: false, isRunning: () => true, outputTail: () => slot.output };
      }

      slot.running = true;
      slot.output = '';

      const child = spawn(options.command, options.args || [], {
        cwd: options.cwd,
        env: options.env || process.env,
        detached: options.fireAndForget === true,
        stdio: options.fireAndForget ? 'ignore' : ['ignore', 'pipe', 'pipe'],
      });

      if (options.fireAndForget) {
        child.unref();
      } else {
        const appendOutput = (chunk: Buffer) => {
          slot.output = `${slot.output}${chunk.toString('utf8')}`.slice(-OUTPUT_TAIL_LIMIT);
        };
        child.stdout?.on('data', appendOutput);
        child.stderr?.on('data', appendOutput);
      }

      const finish = () => {
        slot.running = false;
      };

      // onExit 内部 try/catch：退出回调里的 async DB 写失败不允许击穿进程。
      // 无论何种模式，进程结束后都必须释放 slot，否则之后无法再次触发。
      child.on('close', (code) => {
        try {
          void Promise.resolve(options.onExit?.(code, slot.output)).catch((err) => {
            logFor(pluginId, 'error', `spawnScript slot=${options.slot} onExit failed:`, err);
          });
        } catch (err) {
          logFor(pluginId, 'error', `spawnScript slot=${options.slot} onExit threw:`, err);
        }
        finish();
      });
      child.on('error', (err) => {
        logFor(pluginId, 'error', `spawnScript slot=${options.slot} spawn failed:`, err);
        try {
          void Promise.resolve(options.onExit?.(-1, slot.output)).catch((e) => {
            logFor(pluginId, 'error', `spawnScript slot=${options.slot} onExit failed:`, e);
          });
        } catch (e) {
          logFor(pluginId, 'error', `spawnScript slot=${options.slot} onExit threw:`, e);
        }
        finish();
      });

      return {
        started: true,
        isRunning: () => slot.running,
        outputTail: () => slot.output,
      };
    },

    isSlotRunning: (slot) => getSlot(slot).running,

    invalidatePublicCache: (kind) => {
      if (kind === 'events') invalidatePublicEventsCache();
      else if (kind === 'venues') invalidatePublicVenuesCache();
      else if (kind === 'sessions') invalidatePublicSessionsCache();
      else if (kind === 'venueRelated') invalidatePublicVenueRelatedCache();
    },

    capabilities: {
      reconcileUploadsToR2: (options) => reconcileUploadsToR2(options),
    },
  };

  return ctx;
};

export { SETTING_KEY_PATTERN };

export type { PluginContext };
