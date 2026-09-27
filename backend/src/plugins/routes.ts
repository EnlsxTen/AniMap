import fs from 'fs';
import os from 'os';
import path from 'path';
import { Router, Request, Response } from 'express';
import multer from 'multer';
import { authMiddleware, requireRole } from '../middleware/auth';
import { getPlugin, getPluginContext, listPluginManifests } from './registry';
import { SETTING_KEY_PATTERN, fullSettingKey } from './context';
import { importFromAmi, isImportedPlugin, uninstallImportedPlugin } from './loader';
import pool from '../database/db';
import type { PluginStatus, SettingField } from './types';

const router = Router();

const fsp = fs.promises;

// 插件管理接口全部限管理员
router.use(authMiddleware, requireRole(['admin']));

// .ami 导入专用上传（内存存储，10MB 上限；格式与 zip-slip 校验在 loader 里做）
const amiUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

const maskSecret = (value: string | undefined | null) => {
  if (!value) return null;
  if (value.length <= 8) return '********';
  return value.slice(0, 4) + '????' + value.slice(-4);
};

const SECRET_CLEAR_SENTINEL = '__CLEAR__';

const safeStatus = async (pluginId: string): Promise<PluginStatus | null> => {
  const plugin = getPlugin(pluginId);
  if (!plugin) return null;
  try {
    return await plugin.status();
  } catch (err) {
    console.error(`[plugins] status failed: ${pluginId}`, err);
    return { running: false, fields: [{ label: '状态读取失败', value: String(err instanceof Error ? err.message : err), tone: 'danger' }] };
  }
};

const readRawSettings = async (pluginId: string) => {
  const ctx = getPluginContext(pluginId);
  if (!ctx) return {};
  return ctx.settings.getAll();
};

// 校验并规范化一个设置值；返回存库字符串。非法时抛 Error（message 面向用户）。
const normalizeSettingValue = (field: SettingField, input: unknown, existing: string | undefined): string | null => {
  if (field.type === 'secret') {
    if (input === SECRET_CLEAR_SENTINEL) return null; // null = 删除该键
    if (input === undefined || input === null || input === '') return existing ?? ''; // 空值 = 保留原值
    const value = String(input).trim();
    if (value.length > 500) throw new Error(`${field.label} 过长（最多 500 字符）`);
    return value;
  }

  if (input === undefined || input === null) return existing ?? '';

  if (field.type === 'boolean') {
    if (typeof input === 'boolean') return input ? 'true' : 'false';
    const value = String(input);
    if (value === 'true' || value === 'false') return value;
    throw new Error(`${field.label} 只能是 true/false`);
  }

  const value = String(input).trim();
  if (value === '') {
    if (field.default !== undefined) return String(field.default);
    return '';
  }

  if (field.type === 'number') {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0 || !Number.isInteger(numeric)) {
      throw new Error(`${field.label} 必须是正整数`);
    }
    return String(numeric);
  }

  if (field.type === 'select') {
    const options = field.options || [];
    if (!options.some((option) => option.value === value)) {
      throw new Error(`${field.label} 取值无效`);
    }
    return value;
  }

  if (value.length > 500) throw new Error(`${field.label} 过长（最多 500 字符）`);
  return value;
};

// GET /api/plugins — 全部插件：manifest + 设置值（secret 脱敏）+ 状态
router.get('/', async (_req: Request, res: Response) => {
  try {
    const plugins = await Promise.all(listPluginManifests().map(async (manifest) => {
      const raw = await readRawSettings(manifest.id);
      const settings = manifest.settings.map((field) => {
        let value = raw[field.key] ?? (field.default !== undefined ? String(field.default) : '');
        if (field.type === 'secret') {
          value = value ? (maskSecret(value) || '') : '';
        }
        return {
          key: field.key,
          label: field.label,
          type: field.type,
          value,
          options: field.options || [],
          placeholder: field.placeholder || '',
          helpText: field.helpText || '',
        };
      });
      return {
        id: manifest.id,
        name: manifest.name,
        description: manifest.description,
        version: manifest.version,
        scheduleHint: manifest.scheduleHint || '',
        runActions: manifest.runActions || [],
        imported: isImportedPlugin(manifest.id),
        settings,
        status: await safeStatus(manifest.id),
      };
    }));
    res.json({ plugins });
  } catch (error) {
    console.error('[plugins] list error:', error);
    res.status(500).json({ error: '获取插件列表失败' });
  }
});

// GET /api/plugins/:id/status — 单插件状态（前端 running 时轮询用）
router.get('/:id/status', async (req: Request, res: Response) => {
  const plugin = getPlugin(req.params.id);
  if (!plugin) return res.status(404).json({ error: '插件不存在' });
  try {
    res.json(await plugin.status());
  } catch (error) {
    console.error(`[plugins] status error: ${req.params.id}`, error);
    res.status(500).json({ error: '获取插件状态失败' });
  }
});

// PUT /api/plugins/:id/settings — 按 manifest schema 校验并保存
router.put('/:id/settings', async (req: Request, res: Response) => {
  const plugin = getPlugin(req.params.id);
  const ctx = getPluginContext(req.params.id);
  if (!plugin || !ctx) return res.status(404).json({ error: '插件不存在' });

  const body = req.body || {};
  const raw = await readRawSettings(plugin.manifest.id);

  try {
    for (const field of plugin.manifest.settings) {
      if (!(field.key in body)) continue;
      const normalized = normalizeSettingValue(field, body[field.key], raw[field.key]);
      if (normalized === null) {
        await pool.query('DELETE FROM settings WHERE key = $1', [fullSettingKey(plugin.manifest.id, field.key)]);
      } else if (normalized !== (raw[field.key] ?? '')) {
        if (!SETTING_KEY_PATTERN.test(field.key)) throw new Error('设置键名非法');
        await ctx.settings.set(field.key, normalized);
      }
    }
    res.json({ message: '设置已保存' });
    // 保存成功后通知插件（如异地备份需重载每日调度）；失败不影响保存结果
    try {
      await plugin.onSettingsSaved?.();
    } catch (err) {
      console.warn(`[plugins] ${plugin.manifest.id} onSettingsSaved 失败:`, err instanceof Error ? err.message : err);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '保存设置失败';
    res.status(400).json({ error: message });
  }
});

// POST /api/plugins/import — 导入 .ami 插件包（zip 格式，见 docs/PLUGIN_DEVELOPMENT.md）
// 安全声明：导入的插件与内置插件同权限运行（进程内，可访问 DB/文件/网络），
// 该端点仅限 admin，前端在调用前必须向用户展示风险确认。
router.post('/import', amiUpload.single('plugin'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: '请选择要导入的 .ami 插件包' });

  // multer memoryStorage → 落临时文件后交给 loader（loader 按路径处理）
  const tmpPath = path.join(os.tmpdir(), `animap-ami-${Date.now()}-${Math.random().toString(36).slice(2)}.ami`);
  try {
    await fsp.writeFile(tmpPath, req.file.buffer);
    const manifest = await importFromAmi(tmpPath);
    res.json({
      message: `插件「${manifest.name}」导入成功`,
      plugin: { id: manifest.id, name: manifest.name, version: manifest.version },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '导入失败';
    console.error('[plugins] import error:', message);
    res.status(400).json({ error: message });
  } finally {
    await fsp.rm(tmpPath, { force: true }).catch(() => {});
  }
});

// DELETE /api/plugins/:id — 卸载导入的插件（内置插件不可卸载；settings 保留）
router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!getPlugin(id)) return res.status(404).json({ error: '插件不存在' });
  if (!isImportedPlugin(id)) {
    return res.status(400).json({ error: '内置插件不支持卸载' });
  }
  try {
    await uninstallImportedPlugin(id);
    res.json({ message: '插件已卸载（其设置项已保留，重装后自动恢复）' });
  } catch (error) {
    console.error(`[plugins] uninstall error: ${id}`, error);
    res.status(500).json({ error: '卸载失败' });
  }
});

// POST /api/plugins/:id/run — 手动触发；body { action?: string, options?: object }
router.post('/:id/run', async (req: Request, res: Response) => {
  const plugin = getPlugin(req.params.id);
  if (!plugin) return res.status(404).json({ error: '插件不存在' });
  if (!plugin.run || !(plugin.manifest.runActions || []).length) {
    return res.status(400).json({ error: '该插件不支持手动运行' });
  }

  const action = typeof req.body?.action === 'string' && req.body.action ? req.body.action : (plugin.manifest.runActions?.[0]?.id || 'default');
  if (!plugin.manifest.runActions?.some((item) => item.id === action)) {
    return res.status(400).json({ error: `未知的运行动作：${action}` });
  }

  try {
    const result = await plugin.run(action, req.body?.options || {});
    res.json(result);
  } catch (error) {
    console.error(`[plugins] run error: ${req.params.id}/${action}`, error);
    res.status(500).json({ error: '运行插件失败' });
  }
});

export default router;
