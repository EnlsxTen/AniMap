# AniMap 插件开发指南

本文是 AniMap 后端插件系统的标准开发文档。插件用于承载**可选的、相对独立的小功能**（如 B站漫展同步、异地备份、AI 活动简介），与核心业务（活动/店铺/组局/用户）解耦。

> 相关代码：`backend/src/plugins/`（框架 + 内置插件）、`frontend/src/components/PluginCard.tsx`（通用管理卡片）。

---

## 1. 核心概念

一个插件 = 一个目录 + 一个工厂函数 + 一份 manifest 声明。

```
backend/src/plugins/
  types.ts               # 插件契约（接口定义，勿改）
  context.ts             # 核心注入的运行环境实现
  registry.ts            # 注册/发现/启动/注销
  loader.ts              # .ami 导入/卸载/启动恢复
  routes.ts              # 通用管理路由 /api/plugins/*（含导入与卸载）
  index.ts               # 装配入口：在这里注册内置插件
  offsite-backup/        # 参考实现 1（内置）：SSH 推送异地备份（ssh2），进程内调度
    index.ts
  ai-summary/            # 参考实现 2（内置）：纯配置 + spawn 回填脚本
    index.ts
  data-health/           # 参考实现 3（内置）：进程内 DB 只读巡检（inline 快速任务）
    index.ts

examples/                # 第一方 .ami 插件包源码（打包后经管理页导入）
  server-info-plugin/    # 最小示例：运行时信息展示
  bilibili-sync-plugin/  # 完整示例：B站漫展同步（spawn Python + 每日调度）

backend/plugins-installed/   # .ami 导入插件的安装目录（运行时状态，已 gitignore）
```

系统启动时（`server.ts` → `startAllPlugins()`）先恢复 `plugins-installed/` 里的导入插件，再依次调用内置插件的 `setup(ctx)` 和 `start()`。

> **B站漫展同步现为第一方 .ami 插件**：源码在 `examples/bilibili-sync-plugin/`，部署时需打包导入一次
> （`node scripts/pack-ami.js ../examples/bilibili-sync-plugin bilibili-sync.ami` → 管理页导入）。
> 其 settings 键 `plugin.bilibili-sync.*` 与旧内置版本完全一致，升级部署不丢配置。

## 2. 最小插件骨架

```ts
// backend/src/plugins/my-plugin/index.ts
import type { AnimapPlugin, PluginContext, PluginManifest, PluginRunResult, PluginStatus } from '../types';

const manifest: PluginManifest = {
  id: 'my-plugin',                    // 全局唯一，小写中划线
  name: '我的插件',
  description: '一句话说明用途。',
  version: '1.0.0',
  scheduleHint: '每日 02:00 自动执行',  // 纯展示，可省略
  settings: [                         // 声明式设置 schema，驱动管理页表单
    { key: 'enabled', label: '启用', type: 'boolean', default: false },
    { key: 'max_items', label: '处理上限', type: 'number', default: 10 },
    { key: 'mode', label: '模式', type: 'select', default: 'fast',
      options: [{ value: 'fast', label: '快速' }, { value: 'full', label: '完整' }] },
    { key: 'token', label: '访问令牌', type: 'secret' },
  ],
  runActions: [{ id: 'run', label: '立即执行' }],   // 手动运行按钮，可多个
};

const createMyPlugin = (): AnimapPlugin => {
  let ctx: PluginContext;             // setup 时注入，闭包持有

  return {
    manifest,

    setup(context) { ctx = context; },

    start() { /* 注册定时器（可选） */ },
    stop()  { /* 清理定时器（可选） */ },

    async status(): Promise<PluginStatus> {
      return {
        running: ctx.isSlotRunning('run'),           // true 时前端自动 5s 轮询
        fields: [
          { label: '上次运行', value: (await ctx.settings.getRaw('last_run_at')) || '—' },
        ],
        detail: '可放日志尾部等长文本',
      };
    },

    async run(action: string): Promise<PluginRunResult> {
      const handle = ctx.spawnScript({
        slot: 'run',                    // 同名 slot 自动防并发
        command: 'python3',
        args: ['/path/to/script.py'],
        env: { ...process.env, MY_TOKEN: (await ctx.settings.getRaw('token')) || '' },
        onExit: async (code, output) => {           // 已内建 try/catch，可安全 await 写库
          await ctx.settings.setMany({
            last_run_at: new Date().toISOString(),
            last_status: code === 0 ? 'success' : 'failed',
            last_message: output.slice(-1000),
          });
        },
      });
      return { started: handle.started, running: handle.isRunning(), message: handle.started ? '已开始' : '已在运行中' };
    },
  };
};

export default createMyPlugin;
```

然后在 `backend/src/plugins/index.ts` 注册：

```ts
import createMyPlugin from './my-plugin';
registerPlugin(createMyPlugin());
```

完成。路由、权限、设置存储、管理页 UI 全部自动获得，无需额外代码。

## 3. Manifest 字段说明

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | ✓ | 全局唯一。用于路由 `/api/plugins/:id` 与 settings 键前缀 `plugin.<id>.`。**小写字母、数字、中划线** |
| `name` / `description` / `version` | ✓ | 管理页展示 |
| `scheduleHint` | | 调度说明文案（纯展示；实际调度由插件 `start()` 或系统 cron 实现） |
| `settings` | ✓（可为空数组） | 设置字段 schema，见下表 |
| `runActions` | | 手动运行按钮列表 `{ id, label, danger? }`；`danger: true` 的按钮标红（用于会写库的动作） |

### 3.1 设置字段类型与前端控件

| type | 存储值 | 前端控件 | 校验 |
|---|---|---|---|
| `boolean` | `'true'` / `'false'` | 开关 | 只接受 true/false |
| `string` | 原文 | 文本输入框 | ≤500 字符 |
| `number` | 十进制字符串 | 数字输入框 | 正整数 |
| `select` | 原文 | 下拉框 | 必须命中 options |
| `secret` | 原文 | 密码框 + 脱敏回显 | ≤500 字符；空值=保留原值；传 `'__CLEAR__'`=删除 |

**约定**：`settings.get()` 读出时会做类型还原（`'true'/'false'` → boolean、纯数字字符串 → number），需要原始字符串时用 `settings.getRaw()`。

## 4. PluginContext 能力清单

| 能力 | 用途 |
|---|---|
| `ctx.settings.get / getRaw / getAll / set / setMany / remove` | 命名空间 KV 存储，键自动加前缀 `plugin.<id>.`，写 settings 表 |
| `ctx.logger.info / warn / error` | 带统一前缀 `[plugin:<id>]` 的日志 |
| `ctx.db` | PostgreSQL 连接池（与核心共用） |
| `ctx.spawnScript({ slot, command, args, cwd, env, onExit, fireAndForget })` | 运行外部脚本。同名 slot 防并发；stdout/stderr 保留尾部 3000 字符；`onExit(code, outputTail)` 内部已 try/catch，回调里可以安全 await 写库；`fireAndForget: true` 用于长时间脱离进程（bash 备份类） |
| `ctx.isSlotRunning(slot)` | 查询 slot 是否有进程在运行（status().running 用它） |
| `ctx.invalidatePublicCache('events' \| 'venues' \| 'sessions' \| 'venueRelated')` | 写入公共数据后失效 Redis 缓存 |
| `ctx.capabilities.reconcileUploadsToR2()` | 扫描本地 uploads，把缺失的 webp 变体生成并补传 R2（爬虫下载海报后必调，否则前端 CDN 模式图片 404） |
| `ctx.paths.projectRoot / uploadDir / resolveScript(candidates)` | 路径解析；`resolveScript` 按候选顺序返回第一个存在的路径 |
| `ctx.readEnvFile(path)` | 解析 `KEY=VALUE` 格式的 env 文件（如爬虫的 `.events_sync.env`） |

## 5. 生命周期与路由

```
server 启动
  └─ startPlugins()
       └─ 每个插件: setup(ctx) → start()
            （start 里自行 setTimeout/setInterval；参考 bilibili-sync 的"对齐到每日 3 点"写法）

管理请求（全部要求 admin JWT）
  GET  /api/plugins                  → 所有插件的 manifest + 设置值(secret 脱敏) + status
  GET  /api/plugins/:id/status       → 单插件 status（前端 running 时每 5s 轮询）
  PUT  /api/plugins/:id/settings     → 按 manifest.settings 校验并保存，body 为 { key: value }
                                        （保存成功后调用 plugin.onSettingsSaved?()，可重载调度）
  POST /api/plugins/:id/run          → body { action?, options? }，路由到 plugin.run(action, options)
```

**状态契约（前端依赖）**：
- `status().running === true` → 卡片显示"运行中"并自动 5 秒轮询，直到 running 变 false；
- `fields` 是键值对列表（`{ label, value, tone? }`），tone 取 `normal/success/warning/danger` 决定颜色；
- `detail` 可选，以等宽字体折叠展示（放日志尾部）；
- `run(action)` 返回 `{ started, running, message }`，`message` 直接展示给管理员。

## 6. 设置键迁移（改 key 名时）

settings 存储键格式为 `plugin.<id>.<field>`。如果改动字段名或从旧散装 key 迁移，在 `backend/src/database/migrate.ts` 的 `settingKeyRenames` 数组里加一行：

```ts
['old_key_name', 'plugin.my-plugin.new_field'],
```

迁移语句幂等（目标键已存在则跳过），可安全重复执行。**部署时必须运行 `npm run migrate`**，否则旧配置读不到（会回落到默认值）。

## 7. 安全红线

1. **路由权限**：`/api/plugins/*` 已整体挂 `authMiddleware + requireRole(['admin'])`，不要在插件里另开公开接口。
2. **环境变量白名单**：spawn 子进程时显式构造 env（`{ ...process.env, KEY: value }` 是现状做法；如果子进程来自外部/不可信来源，改为逐键挑选）。
3. **脚本路径**：外部脚本路径只允许来自「插件代码内的候选列表 / 环境变量 / 管理员设置」，且 spawn 前必须 `fs.existsSync` 校验。不要让普通用户输入拼接进路径。
4. **settings 值不进 SQL/命令行**：所有 settings 读写走参数化查询；不要把设置值拼进 shell 命令字符串（spawn 用数组参数，不用 shell）。
5. **不要直写业务表**：插件写库建议只写自己的 settings 键与日志表。当前 bilibili 爬虫直写 events 表是历史遗留特例，新插件应优先走核心 API 或与核心约定的导入接口，避免绕过审核/缓存逻辑。
6. **退出回调安全**：`onExit` 里做 async 写库是允许的（context 已 try/catch 包裹），但不要在回调里做无超时的外部请求。

## 8. 调试与构建

```bash
# 后端类型检查 + 编译（产物在 dist/）
cd backend && npm run build

# 本地起后端（需要 .env 里的 DB 配置；插件列表接口需要 admin token）
npm run dev

# 手动验证
curl -H "Authorization: Bearer <admin-token>" http://localhost:3001/api/plugins

# 迁移（改名 key 时）
npm run migrate

# 前端构建
cd frontend && npm run build
```

管理页（admin 登录 → 商家中心 → 站点设置）会出现插件的通用卡片，可验证表单/保存/运行/轮询是否正常。

## 9. 打包与导入（.ami 格式）

除了内置在代码里，插件也可以打成 `.ami` 包，由管理员在后台直接导入——不需要改核心代码、不需要重新部署。

### 9.1 包格式

`.ami` 文件就是 **zip 包改后缀**，根目录结构：

```
manifest.json    必需。与内置插件同构的清单（见 §3），但必须与 plugin.cjs 分开提供
plugin.cjs       必需。CommonJS 插件实现，module.exports = { manifest, setup, status, run?, start?, stop?, onSettingsSaved? }
其他文件          可选。插件自带的脚本/资源（shell/python/数据文件等）
```

与内置插件的两点差异：
- 语言是 **纯 JavaScript（CommonJS）**，不是 TypeScript——不经过后端 tsc 编译；
- `manifest` 必须同时存在于 `manifest.json`（加载以此为准）。

`plugin.cjs` 可以直接导出对象，也可以导出工厂函数 `() => plugin`（推荐工厂，可用闭包持有 ctx）。最小示例见仓库 `examples/server-info-plugin/`。

### 9.2 打包

```bash
cd backend
node scripts/pack-ami.js <插件目录> [输出.ami]
# 例：node scripts/pack-ami.js ../examples/server-info-plugin server-info.ami
```

### 9.3 导入与卸载

- 管理页（站点设置 → 插件管理 →「导入插件 (.ami)」）或接口 `POST /api/plugins/import`（multipart 字段名 `plugin`，≤10MB）；
- 导入时后端校验 manifest、防护 zip-slip，解压到 `backend/plugins-installed/<id>/` 并**立即加载生效**；
- **服务重启后自动恢复加载**已导入的插件（单个损坏的包会被跳过并记录日志，不影响其他插件）；
- 卸载：`DELETE /api/plugins/:id` 或导入插件卡片上的卸载按钮——停止定时器、移出注册表、删除安装目录；**settings 键保留**，重新导入同名插件后配置自动恢复；
- 冲突处理：id 与内置插件或已导入插件重复时拒绝导入；内置插件永远不可被卸载。

### 9.4 安全声明（必读）

**导入的插件与内置插件权限完全相同**：进程内运行，可访问数据库、文件系统、环境变量与网络。当前 Node 生态没有可靠的进程内 JS 沙箱，因此：

1. 导入/卸载接口仅限 **admin** 角色；
2. 前端导入时会弹出风险确认（"插件将以服务器完整权限运行"）；
3. **只安装来自可信来源的插件包**——导入一个恶意 .ami 等同于把服务器交给它的作者；
4. 插件包内的脚本若需调用（spawnScript），使用安装目录内的相对路径（`ctx.paths.pluginDir`），不要引用包外路径。

### 9.5 导入插件的调试

```bash
# 后端日志会输出加载/恢复结果：
# [plugins] imported: <id> vX.Y.Z -> <安装目录>
# [plugins] restored imported plugin: <id> vX.Y.Z   （重启恢复）
# [plugins] restore failed for <dir>: <原因>        （损坏包被跳过）

# 手动检查安装目录
ls backend/plugins-installed/<id>/

# node 直接验证语法（不经服务器）
node -e "const p = require('<安装目录>/plugin.cjs'); console.log(typeof p.setup, typeof p.status)"
```

## 10. 已知边界与后续演进

- 插件注册是**编译期静态**的（在 `plugins/index.ts` import），改动插件代码需要重新构建后端。运行时热加载（扫描目录动态 import）暂不支持——对单服务器部署而言收益小于复杂度。
- `stop()` 是预留接口：当前 pm2 硬杀场景下不保证被调用，定时器泄漏无实际影响。
- 如果未来插件数量显著增长，可以把 settings 校验/存储从 routes.ts 抽成独立模块，并考虑给插件增加独立的日志表。
