import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Upload, Trash2, Image as ImageIcon, Loader2 } from 'lucide-react';
import { settingsService } from '../services/settingsService';
import { getImageUrl, getApiErrorMessage } from '../utils/helpers';
import NavHeader from '../components/NavHeader';
import AnimatedPage from '../components/AnimatedPage';

const AdminSettings: React.FC = () => {
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { loadBg(); }, []);

  const loadBg = async () => {
    try {
      const res = await settingsService.getAuthBg();
      setBgUrl(res.url);
    } catch { /* ignore */ }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setError('图片大小不能超过 10MB'); return; }
    setError(''); setMessage(''); setUploading(true);
    try {
      const res = await settingsService.updateAuthBg(file);
      setBgUrl(res.url);
      setMessage('背景图更新成功');
    } catch (err) {
      setError(getApiErrorMessage(err, '上传失败'));
    } finally { setUploading(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm('确定要删除登录背景图吗？删除后将使用默认渐变背景。')) return;
    setError(''); setMessage(''); setDeleting(true);
    try {
      await settingsService.deleteAuthBg();
      setBgUrl(null);
      setMessage('背景图已删除，将使用默认背景');
    } catch (err) {
      setError(getApiErrorMessage(err, '删除失败'));
    } finally { setDeleting(false); }
  };

  return (
    <div className="min-h-screen bg-primary-50 dark:bg-night-200">
      <NavHeader title="站点设置" backTo="/merchant" />

      <AnimatedPage>
        <div className="container mx-auto p-4 sm:p-6 max-w-3xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="card-block p-6 sm:p-8"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-xl bg-pop-purple border-3 border-ink dark:border-night-400 shadow-block-sm flex items-center justify-center">
                <ImageIcon className="w-6 h-6 text-white" strokeWidth={2.5} />
              </div>
              <div>
                <h2 className="font-display text-2xl text-ink dark:text-primary-100 tracking-wide">登录页背景图</h2>
              </div>
            </div>
            <p className="text-sm text-ink-muted dark:text-primary-100/60 mb-6">
              自定义登录、注册、忘记密码页面的背景图片。不设置时使用默认背景。
            </p>

            {message && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="mb-4 px-4 py-3 rounded-xl bg-primary-200/60 border-2 border-primary-600 text-sm text-primary-900 font-medium"
              >
                ✓ {message}
              </motion.div>
            )}
            {error && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="mb-4 px-4 py-3 rounded-xl bg-pop-rose/15 border-2 border-pop-rose text-sm text-pop-rose font-medium"
              >
                {error}
              </motion.div>
            )}

            {/* 预览 */}
            <div className="mb-6">
              {bgUrl ? (
                <div className="relative rounded-2xl overflow-hidden border-3 border-ink dark:border-night-400 shadow-block">
                  <img
                    src={getImageUrl(bgUrl)}
                    alt="登录背景图预览"
                    className="w-full h-48 sm:h-64 object-cover"
                  />
                  <div className="absolute top-3 left-3 px-3 py-1 bg-action border-2 border-ink rounded-lg shadow-block-sm">
                    <span className="font-display text-white text-xs">当前背景图</span>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border-3 border-dashed border-ink/30 dark:border-night-400 h-48 sm:h-64 flex flex-col items-center justify-center bg-primary-100/50 dark:bg-night-100/50">
                  <div className="w-16 h-16 rounded-2xl bg-pop-yellow border-3 border-ink dark:border-night-400 shadow-block flex items-center justify-center mb-3 animate-float">
                    <ImageIcon className="w-8 h-8 text-ink" strokeWidth={2.5} />
                  </div>
                  <p className="font-display text-ink dark:text-primary-100">未设置背景图</p>
                  <p className="text-ink-muted dark:text-primary-100/60 text-xs mt-1">使用默认背景</p>
                </div>
              )}
            </div>

            {/* 操作 */}
            <div className="flex flex-col sm:flex-row gap-3">
              <label className="flex-1 cursor-pointer">
                <input type="file" accept="image/*" onChange={handleUpload} className="hidden" disabled={uploading} />
                <div className="btn-action w-full">
                  {uploading ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> 上传中...</>
                  ) : (
                    <><Upload className="w-5 h-5" /> {bgUrl ? '更换背景图' : '上传背景图'}</>
                  )}
                </div>
              </label>

              {bgUrl && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="btn-danger"
                >
                  {deleting ? <><Loader2 className="w-5 h-5 animate-spin" /> 删除中...</> : <><Trash2 className="w-5 h-5" /> 删除背景图</>}
                </button>
              )}
            </div>

            <p className="text-xs text-ink-muted dark:text-primary-100/60 mt-4">
              支持 JPG、PNG、GIF、WebP 格式，建议尺寸 1920x1080 以上，文件大小不超过 10MB。
            </p>
          </motion.div>
        </div>
      </AnimatedPage>
    </div>
  );
};

export default AdminSettings;
