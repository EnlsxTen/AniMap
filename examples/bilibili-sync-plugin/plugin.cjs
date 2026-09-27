// B站漫展同步插件 —— .ami 导入形式（纯 CommonJS，无需编译）。
// 由内置 TS 版本（backend/src/plugins/bilibili-sync，已移除）移植而来，行为与设置键完全一致：
// settings 键仍为 plugin.bilibili-sync.*，跨"内置 ↔ 导入"迁移不丢配置。
// 爬虫本体：仓库 scripts/sync_events.py（Python，直写 events 表 + 海报下载）。
'use strict';

const fs = require('fs');
const path = require('path');

const DAILY_INTERVAL_MS = 24 * 60 * 60 * 1000;
const SYNC_HOUR = 3;

module.exports = function createBilibiliSyncPlugin() {
  let ctx;
  let dailyTimer = null;

  // 脚本路径：插件设置 → 环境变量 → 默认候选探测
  const resolveScriptPath = async () => {
    const fromSettings = await ctx.settings.getRaw('scriptPath');
    if (fromSettings && fromSettings.trim()) return fromSettings.trim();
    if (process.env.BILIBILI_SYNC_SCRIPT) return process.env.BILIBILI_SYNC_SCRIPT;

    const candidates = [
      path.resolve(ctx.paths.projectRoot, 'scripts/sync_events.py'),
      path.resolve(process.cwd(), '../scripts/sync_events.py'),
      path.resolve(process.cwd(), 'scripts/sync_events.py'),
    ];
    return ctx.paths.resolveScript(candidates) || candidates[0];
  };

  const resolvePythonPath = async () => {
    const fromSettings = await ctx.settings.getRaw('pythonPath');
    if (fromSettings && fromSettings.trim()) return fromSettings.trim();
    if (process.env.BILIBILI_SYNC_PYTHON) return process.env.BILIBILI_SYNC_PYTHON;

    const scriptDir = path.dirname(await resolveScriptPath());
    // Windows 下 venv 布局是 Scripts/python.exe，且系统命令通常只有 python（python3 多为不可 spawn 的 Store 别名）
    const candidates = process.platform === 'win32'
      ? [
          path.join(scriptDir, 'venv/Scripts/python.exe'),
          path.join(scriptDir, '.venv-events-sync/Scripts/python.exe'),
          'python',
          'python3',
        ]
      : [
          path.join(scriptDir, 'venv/bin/python'),
          path.join(scriptDir, '.venv-events-sync/bin/python'),
          'python3',
          'python',
        ];
    // 注意：Windows 的 path.join 产生反斜杠路径，"裸命令"判断必须同时排除两种分隔符，
    // 否则 venv 候选会被当成命令直接选中，跳过存在性检查导致 spawn ENOENT
    const isBareCommand = (candidate) => !candidate.includes('/') && !candidate.includes('\\');
    return candidates.find((candidate) => isBareCommand(candidate) || fs.existsSync(candidate)) || 'python';
  };

  // 环境变量组装：进程 env → 脚本目录 .events_sync.env → 默认值
  const buildEnv = (scriptPath) => {
    const scriptEnv = ctx.readEnvFile(
      process.env.BILIBILI_SYNC_ENV_FILE || path.join(path.dirname(scriptPath), '.events_sync.env')
    );
    const merged = { ...process.env, ...scriptEnv };

    return {
      ...merged,
      DB_HOST: process.env.BILIBILI_SYNC_DB_HOST || merged.DB_HOST || '127.0.0.1',
      DB_PORT: process.env.BILIBILI_SYNC_DB_PORT || merged.DB_PORT || '5432',
      DB_NAME: process.env.BILIBILI_SYNC_DB_NAME || merged.DB_NAME || 'animap',
      DB_USER: process.env.BILIBILI_SYNC_DB_USER || merged.DB_USER || 'system',
      AMAP_WEB_SERVICE_KEY: process.env.BILIBILI_SYNC_AMAP_KEY || merged.AMAP_WEB_SERVICE_KEY || '',
      ANIMAP_IMPORT_USER_ID: process.env.BILIBILI_SYNC_IMPORT_USER_ID || merged.ANIMAP_IMPORT_USER_ID || '',
      ANIMAP_UPLOAD_DIR: merged.ANIMAP_UPLOAD_DIR || ctx.paths.uploadDir,
      EVENT_SCOPE: process.env.BILIBILI_SYNC_EVENT_SCOPE || merged.EVENT_SCOPE || 'convention',
    };
  };

  const runSync = async (trigger) => {
    if (ctx.isSlotRunning('sync')) {
      return { started: false, running: true, message: 'B站同步正在运行中' };
    }

    const scriptPath = await resolveScriptPath();
    if (!fs.existsSync(scriptPath)) {
      const message = `B站同步脚本不存在：${scriptPath}`;
      await ctx.settings.setMany({
        last_run_at: new Date().toISOString(),
        last_status: 'failed',
        last_message: message,
      });
      return { started: false, running: false, message };
    }

    const env = buildEnv(scriptPath);
    const scopeSetting = await ctx.settings.getRaw('eventScope');
    const eventScope = scopeSetting || env.EVENT_SCOPE || 'convention';
    const maxPagesSetting = await ctx.settings.getRaw('maxPages');
    const maxPages = maxPagesSetting || process.env.BILIBILI_SYNC_MAX_PAGES || '5';

    ctx.logger.info(`${trigger} sync started`);
    ctx.spawnScript({
      slot: 'sync',
      command: await resolvePythonPath(),
      args: [scriptPath, '--event-scope', eventScope, '--max-pages', maxPages],
      cwd: path.dirname(scriptPath),
      env,
      onExit: async (code, output) => {
        const status = code === 0 ? 'success' : 'failed';
        let message = (output.trim() || '').slice(-1000);
        if (!message) {
          // 负数退出码通常是进程启动失败：Windows ENOENT(-4058) = 找不到命令
          message = code < 0
            ? `同步进程启动失败（code=${code}）：找不到可执行的命令，通常是 Python 解释器未安装或不在 PATH，可在插件设置里手动指定解释器路径`
            : `同步进程退出，code=${code}`;
        }

        // 成功后把新下载的海报对账到 R2（生成 webp 变体并上传），
        // 否则前端 CDN 模式会因 R2 缺文件而图片 404。必须在标记完成前做完，避免与下次同步并发。
        if (code === 0) {
          try {
            const r = await ctx.capabilities.reconcileUploadsToR2({ verbose: true });
            if (r.reconciled > 0) {
              message = `${message}\n[R2对账] 补全 ${r.reconciled} 张图片（${r.uploaded} 个变体）`.slice(-1000);
            }
            if (r.failed > 0) {
              message = `${message}\n[R2对账] ${r.failed} 张失败`.slice(-1000);
            }
          } catch (err) {
            ctx.logger.error('R2 对账失败:', (err && err.message) || err);
            message = `${message}\n[R2对账] 异常: ${(err && err.message) || err}`.slice(-1000);
          }
        }

        await ctx.settings.setMany({
          last_run_at: new Date().toISOString(),
          last_status: status,
          last_message: message,
        });
        if (code === 0) {
          ctx.invalidatePublicCache('events');
        }
        ctx.logger.info(`${trigger} sync ${status}`);
      },
    });

    return { started: true, running: true, message: 'B站同步已开始' };
  };

  return {
    setup(context) {
      ctx = context;
    },

    start() {
      const tick = async () => {
        try {
          const enabled = await ctx.settings.getRaw('enabled');
          if (enabled === 'true') {
            await runSync('schedule');
          }
        } catch (err) {
          ctx.logger.error('scheduled tick failed:', err);
        }
      };

      // 到点才读 enabled，管理页切换开关后无需重启即可生效/失效
      const now = new Date();
      const next = new Date(now);
      next.setHours(SYNC_HOUR, 0, 0, 0);
      if (next.getTime() <= now.getTime()) {
        next.setDate(next.getDate() + 1);
      }
      dailyTimer = setTimeout(() => {
        void tick();
        dailyTimer = setInterval(() => { void tick(); }, DAILY_INTERVAL_MS);
      }, next.getTime() - now.getTime());

      ctx.logger.info(`已启动，开启后每天 ${SYNC_HOUR}:00 同步一次`);
    },

    stop() {
      if (dailyTimer) {
        clearTimeout(dailyTimer);
        clearInterval(dailyTimer);
        dailyTimer = null;
      }
    },

    async status() {
      const [lastRunAt, lastStatus, lastMessage] = await Promise.all([
        ctx.settings.getRaw('last_run_at'),
        ctx.settings.getRaw('last_status'),
        ctx.settings.getRaw('last_message'),
      ]);
      const running = ctx.isSlotRunning('sync');

      const tone = lastStatus === 'success' ? 'success' : lastStatus === 'failed' ? 'danger' : 'normal';
      const statusLabel = running
        ? '运行中'
        : lastStatus === 'success' ? '成功'
        : lastStatus === 'failed' ? '失败'
        : '尚未运行';

      return {
        running,
        fields: [
          { label: '上次运行', value: lastRunAt ? lastRunAt.replace('T', ' ').slice(0, 19) : '—' },
          { label: '状态', value: statusLabel, tone },
        ],
        detail: lastMessage || undefined,
      };
    },

    async run() {
      return runSync('manual');
    },
  };
};
