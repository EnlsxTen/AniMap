import type { Pool } from 'pg';

// ==========================================================================
// AniMap 插件契约
//
// 插件是后端内嵌的 TS 模块，位于 src/plugins/<id>/，实现一个标准生命周期。
// 核心系统为插件提供：命名空间 settings 存储、结构化日志、外部脚本 spawn、
// 公共缓存失效、R2 图片对账、路径解析等能力（见 context.ts）。
// 开发指南：docs/PLUGIN_DEVELOPMENT.md
// ==========================================================================

/** 设置字段类型，决定前端渲染的控件与存储校验规则 */
export type SettingFieldType = 'boolean' | 'string' | 'number' | 'select' | 'secret';

/**
 * 设置字段声明（manifest.settings）。
 * key 为插件内相对名，存库时由 context 自动加前缀：plugin.<插件id>.<key>
 */
export interface SettingField {
  key: string;
  /** 中文标签，前端直接渲染 */
  label: string;
  type: SettingFieldType;
  /** 未写入时的默认值；settings.get 已按默认值兜底 */
  default?: string | number | boolean;
  /** select 的候选项 */
  options?: Array<{ value: string; label: string }>;
  /** 输入框占位提示 */
  placeholder?: string;
  /** 字段下方的说明文字 */
  helpText?: string;
}

/** 设置 schema 在 manifest 里就是 SettingField[] 的别名 */
export type SettingSchema = SettingField[];

/** 手动运行动作（manifest.runActions），一个插件可暴露多个运行按钮 */
export interface RunAction {
  id: string;
  /** 按钮文案，如 '立即同步' */
  label: string;
  /** 危险操作标红（如实际写库的回填） */
  danger?: boolean;
}

export interface PluginManifest {
  /** 全局唯一 id，小写中划线；用于路由 /api/plugins/:id 与 settings 前缀 */
  id: string;
  name: string;
  description: string;
  version: string;
  settings: SettingSchema;
  runActions?: RunAction[];
  /** 调度说明（纯展示），如 '每日 03:00 自动执行' */
  scheduleHint?: string;
}

/** 状态字段 tone，前端按语义着色 */
export type StatusTone = 'normal' | 'success' | 'warning' | 'danger';

export interface PluginStatusField {
  label: string;
  value: string;
  tone?: StatusTone;
}

export interface PluginStatus {
  /** 有任务正在执行 → 前端每 5 秒轮询 status 直到 false */
  running?: boolean;
  /** 键值对状态区 */
  fields: PluginStatusField[];
  /** 可选长文本（日志尾部等），前端等宽展示 */
  detail?: string;
}

export interface PluginRunResult {
  started: boolean;
  running: boolean;
  message: string;
}

/** spawnScript 返回的句柄：查询运行状态与输出尾部 */
export interface PluginScriptHandle {
  started: boolean;
  isRunning(): boolean;
  outputTail(): string;
}

export interface SpawnScriptOptions {
  /** 同插件内的并发槽位名（如 'sync'、'backup'），同名槽位同时只允许一个进程 */
  slot: string;
  command: string;
  args?: string[];
  cwd?: string;
  /** 子进程完整环境变量（调用方负责白名单合并，不要透传整个 process.env 给不可信脚本） */
  env?: NodeJS.ProcessEnv;
  /** 退出回调（含非零退出与 spawn 失败）；内部已 try/catch，回调抛错不会击穿进程 */
  onExit?: (code: number | null, outputTail: string) => void | Promise<void>;
  /** detach 并忽略输出（长时间脚本，如 bash 备份），此时 outputTail 恒为空 */
  fireAndForget?: boolean;
}

/** 核心系统注入给插件的运行环境 */
export interface PluginContext {
  pluginId: string;
  logger: {
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string, err?: unknown) => void;
  };
  /** 命名空间 settings：键自动加 plugin.<id>. 前缀 */
  settings: {
    /** 读取单个设置（含默认值兜底）；boolean/number 已转为对应类型 */
    get: <T extends string | number | boolean>(key: string) => Promise<T | null>;
    /** 读取原始字符串（不加默认值） */
    getRaw: (key: string) => Promise<string | null>;
    /** 读取全部已存键值（去掉前缀） */
    getAll: () => Promise<Record<string, string>>;
    set: (key: string, value: string | number | boolean) => Promise<void>;
    setMany: (entries: Record<string, string | number | boolean>) => Promise<void>;
    remove: (key: string) => Promise<void>;
  };
  db: Pool;
  paths: {
    projectRoot: string;
    uploadDir: string;
    /** 插件自有目录：内置插件为其源码目录，导入插件为其安装目录；解析插件自带脚本/资源用 */
    pluginDir?: string;
    /** 按候选顺序返回第一个存在的路径；都不存在返回 null */
    resolveScript: (candidates: string[]) => string | null;
  };
  /** 解析 KEY=VALUE 格式的 env 文件（如 .events_sync.env），文件不存在返回 {} */
  readEnvFile: (filePath: string) => Record<string, string>;
  /** 运行外部脚本；同名 slot 防并发，输出保留尾部 3000 字符 */
  spawnScript: (options: SpawnScriptOptions) => PluginScriptHandle;
  /** 查询 slot 是否有进程在运行 */
  isSlotRunning: (slot: string) => boolean;
  /** 失效公共 Redis 缓存 */
  invalidatePublicCache: (kind: 'events' | 'venues' | 'sessions' | 'venueRelated') => void;
  capabilities: {
    /** 扫描本地 uploads，把缺失的 webp 变体生成并补传 R2 */
    reconcileUploadsToR2: (options?: { force?: boolean; verbose?: boolean }) => Promise<{
      scanned: number;
      uploaded: number;
      reconciled: number;
      skipped: number;
      failed: number;
    }>;
  };
}

export interface AnimapPlugin {
  manifest: PluginManifest;
  /** 启动时由 registry 调用一次，注入 ctx；插件应保存引用供后续方法使用 */
  setup: (ctx: PluginContext) => void;
  /** 注册定时任务等常驻逻辑（仅服务启动时调用一次） */
  start?: () => void;
  /** 服务停机清理（预留；当前 pm2 硬杀场景不保证调用） */
  stop?: () => void;
  /** 设置保存后回调（管理页 PUT settings 成功时触发），可用于重新装载调度 */
  onSettingsSaved?: () => void | Promise<void>;
  /** 结构化状态（管理页轮询） */
  status: () => Promise<PluginStatus>;
  /** 手动触发；action 对应 manifest.runActions[].id */
  run?: (action: string, options?: Record<string, unknown>) => Promise<PluginRunResult>;
}
