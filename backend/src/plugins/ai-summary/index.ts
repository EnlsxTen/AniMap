import fs from 'fs';
import path from 'path';
import type {
  AnimapPlugin,
  PluginContext,
  PluginManifest,
  PluginRunResult,
  PluginStatus,
} from '../types';

const manifest: PluginManifest = {
  id: 'ai-summary',
  name: 'AI 活动简介',
  description: '用 OpenAI 兼容接口为缺少简介的已过审活动自动生成描述。配置由本插件管理，回填脚本从环境变量读取。',
  version: '1.0.0',
  scheduleHint: '手动触发（也可在服务器上单独 cron 运行回填脚本）',
  settings: [
    { key: 'enabled', label: '启用', type: 'boolean', default: false, helpText: '当前为标记位：回填动作是否受此开关约束由脚本侧策略决定' },
    {
      key: 'baseUrl',
      label: 'API Base URL',
      type: 'string',
      default: 'https://api.openai.com/v1',
      helpText: 'OpenAI 兼容接口地址，末尾斜杠会自动去除',
    },
    {
      key: 'apiKey',
      label: 'API Key',
      type: 'secret',
      helpText: '保存后仅显示脱敏值；清空输入框 = 保留原值，点“清除”删除',
    },
    { key: 'model', label: '模型', type: 'string', default: 'gpt-4o-mini' },
  ],
  runActions: [
    { id: 'dry-run', label: '试运行' },
    { id: 'apply', label: '实际回填', danger: true },
  ],
};

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';

const createAiSummaryPlugin = (): AnimapPlugin => {
  let ctx: PluginContext;

  const resolveScriptPath = (): string => {
    const candidates = [
      path.resolve(ctx.paths.projectRoot, 'scripts/backfill_ai_event_descriptions.py'),
      path.resolve(process.cwd(), '../scripts/backfill_ai_event_descriptions.py'),
      path.resolve(process.cwd(), 'scripts/backfill_ai_event_descriptions.py'),
      path.resolve(__dirname, '../../../scripts/backfill_ai_event_descriptions.py'),
      path.resolve(__dirname, '../../scripts/backfill_ai_event_descriptions.py'),
    ];
    return ctx.paths.resolveScript(candidates) || candidates[0];
  };

  const resolvePythonPath = (): string => {
    if (process.env.AI_BACKFILL_PYTHON) return process.env.AI_BACKFILL_PYTHON;
    const scriptDir = path.dirname(resolveScriptPath());
    const candidates = [
      path.join(scriptDir, 'venv/bin/python'),
      path.join(scriptDir, '.venv-events-sync/bin/python'),
      'python3',
      'python',
    ];
    // 候选既可能是绝对路径也可能是"裸命令"（如 python3），只对前者做存在性检查，
    // 否则裸命令会被当成不存在的文件直接跳过
    const isBareCommand = (candidate: string) => !candidate.includes('/');
    return candidates.find((candidate) => isBareCommand(candidate) || fs.existsSync(candidate)) || 'python3';
  };

  return {
    manifest,

    setup(context) {
      ctx = context;
    },

    async status(): Promise<PluginStatus> {
      const [baseUrl, model, apiKey, lastRunAt, lastStatus, lastMessage] = await Promise.all([
        ctx.settings.getRaw('baseUrl'),
        ctx.settings.getRaw('model'),
        ctx.settings.getRaw('apiKey'),
        ctx.settings.getRaw('last_run_at'),
        ctx.settings.getRaw('last_status'),
        ctx.settings.getRaw('last_message'),
      ]);

      const effectiveBaseUrl = baseUrl || process.env.AI_SUMMARY_BASE_URL || DEFAULT_BASE_URL;
      const effectiveModel = model || process.env.AI_SUMMARY_MODEL || DEFAULT_MODEL;
      const hasKey = Boolean(apiKey || process.env.AI_SUMMARY_API_KEY || process.env.OPENAI_API_KEY);
      const scriptExists = fs.existsSync(resolveScriptPath());
      const running = ctx.isSlotRunning('backfill');

      const tone = lastStatus === 'success' ? 'success' : lastStatus === 'failed' ? 'danger' : 'normal';
      const statusLabel = running ? '运行中' : lastStatus === 'success' ? '成功' : lastStatus === 'failed' ? '失败' : '尚未运行';

      return {
        running,
        fields: [
          { label: 'API', value: effectiveBaseUrl, tone: effectiveBaseUrl.startsWith('https://') ? 'normal' : 'warning' },
          { label: '模型', value: effectiveModel },
          { label: 'API Key', value: hasKey ? '已配置' : '未配置', tone: hasKey ? 'success' : 'danger' },
          { label: '回填脚本', value: scriptExists ? '已就绪' : '未找到', tone: scriptExists ? 'success' : 'danger' },
          { label: '上次回填', value: lastRunAt ? lastRunAt.replace('T', ' ').slice(0, 19) : '—' },
          { label: '状态', value: statusLabel, tone },
        ],
        detail: lastMessage || undefined,
      };
    },

    async run(action): Promise<PluginRunResult> {
      if (action !== 'dry-run' && action !== 'apply') {
        return { started: false, running: false, message: `未知动作：${action}` };
      }

      if (ctx.isSlotRunning('backfill')) {
        return { started: false, running: true, message: 'AI 回填正在运行中' };
      }

      const scriptPath = resolveScriptPath();
      if (!fs.existsSync(scriptPath)) {
        const message = `回填脚本不存在：${scriptPath}`;
        await ctx.settings.setMany({ last_run_at: new Date().toISOString(), last_status: 'failed', last_message: message });
        return { started: false, running: false, message };
      }

      const [baseUrl, model, apiKey] = await Promise.all([
        ctx.settings.getRaw('baseUrl'),
        ctx.settings.getRaw('model'),
        ctx.settings.getRaw('apiKey'),
      ]);

      const env = {
        ...process.env,
        AI_SUMMARY_BASE_URL: baseUrl || process.env.AI_SUMMARY_BASE_URL || DEFAULT_BASE_URL,
        AI_SUMMARY_API_KEY: apiKey || process.env.AI_SUMMARY_API_KEY || process.env.OPENAI_API_KEY || '',
        AI_SUMMARY_MODEL: model || process.env.AI_SUMMARY_MODEL || DEFAULT_MODEL,
      };

      const args = [scriptPath];
      if (action === 'apply') args.push('--apply');

      ctx.logger.info(`backfill ${action} started`);
      ctx.spawnScript({
        slot: 'backfill',
        command: resolvePythonPath(),
        args,
        cwd: path.dirname(scriptPath),
        env,
        onExit: async (code, output) => {
          const exitCode = code ?? -1;
          const friendly = !output.trim() && exitCode < 0
            ? `回填进程启动失败（code=${exitCode}）：找不到可执行的命令，通常是 Python 解释器未安装或不在 PATH`
            : '';
          await ctx.settings.setMany({
            last_run_at: new Date().toISOString(),
            last_status: exitCode === 0 ? 'success' : 'failed',
            last_message: (friendly || output.trim() || `回填进程退出，code=${exitCode}`).slice(-1000),
          });
          ctx.logger.info(`backfill ${action} ${exitCode === 0 ? 'success' : 'failed'}`);
        },
      });

      return {
        started: true,
        running: true,
        message: action === 'apply' ? 'AI 回填已开始（将实际写入活动简介）' : 'AI 回填试运行已开始（不写库）',
      };
    },
  };
};

export default createAiSummaryPlugin;
