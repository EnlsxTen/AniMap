// AniMap 插件装配入口。
// 内置插件：在本目录建 <plugin-id>/index.ts（导出 createPlugin 工厂）并 registerPlugin()。
// 导入插件（.ami）：运行时经 loader 装入 plugins-installed/ 目录，重启自动恢复。
// 注意：B站漫展同步已改为第一方 .ami 插件（examples/bilibili-sync-plugin/），
// 部署后需导入一次：node scripts/pack-ami.js ../examples/bilibili-sync-plugin bilibili-sync.ami
import { registerPlugin, startPlugins } from './registry';
import { loadInstalledAtBoot } from './loader';
import createOffsiteBackupPlugin from './offsite-backup';
import createAiSummaryPlugin from './ai-summary';
import createDataHealthPlugin from './data-health';

registerPlugin(createOffsiteBackupPlugin());
registerPlugin(createAiSummaryPlugin());
registerPlugin(createDataHealthPlugin());

// 服务启动统一入口：先恢复导入的插件，再启动全部插件的调度
export const startAllPlugins = () => {
  loadInstalledAtBoot();
  startPlugins();
};

export { stopPlugins } from './registry';
export default registerPlugin;
