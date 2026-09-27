import type {
  AnimapPlugin,
  PluginContext,
  PluginManifest,
  PluginRunResult,
  PluginStatus,
} from '../types';

// 数据体检：进程内巡检活动库的数据质量问题（不 spawn 外部脚本）。
// 与另外三个参考插件互补：bilibili-sync 演示外部 Python 脚本 + 定时调度，
// offsite-backup 演示 fire-and-forget bash，ai-summary 演示纯配置型，
// 本插件演示"快速 inline 任务 + DB 只读巡检"形态。
//
// 注意：events/venues 的 latitude/longitude 是 NOT NULL，不要写"缺失坐标"类检查。
// 检查项与展示语义对齐：公共列表按 status='approved' AND display_until >= NOW() 过滤。
const manifest: PluginManifest = {
  id: 'data-health',
  name: '数据体检',
  description: '巡检活动库的数据质量问题：仍在展示的过期活动、未开始却已停止展示的活动、缺失海报、组局状态异常、悬空收藏等，输出修复建议。只读检查，不改任何数据。',
  version: '1.0.0',
  scheduleHint: '开启后每天 09:00 自动巡检一次',
  settings: [
    { key: 'enabled', label: '每日自动巡检', type: 'boolean', default: false },
    {
      key: 'staleDays',
      label: '过期判定天数',
      type: 'number',
      default: 7,
      helpText: '活动结束超过 N 天且仍在展示期，视为过期残留',
    },
  ],
  runActions: [{ id: 'check', label: '立即体检' }],
};

const CHECK_HOUR = 9;
const DAILY_INTERVAL_MS = 24 * 60 * 60 * 1000;
const REPORT_LIMIT = 1000;

interface CheckResult {
  label: string;
  count: number;
  advice: string;
}

const createDataHealthPlugin = (): AnimapPlugin => {
  let ctx: PluginContext;
  let dailyTimer: NodeJS.Timeout | null = null;

  const runChecks = async (): Promise<CheckResult[]> => {
    const staleDaysRaw = Number(await ctx.settings.getRaw('staleDays'));
    const staleDays = Number.isFinite(staleDaysRaw) && staleDaysRaw > 0 ? Math.floor(staleDaysRaw) : 7;

    // 并行执行所有只读巡检
    const [staleEvents, hiddenUpcoming, missingPosterEvents, openPastSessions, orphanFavorites] = await Promise.all([
      // 已过审、结束超过 N 天、但 display_until 未到 → 仍会出现在公共列表里
      ctx.db.query(
        `SELECT COUNT(*)::int AS n FROM events
         WHERE status = 'approved'
           AND end_time < NOW() - ($1::int * interval '1 day')
           AND display_until >= NOW()`,
        [staleDays]
      ),
      // 还没开始，但 display_until 已过 → 地图上已经看不见了
      ctx.db.query(
        `SELECT COUNT(*)::int AS n FROM events
         WHERE status = 'approved' AND start_time > NOW() AND display_until < NOW()`
      ),
      ctx.db.query(
        `SELECT COUNT(*)::int AS n FROM events
         WHERE status = 'approved' AND (poster_url IS NULL OR poster_url = '')`
      ),
      ctx.db.query(
        `SELECT COUNT(*)::int AS n FROM sessions
         WHERE status = 'open' AND start_time < NOW()`
      ),
      // 收藏指向已删除的活动/店铺/组局（删除内容未级联清理时产生）
      ctx.db.query(
        `SELECT (
           (SELECT COUNT(*) FROM favorites f LEFT JOIN events e ON e.id = f.item_id WHERE f.item_type = 'event' AND e.id IS NULL)
         + (SELECT COUNT(*) FROM favorites f LEFT JOIN venues v ON v.id = f.item_id WHERE f.item_type = 'venue' AND v.id IS NULL)
         + (SELECT COUNT(*) FROM favorites f LEFT JOIN sessions s ON s.id = f.item_id WHERE f.item_type = 'session' AND s.id IS NULL)
         )::int AS n`
      ),
    ]);

    return [
      {
        label: `仍在展示的过期活动（结束 > ${staleDays} 天）`,
        count: staleEvents.rows[0].n,
        advice: '下架活动或把 display_until 调整到 end_time 附近',
      },
      {
        label: '未开始却已停止展示的活动',
        count: hiddenUpcoming.rows[0].n,
        advice: '把 display_until 改到活动结束之后，否则地图上看不见',
      },
      {
        label: '缺失海报的过审活动',
        count: missingPosterEvents.rows[0].n,
        advice: '在编辑页补传海报图',
      },
      {
        label: '已开始仍显示可报名的组局',
        count: openPastSessions.rows[0].n,
        advice: '更正 start_time 或将状态改为已取消',
      },
      {
        label: '指向已删除内容的收藏',
        count: orphanFavorites.rows[0].n,
        advice: '运行一次数据清理脚本或手动清理 favorites 表',
      },
    ];
  };

  const runCheck = async (): Promise<PluginRunResult> => {
    let results: CheckResult[];
    try {
      results = await runChecks();
    } catch (err: any) {
      await ctx.settings.setMany({
        last_run_at: new Date().toISOString(),
        last_status: 'failed',
        last_report: `巡检执行失败：${String(err?.message || err)}`.slice(0, REPORT_LIMIT),
      });
      ctx.logger.error('check failed:', err);
      return { started: true, running: false, message: '体检执行失败，详情见状态区' };
    }

    const issues = results.filter((item) => item.count > 0);
    const lines = results.map((item) =>
      `${item.count > 0 ? '⚠' : '✓'} ${item.label}：${item.count}${item.count > 0 ? `（建议：${item.advice}）` : ''}`
    );
    const summary = issues.length === 0
      ? '全部正常'
      : `发现 ${issues.length} 类问题（共 ${issues.reduce((sum, item) => sum + item.count, 0)} 条数据）`;

    await ctx.settings.setMany({
      last_run_at: new Date().toISOString(),
      last_status: issues.length === 0 ? 'success' : 'warning',
      last_report: lines.join('\n').slice(0, REPORT_LIMIT),
    });
    ctx.logger.info(`check done: ${summary}`);

    return { started: true, running: false, message: `体检完成：${summary}` };
  };

  return {
    manifest,

    setup(context) {
      ctx = context;
    },

    start() {
      const tick = async () => {
        try {
          const enabled = await ctx.settings.getRaw('enabled');
          if (enabled === 'true') {
            await runCheck();
          }
        } catch (err) {
          ctx.logger.error('scheduled tick failed:', err);
        }
      };

      // 与 bilibili-sync 相同的对齐写法：到点才读 enabled，
      // 管理页切换开关后无需重启即可生效/失效
      const now = new Date();
      const next = new Date(now);
      next.setHours(CHECK_HOUR, 0, 0, 0);
      if (next.getTime() <= now.getTime()) {
        next.setDate(next.getDate() + 1);
      }
      dailyTimer = setTimeout(() => {
        void tick();
        dailyTimer = setInterval(() => { void tick(); }, DAILY_INTERVAL_MS) as unknown as NodeJS.Timeout;
      }, next.getTime() - now.getTime());

      ctx.logger.info('已启动，开启后每天 09:00 自动巡检');
    },

    stop() {
      if (dailyTimer) {
        clearTimeout(dailyTimer);
        clearInterval(dailyTimer);
        dailyTimer = null;
      }
    },

    async status(): Promise<PluginStatus> {
      const [lastRunAt, lastStatus, lastReport] = await Promise.all([
        ctx.settings.getRaw('last_run_at'),
        ctx.settings.getRaw('last_status'),
        ctx.settings.getRaw('last_report'),
      ]);

      const tone = lastStatus === 'success' ? 'success' : lastStatus === 'warning' ? 'warning' : lastStatus === 'failed' ? 'danger' : 'normal';
      const statusLabel = lastStatus === 'success' ? '全部正常'
        : lastStatus === 'warning' ? '有问题待处理'
        : lastStatus === 'failed' ? '巡检执行失败'
        : '尚未运行';

      return {
        running: false, // inline 任务秒级完成，无需前端轮询
        fields: [
          { label: '上次体检', value: lastRunAt ? lastRunAt.replace('T', ' ').slice(0, 19) : '—' },
          { label: '结论', value: statusLabel, tone },
        ],
        detail: lastReport || undefined,
      };
    },

    async run() {
      return runCheck();
    },
  };
};

export default createDataHealthPlugin;
