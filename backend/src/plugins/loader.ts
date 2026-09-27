import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import AdmZip from 'adm-zip';
import { hasPlugin, listPluginManifests, registerPlugin, unregisterPlugin } from './registry';
import type { AnimapPlugin, PluginManifest, SettingField } from './types';

// ==========================================================================
// .ami 插件导入/卸载/启动恢复
//
// .ami = zip 改后缀，根目录必须包含：
//   manifest.json  — 与内置插件同构的清单
//   plugin.cjs     — CommonJS 实现，module.exports = { manifest, setup, status, run?, start?, stop? }
// 附属文件任意，解压后可通过 ctx.paths.pluginDir 相对引用。
//
// 安全模型：导入的插件在进程内运行、拥有服务器完整权限（与内置插件相同）。
// 该接口仅限 admin（routes 层已挂 requireRole），导入前必须由用户确认风险。
// ==========================================================================

const INSTALL_DIR = process.env.PLUGINS_INSTALL_DIR || path.resolve(process.cwd(), 'plugins-installed');
const MANIFEST_NAME = 'manifest.json';
const ENTRY_NAME = 'plugin.cjs';
const MAX_AMI_SIZE = 10 * 1024 * 1024;
const PLUGIN_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,39}$/;
const SETTING_KEY_PATTERN = /^[A-Za-z0-9_]+$/;
const SETTING_TYPES = new Set(['boolean', 'string', 'number', 'select', 'secret']);

const importedIds = new Set<string>();

export const isImportedPlugin = (id: string): boolean => importedIds.has(id);

const validateManifest = (raw: unknown): PluginManifest => {
  if (!raw || typeof raw !== 'object') throw new Error('manifest.json 内容不是对象');
  const m = raw as Record<string, unknown>;

  if (typeof m.id !== 'string' || !PLUGIN_ID_PATTERN.test(m.id)) {
    throw new Error('manifest.id 非法：需为 2-40 位小写字母/数字/中划线，且以字母或数字开头');
  }
  for (const key of ['name', 'description', 'version'] as const) {
    if (typeof m[key] !== 'string' || !(m[key] as string).trim()) {
      throw new Error(`manifest.${key} 必须是非空字符串`);
    }
  }
  if ((m.version as string).length > 30) throw new Error('manifest.version 过长');

  if (!Array.isArray(m.settings)) throw new Error('manifest.settings 必须是数组（可为空）');
  const seenKeys = new Set<string>();
  for (const field of m.settings as SettingField[]) {
    if (!field || typeof field.key !== 'string' || !SETTING_KEY_PATTERN.test(field.key)) {
      throw new Error('settings 字段 key 非法（仅限字母/数字/下划线）');
    }
    if (seenKeys.has(field.key)) throw new Error(`settings 字段 key 重复：${field.key}`);
    seenKeys.add(field.key);
    if (typeof field.label !== 'string' || !field.label) throw new Error(`settings.${field.key} 缺少 label`);
    if (!SETTING_TYPES.has(field.type)) throw new Error(`settings.${field.key} 的 type 非法：${String(field.type)}`);
    if (field.type === 'select' && (!Array.isArray(field.options) || field.options.length === 0)) {
      throw new Error(`settings.${field.key} 为 select 类型时必须提供 options`);
    }
  }

  if (m.runActions !== undefined) {
    if (!Array.isArray(m.runActions)) throw new Error('manifest.runActions 必须是数组');
    for (const action of m.runActions) {
      if (!action || typeof action.id !== 'string' || !/^[a-z0-9_-]{1,40}$/.test(action.id)) {
        throw new Error('runActions[].id 非法');
      }
      if (typeof action.label !== 'string' || !action.label) throw new Error('runActions[].label 必须是非空字符串');
    }
  }

  return {
    id: m.id,
    name: m.name as string,
    description: m.description as string,
    version: m.version as string,
    settings: m.settings as SettingField[],
    runActions: (m.runActions as PluginManifest['runActions']) || [],
    scheduleHint: typeof m.scheduleHint === 'string' ? m.scheduleHint : undefined,
  };
};

// 加载已解压目录里的 plugin.cjs；支持导出对象或工厂函数
const instantiatePlugin = (installDir: string, manifest: PluginManifest): AnimapPlugin => {
  const entryPath = path.join(installDir, ENTRY_NAME);
  if (!fs.existsSync(entryPath)) {
    throw new Error(`插件包缺少入口文件 ${ENTRY_NAME}`);
  }

  delete require.cache[require.resolve(entryPath)];
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const exported = require(entryPath);
  let plugin: AnimapPlugin;
  if (typeof exported === 'function') {
    plugin = exported();
  } else {
    plugin = exported;
  }

  if (!plugin || typeof plugin.setup !== 'function' || typeof plugin.status !== 'function') {
    throw new Error('plugin.cjs 必须导出 { setup(ctx), status() }（可为工厂函数）');
  }
  // manifest.json 为权威清单，覆盖 plugin.cjs 内导出的 manifest（后者可省略）
  return { ...plugin, manifest };
};

export const importFromAmi = async (amiFilePath: string): Promise<PluginManifest> => {
  const stat = await fsp.stat(amiFilePath).catch(() => null);
  if (!stat || stat.size > MAX_AMI_SIZE) {
    throw new Error('.ami 文件不存在或超过 10MB 上限');
  }

  let zip: AdmZip;
  try {
    zip = new AdmZip(amiFilePath);
  } catch {
    throw new Error('无法解析 .ami 文件：不是有效的 zip 包');
  }

  // 防嵌套目录：manifest.json 必须在包根
  const manifestEntry = zip.getEntry(MANIFEST_NAME);
  if (!manifestEntry) {
    throw new Error('.ami 包根目录缺少 manifest.json');
  }
  const manifest = validateManifest(JSON.parse(manifestEntry.getData().toString('utf8')));

  if (hasPlugin(manifest.id)) {
    const origin = isImportedPlugin(manifest.id) ? '已导入过该插件' : '与内置插件 id 冲突';
    throw new Error(`插件 id「${manifest.id}」冲突：${origin}，请先卸载或更换 id`);
  }

  const installDir = path.join(INSTALL_DIR, manifest.id);
  await fsp.mkdir(installDir, { recursive: true });

  // 解压（zip-slip 防护：条目路径规范化后必须留在安装目录内）
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const target = path.normalize(path.join(installDir, entry.entryName));
    if (!target.startsWith(path.normalize(installDir + path.sep))) {
      throw new Error(`.ami 包含非法路径条目：${entry.entryName}`);
    }
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(target, entry.getData());
  }

  // 解压完成后再实例化，失败则回滚目录
  try {
    const plugin = instantiatePlugin(installDir, manifest);
    registerPlugin(plugin, installDir);
    importedIds.add(manifest.id);
    console.log(`[plugins] imported: ${manifest.id} v${manifest.version} -> ${installDir}`);
    return manifest;
  } catch (err) {
    await fsp.rm(installDir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
};

export const uninstallImportedPlugin = async (id: string): Promise<void> => {
  if (!isImportedPlugin(id)) {
    throw new Error('内置插件不支持卸载');
  }
  unregisterPlugin(id);
  importedIds.delete(id);
  await fsp.rm(path.join(INSTALL_DIR, id), { recursive: true, force: true }).catch(() => {});
  console.log(`[plugins] uninstalled: ${id}`);
};

// 服务启动时扫描安装目录，恢复加载（单个失败不影响其他插件）
export const loadInstalledAtBoot = () => {
  if (!fs.existsSync(INSTALL_DIR)) {
    fs.mkdirSync(INSTALL_DIR, { recursive: true });
    return;
  }
  for (const dirName of fs.readdirSync(INSTALL_DIR)) {
    const dir = path.join(INSTALL_DIR, dirName);
    const manifestPath = path.join(dir, MANIFEST_NAME);
    if (!fs.statSync(dir).isDirectory() || !fs.existsSync(manifestPath)) continue;
    try {
      const manifest = validateManifest(JSON.parse(fs.readFileSync(manifestPath, 'utf8')));
      if (manifest.id !== dirName) throw new Error(`目录名 ${dirName} 与 manifest.id ${manifest.id} 不一致`);
      if (hasPlugin(manifest.id)) throw new Error('与已注册插件 id 冲突');
      const plugin = instantiatePlugin(dir, manifest);
      registerPlugin(plugin, dir);
      importedIds.add(manifest.id);
      console.log(`[plugins] restored imported plugin: ${manifest.id} v${manifest.version}`);
    } catch (err) {
      console.error(`[plugins] restore failed for ${dirName}:`, err instanceof Error ? err.message : err);
    }
  }
};

// 供文档/调试：列出安装目录中未被加载的目录（恢复失败的可排查）
export const listBrokenInstalls = (): string[] => {
  if (!fs.existsSync(INSTALL_DIR)) return [];
  const registered = new Set(listPluginManifests().map((m) => m.id));
  return fs.readdirSync(INSTALL_DIR).filter((name) => {
    const dir = path.join(INSTALL_DIR, name);
    return fs.statSync(dir).isDirectory() && !registered.has(name);
  });
};

export { INSTALL_DIR };
