import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Upload, Loader2, Send, X } from 'lucide-react';
import { eventService } from '../services/eventService';
import { getStoredUser, getApiErrorMessage } from '../utils/helpers';
import AnimatedPage from '../components/AnimatedPage';
import NavHeader from '../components/NavHeader';
import MapPicker from '../components/MapPicker';

const CreateEvent: React.FC = () => {
  const user = getStoredUser();
  const isMerchantPublisher = user?.role === 'merchant' || user?.role === 'admin';
  const [formData, setFormData] = useState({
    name: '', start_time: '', end_time: '', display_until: '',
    venue_name: '', address: '', ticket_price: '', description: '', ticket_url: '',
  });
  const [selectedLocation, setSelectedLocation] = useState<{ lng: number; lat: number } | null>(null);
  const [poster, setPoster] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
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
    setPoster(file);
    const reader = new FileReader();
    reader.onloadend = () => setPreviewUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const s = new Date(formData.start_time);
    const en = new Date(formData.end_time);
    if (en <= s) { setError('活动结束时间必须晚于开始时间'); return; }
    if (isMerchantPublisher && formData.display_until) {
      if (new Date(formData.display_until) < s) { setError('地图展示截止时间不能早于活动开始时间'); return; }
    }
    setLoading(true);
    try {
      const data = new FormData();
      data.append('name', formData.name);
      data.append('start_time', formData.start_time);
      data.append('end_time', formData.end_time);
      if (isMerchantPublisher && formData.display_until) data.append('display_until', formData.display_until);
      data.append('venue_name', formData.venue_name);
      data.append('address', formData.address);
      if (selectedLocation) {
        data.append('latitude', String(selectedLocation.lat));
        data.append('longitude', String(selectedLocation.lng));
      }
      data.append('ticket_price', formData.ticket_price);
      data.append('description', formData.description);
      if (poster) data.append('poster', poster);
      if (formData.ticket_url) data.append('ticket_url', formData.ticket_url);
      await eventService.createEvent(data);
      alert(isMerchantPublisher ? '活动发布成功，等待审核' : '活动发布成功，地图展示时长已自动设置为7天');
      navigate('/merchant');
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, '发布失败，请检查表单信息'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-primary-50 dark:bg-night-200">
      <NavHeader title="发布新展会" backTo="/merchant" />

      <AnimatedPage>
        <div className="container mx-auto p-4 sm:p-6 max-w-3xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="card-block p-6 sm:p-8"
          >
            {/* 提示 */}
            <div className="mb-6 px-5 py-3.5 rounded-xl bg-pop-cyan/20 border-2 border-ink dark:border-night-400 text-sm text-ink dark:text-primary-200">
              {isMerchantPublisher
                ? '✨ 商户和管理员可自定义地图展示截止时间，最长支持3个月。'
                : '✨ 个人用户发布的活动会自动在地图上展示7天。'}
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mb-6 px-4 py-3 rounded-xl bg-pop-rose/15 border-2 border-pop-rose text-sm text-pop-rose font-medium"
              >
                {error}
              </motion.div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="label-block">展会名称 <span className="text-action">*</span></label>
                <input type="text" name="name" value={formData.name} onChange={handleChange} className="input-block" required />
              </div>

              <div>
                <label className="label-block">展会海报</label>
                <div
                  className="relative rounded-2xl border-3 border-dashed border-ink/30 dark:border-night-400 p-6 text-center cursor-pointer hover:border-action hover:bg-action/5 transition-all duration-200"
                  onClick={() => document.getElementById('poster-input')?.click()}
                >
                  <input id="poster-input" type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif" onChange={handleFileChange} className="hidden" />
                  {previewUrl ? (
                    <div className="relative inline-block">
                      <img src={previewUrl} alt="Preview" className="mx-auto max-h-56 rounded-xl object-cover border-3 border-ink dark:border-night-400 shadow-block-sm" />
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); setPoster(null); setPreviewUrl(''); }}
                        className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-pop-rose border-3 border-ink shadow-block-sm flex items-center justify-center text-white"
                      >
                        <X className="w-4 h-4" strokeWidth={3} />
                      </button>
                    </div>
                  ) : (
                    <div className="py-6">
                      <div className="w-16 h-16 mx-auto rounded-2xl bg-pop-yellow border-3 border-ink dark:border-night-400 shadow-block flex items-center justify-center mb-3 animate-float">
                        <Upload className="w-8 h-8 text-ink" strokeWidth={2.5} />
                      </div>
                      <p className="font-display text-ink dark:text-primary-100">点击上传海报图片</p>
                      <p className="text-ink-muted dark:text-primary-100/60 text-xs mt-1">支持 JPG / PNG / GIF / WebP，最大 5MB</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="label-block">活动开始时间 <span className="text-action">*</span></label>
                  <input type="datetime-local" name="start_time" value={formData.start_time} onChange={handleChange} className="input-block" required />
                </div>
                <div>
                  <label className="label-block">活动结束时间 <span className="text-action">*</span></label>
                  <input type="datetime-local" name="end_time" value={formData.end_time} onChange={handleChange} className="input-block" required />
                </div>
              </div>

              {isMerchantPublisher && (
                <div>
                  <label className="label-block">地图展示截止时间 <span className="text-action">*</span></label>
                  <input type="datetime-local" name="display_until" value={formData.display_until} onChange={handleChange} className="input-block" required />
                  <p className="mt-1.5 text-xs text-ink-muted dark:text-primary-100/60">商户最多可设置未来3个月内的任意展示截止时间</p>
                </div>
              )}

              <div>
                <label className="label-block">场馆名称 <span className="text-action">*</span></label>
                <input type="text" name="venue_name" value={formData.venue_name} onChange={handleChange} className="input-block" required />
              </div>

              <div>
                <label className="label-block">活动地点 <span className="text-action">*</span></label>
                <MapPicker onLocationSelect={(d) => {
                  setFormData(p => ({ ...p, address: d.address }));
                  setSelectedLocation({ lng: d.lng, lat: d.lat });
                }} />
              </div>

              <div>
                <label className="label-block">票价</label>
                <input type="text" name="ticket_price" value={formData.ticket_price} onChange={handleChange} placeholder="例如：免费 或 30元" className="input-block" />
              </div>

              <div>
                <label className="label-block">购票链接 <span className="text-ink-muted/60 font-normal">(可选)</span></label>
                <input type="url" name="ticket_url" value={formData.ticket_url} onChange={handleChange} placeholder="https://..." className="input-block" />
                <p className="mt-1.5 text-xs text-ink-muted dark:text-primary-100/60">填写后，展会详情页会显示"立即购票"按钮</p>
              </div>

              <div>
                <label className="label-block">展会简介</label>
                <textarea name="description" value={formData.description} onChange={handleChange} rows={4} className="input-block resize-none" />
              </div>

              <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
                <button type="button" onClick={() => navigate('/merchant')} className="btn-secondary flex-1">
                  取消
                </button>
                <button type="submit" disabled={loading} className="btn-action flex-1">
                  {loading ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> 发布中...</>
                  ) : (
                    <><Send className="w-5 h-5" /> 发布展会</>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      </AnimatedPage>
    </div>
  );
};

export default CreateEvent;
