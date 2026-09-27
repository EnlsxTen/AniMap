import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getErrorLog, clearErrorLog } from '../utils/errorLogger';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Image as ImageIcon,
  LayoutGrid,
  Loader2,
  PackagePlus,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import { HomeFabSettings, PluginView, PublicCacheStats, pluginsService, settingsService } from '../services/settingsService';
import { getApiErrorMessage, getImageUrl } from '../utils/helpers';
import AnimatedPage from '../components/AnimatedPage';
import NavHeader from '../components/NavHeader';
import PluginCard from '../components/PluginCard';
import ScrollToTop from '../components/ScrollToTop';

const AdminSettings: React.FC = () => {
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [plugins, setPlugins] = useState<PluginView[] | null>(null);
  const [pluginsLoading, setPluginsLoading] = useState(true);
  const [pluginsError, setPluginsError] = useState('');
  const [importing, setImporting] = useState(false);
  const [confirmImport, setConfirmImport] = useState<{ file: File; fileName: string; size: number } | null>(null);
  const [confirmUninstall, setConfirmUninstall] = useState<PluginView | null>(null);
  const [cacheStats, setCacheStats] = useState<PublicCacheStats | null>(null);
  const [cacheLoading, setCacheLoading] = useState(false);
  const [cacheError, setCacheError] = useState('');
  const [thumbnailResult, setThumbnailResult] = useState<{ missing: number; total: number; message: string; detail?: string } | null>(null);
  const [thumbnailLoading, setThumbnailLoading] = useState(false);
  const [thumbnailChecking, setThumbnailChecking] = useState(false);
  const [fabConfig, setFabConfig] = useState<HomeFabSettings | null>(null);
  const [fabSaving, setFabSaving] = useState<keyof HomeFabSettings | null>(null);
  const [fabError, setFabError] = useState('');
  const [fabMessage, setFabMessage] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadBg = async () => {
    try {
      const res = await settingsService.getAuthBg();
      setBgUrl(res.url);
    } catch {
      /* ignore public visual setting failures */
    }
  };

  const loadPlugins = useCallback(async () => {
    setPluginsLoading(true);
    try {
      const list = await pluginsService.list();
      setPlugins(list);
      setPluginsError('');
    } catch (err) {
      setPluginsError(getApiErrorMessage(err, '获取插件列表失败'));
    } finally {
      setPluginsLoading(false);
    }
  }, []);

  // 选择 .ami 文件 → 弹风险确认（真正的上传在确认后执行）
  const handleImportPlugin = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setPluginsError('插件包不能超过 10MB');
      return;
    }
    setConfirmImport({ file, fileName: file.name, size: file.size });
  };

  const doImport = async () => {
    if (!confirmImport) return;
    setImporting(true);
    setPluginsError('');
    try {
      const result = await pluginsService.import(confirmImport.file);
      setConfirmImport(null);
      await loadPlugins();
      setPluginsError(''); // 清除可能的旧错误
      window.alert(result.message);
    } catch (err) {
      setPluginsError(getApiErrorMessage(err, '导入插件失败'));
    } finally {
      setImporting(false);
    }
  };

  const requestUninstall = (plugin: PluginView) => setConfirmUninstall(plugin);

  const doUninstall = async () => {
    if (!confirmUninstall) return;
    const target = confirmUninstall;
    setConfirmUninstall(null);
    try {
      const result = await pluginsService.uninstall(target.id);
      await loadPlugins();
      window.alert(result.message);
    } catch (err) {
      setPluginsError(getApiErrorMessage(err, '卸载插件失败'));
    }
  };

  const loadCacheStats = async () => {
    setCacheLoading(true);
    try {
      const res = await settingsService.getCacheStats();
      setCacheStats(res);
      setCacheError('');
    } catch (err) {
      setCacheError(getApiErrorMessage(err, '获取 Redis 缓存状态失败'));
    } finally {
      setCacheLoading(false);
    }
  };

  const loadHomeFab = async () => {
    try {
      const res = await settingsService.getHomeFab();
      setFabConfig(res);
    } catch {
      /* ignore background refresh failures */
    }
  };

  useEffect(() => {
    loadBg();
    void loadPlugins();
    loadCacheStats();
    loadHomeFab();
    // 仅挂载时加载一次；各 load 函数引用每次渲染都会变化，不能放进依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError('图片大小不能超过 10MB');
      return;
    }

    setError('');
    setMessage('');
    setUploading(true);
    try {
      const res = await settingsService.updateAuthBg(file);
      setBgUrl(res.url);
      setMessage('背景图更新成功');
    } catch (err) {
      setError(getApiErrorMessage(err, '上传失败'));
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('确定要删除登录背景图吗？删除后将使用默认背景。')) return;
    setError('');
    setMessage('');
    setDeleting(true);
    try {
      await settingsService.deleteAuthBg();
      setBgUrl(null);
      setMessage('背景图已删除，将使用默认背景');
    } catch (err) {
      setError(getApiErrorMessage(err, '删除失败'));
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleFab = async (key: keyof HomeFabSettings) => {
    if (!fabConfig || fabSaving) return;
    const next = { ...fabConfig, [key]: !fabConfig[key] };
    setFabSaving(key);
    setFabError('');
    setFabMessage('');
    try {
      const res = await settingsService.updateHomeFab(next);
      setFabConfig({ event: res.event, venue: res.venue, session: res.session, dance: res.dance });
      setFabMessage(res.message);
    } catch (err) {
      setFabError(getApiErrorMessage(err, '更新主页发布按钮设置失败'));
    } finally {
      setFabSaving(null);
    }
  };

  const handleCheckThumbnails = async () => {
    setThumbnailLoading(true);
    setThumbnailChecking(true);
    setThumbnailResult(null);
    try {
      const res = await settingsService.checkMissingThumbnails();
      setThumbnailResult({
        total: res.total,
        missing: res.missing,
        message: res.missing > 0
          ? `发现 ${res.missing} 张图片缺少缩略图（共 ${res.total} 张原始图片）`
          : `所有 ${res.total} 张图片缩略图完整`,
        detail: res.missing > 0 ? `缺失文件：${res.files.slice(0, 5).join('、')}${res.files.length > 5 ? ` 等 ${res.files.length} 个` : ''}` : undefined,
      });
    } catch (err: any) {
      setThumbnailResult({ total: 0, missing: 0, message: getApiErrorMessage(err, '检查失败') });
    } finally {
      setThumbnailLoading(false);
      setThumbnailChecking(false);
    }
  };

  const handleRegenerateThumbnails = async () => {
    setThumbnailLoading(true);
    setThumbnailChecking(false);
    try {
      const res = await settingsService.regenerateThumbnails();
      setThumbnailResult({
        total: res.total,
        missing: res.errors > 0 ? 1 : 0,
        message: res.errors > 0
          ? `已修复 ${res.processed} 张，${res.errors} 张失败，${res.skipped} 张已有缩略图`
          : `已修复 ${res.processed} 张图片，${res.skipped} 张已有缩略图`,
      });
    } catch (err: any) {
      setThumbnailResult({ total: 0, missing: 0, message: getApiErrorMessage(err, '修复失败') });
    } finally {
      setThumbnailLoading(false);
    }
  };

  const cacheHitRateText = cacheStats?.hitRate === null || cacheStats?.hitRate === undefined
    ? '-'
    : `${(cacheStats.hitRate * 100).toFixed(1)}%`;

  const formatTtl = (seconds: number) => {
    if (seconds === -2) return '未命中';
    if (seconds === -1) return '永久';
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
  };

  return (
    <div className="min-h-screen bg-primary-50 dark:bg-night-200">
      <NavHeader title="站点设置" backTo="/merchant" />

      <AnimatedPage>
        <div className="container mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="card-block p-6 sm:p-8"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border-3 border-ink bg-pop-purple shadow-block-sm dark:border-night-400">
                  <ImageIcon className="h-6 w-6 text-white" strokeWidth={2.5} />
                </div>
                <div>
                  <h2 className="font-display text-2xl tracking-wide text-ink dark:text-primary-100">登录页背景图</h2>
                  <p className="mt-1 text-sm text-ink-muted dark:text-primary-100/60">用于登录、注册、找回密码等页面。</p>
                </div>
              </div>
              {bgUrl && <span className="badge bg-primary-200 text-ink">已设置</span>}
            </div>

            {message && (
              <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="mb-3 rounded-xl border-2 border-primary-600 bg-primary-200/60 px-4 py-3 text-sm font-medium text-primary-900">
                {message}
              </motion.div>
            )}
            {error && (
              <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="mb-3 rounded-xl border-2 border-pop-rose bg-pop-rose/15 px-4 py-3 text-sm font-medium text-pop-rose">
                {error}
              </motion.div>
            )}

            {bgUrl ? (
              <div className="mb-4 overflow-hidden rounded-2xl border-3 border-ink bg-white shadow-block-sm dark:border-night-400 dark:bg-night-100">
                <img src={getImageUrl(bgUrl)} alt="登录背景预览" className="h-44 w-full object-cover sm:h-56" />
              </div>
            ) : (
              <div className="mb-4 flex h-32 items-center justify-center rounded-2xl border-2 border-dashed border-ink/30 bg-white/60 text-sm text-ink-muted dark:border-night-400 dark:bg-night-100/60 dark:text-primary-100/60">
                暂未设置自定义背景图
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="btn-action cursor-pointer !text-sm">
                {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                {uploading ? '上传中...' : '上传背景图'}
                <input type="file" accept="image/*" onChange={handleUpload} disabled={uploading} className="hidden" />
              </label>
              {bgUrl && (
                <button type="button" onClick={handleDelete} disabled={deleting} className="btn-danger !text-sm">
                  {deleting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Trash2 className="h-5 w-5" />}
                  {deleting ? '删除中...' : '删除背景图'}
                </button>
              )}
            </div>
            <p className="mt-4 text-xs text-ink-muted dark:text-primary-100/60">支持 JPG、PNG、GIF、WebP，建议 1920x1080 以上，文件不超过 10MB。</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="card-block p-6 sm:p-8"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border-3 border-ink bg-primary-600 shadow-block-sm dark:border-night-400">
                  <Database className="h-6 w-6 text-white" strokeWidth={2.5} />
                </div>
                <div>
                  <h2 className="font-display text-2xl tracking-wide text-ink dark:text-primary-100">Redis 缓存状态</h2>
                  <p className="mt-1 text-sm text-ink-muted dark:text-primary-100/60">公开接口缓存命中率和当前缓存键状态。</p>
                </div>
              </div>
              <span className={`badge flex-shrink-0 ${cacheStats?.enabled && cacheStats.connected ? 'bg-primary-200 text-ink' : 'bg-pop-yellow text-ink'}`}>
                {cacheStats?.enabled ? (cacheStats.connected ? '已连接' : '未连接') : '未启用'}
              </span>
            </div>

            {cacheError && <div className="mb-3 rounded-xl border-2 border-pop-rose bg-pop-rose/15 px-4 py-3 text-sm font-medium text-pop-rose">{cacheError}</div>}

            <div className="rounded-2xl border-2 border-ink/10 bg-primary-50 p-4 dark:border-night-400 dark:bg-night-200">
              {cacheLoading && !cacheStats ? (
                <div className="flex items-center gap-2 text-sm text-ink-muted dark:text-primary-100/60">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  正在读取 Redis 缓存状态...
                </div>
              ) : cacheStats ? (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-4">
                    {[
                      { label: '命中率', value: cacheHitRateText },
                      { label: '命中', value: cacheStats.hits.toLocaleString() },
                      { label: '未命中', value: cacheStats.misses.toLocaleString() },
                      { label: '总请求', value: cacheStats.total.toLocaleString() },
                    ].map(item => (
                      <div key={item.label} className="rounded-2xl border-2 border-ink/10 bg-white/70 p-4 dark:border-night-400 dark:bg-night-100/70">
                        <p className="text-xs font-bold text-ink-muted dark:text-primary-100/60">{item.label}</p>
                        <p className="mt-2 font-display text-2xl text-ink dark:text-primary-100">{item.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-3 text-sm text-ink-muted dark:text-primary-100/60 sm:grid-cols-2">
                    <div>
                      <p className="font-display text-xs text-ink dark:text-primary-100">内存</p>
                      <p className="mt-1">当前 {cacheStats.memory?.used || '-'} · 峰值 {cacheStats.memory?.peak || '-'}</p>
                    </div>
                    <div>
                      <p className="font-display text-xs text-ink dark:text-primary-100">淘汰策略</p>
                      <p className="mt-1">{cacheStats.memory?.policy || '-'}</p>
                    </div>
                    <div>
                      <p className="font-display text-xs text-ink dark:text-primary-100">过期键</p>
                      <p className="mt-1">{cacheStats.expiredKeys.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="font-display text-xs text-ink dark:text-primary-100">淘汰键</p>
                      <p className="mt-1">{cacheStats.evictedKeys.toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {cacheStats.keys.map(item => (
                      <div key={item.key} className="flex items-center justify-between gap-3 rounded-xl bg-white/70 px-3 py-2 text-xs dark:bg-night-100/70">
                        <span className="min-w-0 truncate font-bold text-ink dark:text-primary-100">{item.name}</span>
                        <span className={`badge ${item.exists ? 'bg-primary-200 text-ink' : 'bg-white text-ink-muted dark:bg-night-200 dark:text-primary-100/60'}`}>
                          {item.exists ? `TTL ${formatTtl(item.ttlSeconds)}` : '未缓存'}
                        </span>
                      </div>
                    ))}
                  </div>

                  <button type="button" onClick={loadCacheStats} disabled={cacheLoading} className="btn-secondary !px-4 !py-2.5 !text-sm">
                    {cacheLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    刷新缓存状态
                  </button>
                </div>
              ) : (
                <p className="text-sm text-ink-muted dark:text-primary-100/60">暂时无法读取 Redis 缓存状态。</p>
              )}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.04 }}
            className="card-block p-6 sm:p-8"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border-3 border-ink bg-pop-pink shadow-block-sm dark:border-night-400">
                  <LayoutGrid className="h-6 w-6 text-white" strokeWidth={2.5} />
                </div>
                <div>
                  <h2 className="font-display text-2xl tracking-wide text-ink dark:text-primary-100">主页发布按钮</h2>
                  <p className="mt-1 text-sm text-ink-muted dark:text-primary-100/60">控制主页右下角发布菜单里各入口的显示。全部关闭时，整个发布按钮会隐藏。</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border-2 border-ink/10 bg-primary-50 p-4 dark:border-night-400 dark:bg-night-200">
              {fabMessage && <div className="mb-3 rounded-xl border-2 border-primary-600 bg-primary-200/60 px-4 py-3 text-sm font-medium text-primary-900">{fabMessage}</div>}
              {fabError && <div className="mb-3 rounded-xl border-2 border-pop-rose bg-pop-rose/15 px-4 py-3 text-sm font-medium text-pop-rose">{fabError}</div>}

              {fabConfig ? (
                <div className="flex flex-col gap-3">
                  {([
                    { key: 'event' as const, label: '发布活动' },
                    { key: 'venue' as const, label: '发布商铺' },
                    { key: 'session' as const, label: '发布组局' },
                    { key: 'dance' as const, label: "let's dance!" },
                  ]).map((item) => (
                    <div key={item.key} className="flex items-center justify-between gap-4 rounded-xl border-2 border-ink/10 bg-white px-4 py-3 dark:border-night-400 dark:bg-night-100">
                      <span className="font-display text-base text-ink dark:text-primary-100">{item.label}</span>
                      <button
                        type="button"
                        onClick={() => handleToggleFab(item.key)}
                        disabled={fabSaving !== null}
                        aria-pressed={fabConfig[item.key]}
                        className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full border-2 border-ink transition-colors duration-200 disabled:opacity-50 dark:border-night-400 ${fabConfig[item.key] ? 'bg-action' : 'bg-white dark:bg-night-200'}`}
                      >
                        <span className={`inline-block h-4 w-4 rounded-full border-2 border-ink bg-white transition-transform duration-200 dark:border-night-400 ${fabConfig[item.key] ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-ink-muted dark:text-primary-100/60">正在读取配置…</p>
              )}
            </div>
          </motion.div>

          {/* 插件区：manifest 驱动的通用卡片（B站同步 / 异地备份 / AI 摘要等）+ .ami 导入 */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card-block p-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg text-ink dark:text-primary-100 flex items-center gap-2">
                <PackagePlus className="h-5 w-5 text-action" />插件管理
              </h2>
              <p className="text-sm text-ink-muted dark:text-primary-100/60 mt-1">
                共 {plugins?.length ?? 0} 个插件。可导入 .ami 插件包扩展功能（格式见 docs/PLUGIN_DEVELOPMENT.md）。
              </p>
            </div>
            <label className={`btn-action !py-2 !px-4 !text-sm cursor-pointer ${importing ? 'pointer-events-none opacity-70' : ''}`}>
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {importing ? '导入中...' : '导入插件 (.ami)'}
              <input
                type="file"
                accept=".ami"
                className="hidden"
                disabled={importing}
                onChange={handleImportPlugin}
              />
            </label>
          </motion.div>

          {pluginsError && (
            <div className="rounded-xl border-2 border-pop-rose bg-pop-rose/15 px-4 py-3 text-sm font-medium text-pop-rose">
              {pluginsError}
              <button type="button" onClick={() => void loadPlugins()} className="ml-3 underline">重试</button>
            </div>
          )}
          {pluginsLoading ? (
            <div className="card-block flex items-center justify-center gap-2 p-8 text-sm text-ink-muted dark:text-primary-100/60">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在读取插件列表...
            </div>
          ) : (
            plugins?.map((plugin) => (
              <PluginCard key={plugin.id} plugin={plugin} onChanged={() => void loadPlugins()} onUninstall={requestUninstall} />
            ))
          )}

          {/* 导入风险确认 */}
          <AnimatePresence>
            {confirmImport && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-[90] flex items-center justify-center bg-ink/60 p-4"
                onClick={() => setConfirmImport(null)}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.92, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94 }}
                  transition={{ type: 'spring', damping: 22, stiffness: 380 }}
                  className="card-flat shadow-block-lg w-full max-w-md p-6"
                  onClick={(e) => e.stopPropagation()}
                >
                  <h3 className="font-display text-lg text-ink dark:text-primary-100 flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-pop-yellow" />确认导入插件
                  </h3>
                  <p className="text-sm text-ink-muted dark:text-primary-100/60 mt-3 leading-relaxed">
                    即将导入插件包 <span className="font-bold text-ink dark:text-primary-100">{confirmImport.fileName}</span>
                    {confirmImport.size ? `（${(confirmImport.size / 1024).toFixed(1)} KB）` : ''}。
                  </p>
                  <p className="text-sm text-pop-rose mt-2 leading-relaxed font-medium">
                    插件将在服务器上以完整权限运行（可访问数据库、文件与网络）。请仅安装来自可信来源的插件包。
                  </p>
                  <div className="flex justify-end gap-3 mt-5">
                    <button type="button" className="btn-secondary !py-2 !px-4 !text-sm" onClick={() => setConfirmImport(null)}>取消</button>
                    <button type="button" className="btn-danger !py-2 !px-4 !text-sm" onClick={doImport}>我了解风险，导入</button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 卸载确认 */}
          <AnimatePresence>
            {confirmUninstall && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-[90] flex items-center justify-center bg-ink/60 p-4"
                onClick={() => setConfirmUninstall(null)}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.92, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94 }}
                  transition={{ type: 'spring', damping: 22, stiffness: 380 }}
                  className="card-flat shadow-block-lg w-full max-w-md p-6"
                  onClick={(e) => e.stopPropagation()}
                >
                  <h3 className="font-display text-lg text-ink dark:text-primary-100">卸载插件</h3>
                  <p className="text-sm text-ink-muted dark:text-primary-100/60 mt-3 leading-relaxed">
                    确定卸载 <span className="font-bold text-ink dark:text-primary-100">{confirmUninstall.name}</span>（{confirmUninstall.id}）？
                    其定时任务将停止、插件文件被删除；设置项会保留，重新导入后自动恢复。
                  </p>
                  <div className="flex justify-end gap-3 mt-5">
                    <button type="button" className="btn-secondary !py-2 !px-4 !text-sm" onClick={() => setConfirmUninstall(null)}>取消</button>
                    <button type="button" className="btn-danger !py-2 !px-4 !text-sm" onClick={doUninstall}>确认卸载</button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>


          {/* 缩略图巡检与修复 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="card-block p-6 sm:p-8"
          >
            <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border-3 border-ink bg-pop-rose shadow-block-sm dark:border-night-400">
                  <ImageIcon className="h-6 w-6 text-ink" strokeWidth={2.5} />
                </div>
                <div>
                  <h2 className="font-display text-2xl tracking-wide text-ink dark:text-primary-100">缩略图巡检</h2>
                  <p className="mt-1 text-sm text-ink-muted dark:text-primary-100/60">检查并修复缺失的图片缩略图。</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {thumbnailResult ? (
                <div className={`rounded-xl border-2 p-4 text-sm ${thumbnailResult.missing > 0 ? 'border-pop-rose bg-pop-rose/10' : 'border-primary-600 bg-primary-200/50 dark:bg-primary-500/15'}`}>
                  <div className="flex items-center gap-2 font-bold">
                    {thumbnailResult.missing > 0 ? <AlertTriangle className="h-5 w-5 text-pop-rose" /> : <CheckCircle2 className="h-5 w-5 text-primary-600" />}
                    {thumbnailResult.message}
                  </div>
                  {thumbnailResult.detail && <p className="mt-2 text-ink-muted dark:text-primary-100/60">{thumbnailResult.detail}</p>}
                </div>
              ) : thumbnailChecking ? (
                <p className="text-sm text-ink-muted flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />正在检查...</p>
              ) : (
                <p className="text-sm text-ink-muted dark:text-primary-100/60">点击下方按钮检查上传图片的缩略图状态。</p>
              )}

              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={handleCheckThumbnails} disabled={thumbnailLoading} className="btn-secondary !px-4 !py-2.5 !text-sm">
                  {thumbnailChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  检查缺失
                </button>
                <button type="button" onClick={handleRegenerateThumbnails} disabled={thumbnailLoading || (thumbnailResult?.missing === 0)} className="btn-action !px-4 !py-2.5 !text-sm">
                  {thumbnailLoading && !thumbnailChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  一键修复
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      </AnimatedPage>
      {/* 前端错误日志 */}
      <FrontendErrorLog />
      <ScrollToTop />
    </div>
  );
};

const FrontendErrorLog: React.FC = () => {
  const [errors, setErrors] = useState(getErrorLog());
  const [expanded, setExpanded] = useState(false);

  const refresh = useCallback(() => setErrors(getErrorLog()), []);
  const clear = useCallback(() => { clearErrorLog(); setErrors([]); }, []);

  if (errors.length === 0) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card-block p-6 sm:p-8">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border-3 border-ink bg-pop-yellow shadow-block-sm dark:border-night-400">
            <AlertTriangle className="h-6 w-6 text-ink" strokeWidth={2.5} />
          </div>
          <div>
            <h2 className="font-display text-2xl tracking-wide text-ink dark:text-primary-100">前端错误日志</h2>
            <p className="mt-1 text-sm text-ink-muted dark:text-primary-100/60">收集用户在浏览器端遇到的 JS 错误。共 {errors.length} 条。</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={refresh} className="btn-secondary !px-4 !py-2 !text-sm"><RefreshCw className="h-4 w-4" />刷新</button>
          <button type="button" onClick={clear} className="btn-secondary !px-4 !py-2 !text-sm"><Trash2 className="h-4 w-4" />清空</button>
        </div>
      </div>

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {(expanded ? errors : errors.slice(-10)).map((e: any) => (
          <div key={e.id} className="rounded-xl border-2 border-ink/10 bg-primary-50 p-3 text-xs dark:border-night-400 dark:bg-night-200 font-mono">
            <div className="flex items-start justify-between gap-2">
              <span className={`badge ${e.type === 'error' ? 'bg-pop-rose text-white' : 'bg-pop-yellow text-ink'}`}>{e.type}</span>
              <span className="text-ink-muted dark:text-primary-100/50">{new Date(e.time).toLocaleString('zh-CN')}</span>
            </div>
            <p className="mt-1 text-ink dark:text-primary-100 break-all">{e.message}</p>
            {e.stack && expanded && <pre className="mt-1 whitespace-pre-wrap text-ink-muted dark:text-primary-100/60">{e.stack}</pre>}
            <p className="mt-1 text-ink-muted/60 dark:text-primary-100/40">{e.url}</p>
          </div>
        ))}
      </div>
      {errors.length > 10 && (
        <button type="button" onClick={() => setExpanded(!expanded)} className="mt-3 text-sm link-primary">
          {expanded ? '收起' : `查看全部 ${errors.length} 条`}
        </button>
      )}
    </motion.div>
  );
};

export default AdminSettings;
