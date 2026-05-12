import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Upload, Loader2, Send, X } from 'lucide-react';
import { venueService } from '../services/venueService';
import { getApiErrorMessage } from '../utils/helpers';
import AnimatedPage from '../components/AnimatedPage';
import NavHeader from '../components/NavHeader';
import MapPicker from '../components/MapPicker';

const CreateVenue: React.FC = () => {
  const [formData, setFormData] = useState({
    name: '', address: '', phone: '', business_hours: '', description: '', nav_guide: '',
  });
  const [selectedLocation, setSelectedLocation] = useState<{ lng: number; lat: number } | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setError('图片大小不能超过 10MB'); return; }
    setCover(file);
    const reader = new FileReader();
    reader.onloadend = () => setPreviewUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!formData.address || !selectedLocation) {
      setError('请在地图上选择店铺地址');
      return;
    }
    setLoading(true);
    try {
      const data = new FormData();
      Object.entries(formData).forEach(([k, v]) => { if (v) data.append(k, v); });
      if (selectedLocation) {
        data.append('latitude', String(selectedLocation.lat));
        data.append('longitude', String(selectedLocation.lng));
      }
      if (cover) data.append('cover', cover);
      await venueService.createVenue(data);
      alert('店铺已提交，等待管理员审核');
      navigate('/merchant');
    } catch (err) {
      setError(getApiErrorMessage(err, '提交失败，请检查表单信息'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-primary-50 dark:bg-night-200">
      <NavHeader title="发布店铺" backTo="/merchant" />
      <AnimatedPage>
        <div className="container mx-auto p-4 sm:p-6 max-w-3xl">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card-block p-6 sm:p-8">
            <div className="mb-6 px-5 py-3.5 rounded-xl bg-pop-cyan/20 border-2 border-ink dark:border-night-400 text-sm text-ink dark:text-primary-200">
              ✨ 店铺提交后需管理员审核，审核通过后将在地图上展示。导航指引图片可在审核通过后单独上传。
            </div>

            {error && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                className="mb-6 px-4 py-3 rounded-xl bg-pop-rose/15 border-2 border-pop-rose text-sm text-pop-rose font-medium">
                {error}
              </motion.div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="label-block">店铺名称 <span className="text-action">*</span></label>
                <input type="text" name="name" value={formData.name} onChange={handleChange} className="input-block" required />
              </div>

              {/* 封面图 */}
              <div>
                <label className="label-block">店铺封面图</label>
                <div className="relative rounded-2xl border-3 border-dashed border-ink/30 dark:border-night-400 p-6 text-center cursor-pointer hover:border-action hover:bg-action/5 transition-all duration-200"
                  onClick={() => document.getElementById('cover-input')?.click()}>
                  <input id="cover-input" type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif" onChange={handleFileChange} className="hidden" />
                  {previewUrl ? (
                    <div className="relative inline-block">
                      <img src={previewUrl} alt="Preview" className="mx-auto max-h-48 rounded-xl object-cover border-3 border-ink dark:border-night-400 shadow-block-sm" />
                      <button type="button" onClick={e => { e.stopPropagation(); setCover(null); setPreviewUrl(''); }}
                        className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-pop-rose border-3 border-ink shadow-block-sm flex items-center justify-center text-white">
                        <X className="w-4 h-4" strokeWidth={3} />
                      </button>
                    </div>
                  ) : (
                    <div className="py-4">
                      <div className="w-14 h-14 mx-auto rounded-2xl bg-pop-yellow border-3 border-ink dark:border-night-400 shadow-block flex items-center justify-center mb-3 animate-float">
                        <Upload className="w-7 h-7 text-ink" strokeWidth={2.5} />
                      </div>
                      <p className="font-display text-ink dark:text-primary-100">点击上传封面图</p>
                      <p className="text-xs text-ink-muted dark:text-primary-100/60 mt-1">JPG / PNG / WebP / HEIC，最大 10MB</p>
                    </div>
                  )}
                </div>
              </div>

              {/* 地址 */}
              <div>
                <label className="label-block">店铺地址 <span className="text-action">*</span></label>
                <MapPicker onLocationSelect={d => {
                  setFormData(p => ({ ...p, address: d.address }));
                  setSelectedLocation({ lng: d.lng, lat: d.lat });
                }} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="label-block">联系电话</label>
                  <input type="tel" name="phone" value={formData.phone} onChange={handleChange} placeholder="例如：010-12345678" className="input-block" autoComplete="tel" />
                </div>
                <div>
                  <label className="label-block">营业时间</label>
                  <input type="text" name="business_hours" value={formData.business_hours} onChange={handleChange} placeholder="例如：周一至周日 12:00-22:00" className="input-block" />
                </div>
              </div>

              <div>
                <label className="label-block">店铺简介</label>
                <textarea name="description" value={formData.description} onChange={handleChange} rows={3} className="input-block resize-none" placeholder="介绍一下你的店铺..." />
              </div>

              <div>
                <label className="label-block">最后100米怎么走</label>
                <textarea name="nav_guide" value={formData.nav_guide} onChange={handleChange} rows={4} className="input-block resize-none"
                  placeholder={'分步骤描述，例如：\n1. 导航到「蜜雪冰城」后停止\n2. 面对蜜雪冰城右转进入小巷\n3. 看到红色门头即到达'} />
                <p className="mt-1.5 text-xs text-ink-muted dark:text-primary-100/60">导航指引图片可在店铺审核通过后，在编辑页单独上传</p>
              </div>

              <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
                <button type="button" onClick={() => navigate('/merchant')} className="btn-secondary flex-1">取消</button>
                <button type="submit" disabled={loading} className="btn-action flex-1">
                  {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> 提交中...</> : <><Send className="w-5 h-5" /> 提交店铺</>}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      </AnimatedPage>
    </div>
  );
};

export default CreateVenue;
