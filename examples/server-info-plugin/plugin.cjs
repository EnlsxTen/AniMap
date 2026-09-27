// 服务器信息插件 —— .ami 导入格式的最小参考实现（纯 CommonJS，无需编译）。
// 接口与内置插件完全一致：manifest + setup(ctx) + status() + run(action)。
// 详见 docs/PLUGIN_DEVELOPMENT.md「打包与导入（.ami）」。
'use strict';

const os = require('os');

const BOOT_AT = Date.now();

const formatUptime = (seconds) => {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return (d ? `${d} 天 ` : '') + `${h} 小时 ${m} 分`;
};

module.exports = {
  manifest: require('./manifest.json'),

  setup(ctx) {
    this.__ctx = ctx;
  },

  async status() {
    const ctx = this.__ctx;
    const mem = process.memoryUsage();
    const fields = [
      { label: 'Node 版本', value: process.version },
      { label: '系统平台', value: `${os.type()} ${os.arch()}` },
      { label: '运行时长', value: formatUptime((Date.now() - BOOT_AT) / 1000) },
      { label: '进程内存', value: `${(mem.rss / 1024 / 1024).toFixed(1)} MB` },
    ];
    if (ctx) {
      // 演示 pluginDir：解析插件包自带的 banner.txt（打包时可选附加文件）
      const bannerPath = ctx.paths.pluginDir
        ? require('path').join(ctx.paths.pluginDir, 'banner.txt')
        : null;
      if (bannerPath && require('fs').existsSync(bannerPath)) {
        fields.push({ label: '包内文件', value: 'banner.txt 已就位' });
      }
      const note = await ctx.settings.getRaw('note');
      if (note) fields.push({ label: '备注', value: note });
    }
    const lastReport = ctx ? await ctx.settings.getRaw('last_report') : null;
    const lastRunAt = ctx ? await ctx.settings.getRaw('last_run_at') : null;
    return {
      running: false,
      fields: fields.concat(
        lastRunAt ? [{ label: '上次快照', value: lastRunAt.replace('T', ' ').slice(0, 19) }] : []
      ),
      detail: lastReport || undefined,
    };
  },

  async run(action) {
    const ctx = this.__ctx;
    if (!ctx) return { started: false, running: false, message: '插件尚未初始化' };
    if (action !== 'snapshot') return { started: false, running: false, message: `未知动作：${action}` };

    const mem = process.memoryUsage();
    const report = [
      `Node ${process.version} @ ${os.type()} ${os.arch()}`,
      `运行时长 ${formatUptime((Date.now() - BOOT_AT) / 1000)}`,
      `RSS ${(mem.rss / 1024 / 1024).toFixed(1)} MB / HeapUsed ${(mem.heapUsed / 1024 / 1024).toFixed(1)} MB`,
      `插件目录 ${ctx.paths.pluginDir || '(内置)'}`,
    ].join('\n');

    await ctx.settings.setMany({
      last_run_at: new Date().toISOString(),
      last_report: report,
    });
    return { started: true, running: false, message: '快照已生成，见状态区详情' };
  },
};
