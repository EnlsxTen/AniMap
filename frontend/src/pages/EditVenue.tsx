import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Upload, Loader2, Save, X, Plus, Trash2 } from 'lucide-react';
import { venueService } from '../services/venueService';
import { Venue, VenueNavPhoto } from '../types';
import { getApiErrorMessage, getImageUrl } from '../utils/helpers';
import AnimatedPage from '../components/AnimatedPage';
import NavHeader from '../components/NavHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import MapPicker from '../components/MapPicker';

const EditVenue: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [formData, setFormData] = useState({
    name: '', address: '', phone: '', business_hours: '', description: '', nav_guide: '',
  });
  const [selectedLocation, setSelectedLocation] = useState<{ lng: number; lat: number } | null>(null);
  const [venueLatLng, setVenueLatLng] = useState<{ lng: number; lat: number } | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [currentCoverUrl, setCurrentCoverUrl] = useState('');
  const [navPhotos, setNavPhotos] = useState<VenueNavPhoto[]>([]);
  const [newPhotos, setNewPhotos] = useState<File[]>([]);
  const [newCaptions, setNewCaptions] = useState<string[]>([]);
  const [newPhotoUrls, setNewPhotoUrls] = useState<string[]>([]); // Object URLs，组件卸载时 revoke
  const objectUrlsRef = useRef<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  // 组件卸载时释放所有 Object URL，防止内存泄漏
  useEffect(() => {
    return () => { objectUrlsRef.current.forEach(u => URL.revokeObjectURL(u)); };
  }, []);

  useEffect(() => { loadVenue(); }, [id]);

  const loadVenue = async () => {
    try {
      const res = await venueService.getVenueById(Number(id));
      const v: Venue = res.venue;
      setFormData({
        name: v.name,
        address: v.address,
        phone: v.phone || '',
        business_hours: v.business_hours || '',
        description: v.description || '',
        nav_guide: v.nav_guide || '',
      });
      if (v.cover_url) setCurrentCoverUrl(v.cover_url);
      if (v.longitude != null && v.latitude != null) {
        setVenueLatLng({ lng: Number(v.longitude), lat: Number(v.latitude) });
        setSelectedLocation({ lng: Number(v.longitude), lat: Number(v.latitude) });
      }
      setNavPhotos(v.nav_photos || []);
    } catch {
      setError('加载店铺信息失败');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setError('图片大小不能超过 10MB'); return; }
    setCover(file);
    const reader = new FileReader();
    reader.onloadend = () => setPreviewUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleNewPhotosChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    // 图片数量校验：只计算已入库的数量（newPhotos 是待上传的本地文件，未入库）
    if (navPhotos.length + files.length > 10) {
      setError(`已有 ${navPhotos.length} 张，本次选择将超过 10 张上限`);
      return;
    }
    // 生成 Object URL 并记录，供卸载时 revoke
    const urls = files.map(f => { const u = URL.createObjectURL(f); objectUrlsRef.current.push(u); return u; });
    setNewPhotos(p => [...p, ...files]);
    setNewCaptions(c => [...c, ...files.map(() => '')]);
    setNewPhotoUrls(u => [...u, ...urls]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const data = new FormData();
      Object.entries(formData).forEach(([k, v]) => { if (v) data.append(k, v); });
      if (selectedLocation) {
        data.append('latitude', String(selectedLocation.lat));
        data.append('longitude', String(selectedLocation.lng));
      }
      if (cover) data.append('cover', cover);
      await venueService.updateVenue(Number(id), data);
      alert('店铺已更新，等待重新审核');
      navigate('/merchant');
    } catch (err) {
      setError(getApiErrorMessage(err, '更新失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleUploadNavPhotos = async () => {
    if (newPhotos.length === 0) return;
    setUploading(true);
    setError('');
    try {
      const data = new FormData();
      newPhotos.forEach(f => data.append('photos', f));
      data.append('captions', JSON.stringify(newCaptions));
      const res = await venueService.uploadNavPhotos(Number(id), data);
      setNavPhotos(p => [...p, ...res.photos]);
      // 上传成功后 revoke Object URL 并清空待上传列表
      newPhotoUrls.forEach(u => URL.revokeObjectURL(u));
      objectUrlsRef.current = objectUrlsRef.current.filter(u => !newPhotoUrls.includes(u));
      setNewPhotos([]);
      setNewCaptions([]);
      setNewPhotoUrls([]);
    } catch (err) {
      setError(getApiErrorMessage(err, '上传图片失败'));
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteNavPhoto = async (photoId: number) => {
    if (!window.confirm('确定删除这张导航图片？')) return;
    try {
      await venueService.deleteNavPhoto(Number(id), photoId);
      setNavPhotos(p => p.filter(ph => ph.id !== photoId));
    } catch (err) {
      console.error('Delete nav photo error:', err);
      setError('删除图片失败');
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-primary-50 dark:bg-night-200 flex items-center justify-center"><LoadingSpinner size="lg" text="加载店铺信息..." /></div>;
  }

  return (
    <div className="min-h-screen bg-primary-50 dark:bg-night-200">
      <NavHeader title="编辑店铺" backTo="/merchant" />
      <AnimatedPage>
        <div className="container mx-auto p-4 sm:p-6 max-w-3xl space-y-6">

          {/* 基本信息表单 */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card-block p-6 sm:p-8">
            <h3 className="font-display text-xl text-ink dark:text-primary-100 mb-5">基本信息</h3>

            {error && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                className="mb-5 px-4 py-3 rounded-xl bg-pop-rose/15 border-2 border-pop-rose text-sm text-pop-rose font-medium">
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
                <div className="relative rounded-2xl border-3 border-dashed border-ink/30 dark:border-night-400 p-5 text-center cursor-pointer hover:border-action hover:bg-action/5 transition-all duration-200"
                  onClick={() => document.getElementById('cover-edit-input')?.click()}>
                  <input id="cover-edit-input" type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif" onChange={handleCoverChange} className="hidden" />
                  {previewUrl ? (
                    <div className="relative inline-block">
                      <p className="text-xs font-display text-action mb-2">新封面预览</p>
                      <img src={previewUrl} alt="Preview" className="mx-auto max-h-40 rounded-xl object-cover border-3 border-ink dark:border-night-400 shadow-block-sm" />
                      <button type="button" onClick={e => { e.stopPropagation(); setCover(null); setPreviewUrl(''); }}
                        className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-pop-rose border-3 border-ink shadow-block-sm flex items-center justify-center text-white">
                        <X className="w-4 h-4" strokeWidth={3} />
                      </button>
                    </div>
                  ) : currentCoverUrl ? (
                    <div>
                      <p className="text-xs font-display text-ink-muted dark:text-primary-100/60 mb-2">当前封面（点击更换）</p>
                      <img src={getImageUrl(currentCoverUrl, 'medium')} alt="Current" className="mx-auto max-h-40 rounded-xl object-cover border-3 border-ink dark:border-night-400 shadow-block-sm" />
                    </div>
                  ) : (
                    <div className="py-4">
                      <Upload className="w-8 h-8 mx-auto text-ink-muted mb-2" />
                      <p className="text-sm font-display text-ink dark:text-primary-100">点击上传封面图</p>
                    </div>
                  )}
                </div>
              </div>

              {/* 地址 */}
              <div>
                <label className="label-block">店铺地址 <span className="text-action">*</span></label>
                {venueLatLng ? (
                  <MapPicker initialLng={venueLatLng.lng} initialLat={venueLatLng.lat} initialAddress={formData.address}
                    onLocationSelect={d => { setFormData(p => ({ ...p, address: d.address })); setSelectedLocation({ lng: d.lng, lat: d.lat }); }} />
                ) : (
                  <MapPicker initialAddress={formData.address}
                    onLocationSelect={d => { setFormData(p => ({ ...p, address: d.address })); setSelectedLocation({ lng: d.lng, lat: d.lat }); }} />
                )}
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
                <textarea name="description" value={formData.description} onChange={handleChange} rows={3} className="input-block resize-none" />
              </div>

              <div>
                <label className="label-block">最后100米怎么走</label>
                <textarea name="nav_guide" value={formData.nav_guide} onChange={handleChange} rows={4} className="input-block resize-none"
                  placeholder={'分步骤描述，例如：\n1. 导航到「蜜雪冰城」后停止\n2. 面对蜜雪冰城右转进入小巷\n3. 看到红色门头即到达'} />
              </div>

              <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
                <button type="button" onClick={() => navigate('/merchant')} className="btn-secondary flex-1">取消</button>
                <button type="submit" disabled={submitting} className="btn-action flex-1">
                  {submitting ? <><Loader2 className="w-5 h-5 animate-spin" /> 更新中...</> : <><Save className="w-5 h-5" /> 保存修改</>}
                </button>
              </div>
            </form>
          </motion.div>

          {/* 导航图片管理 */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card-block p-6 sm:p-8">
            <h3 className="font-display text-xl text-ink dark:text-primary-100 mb-2">导航指引图片</h3>
            <p className="text-sm text-ink-muted dark:text-primary-100/60 mb-5">上传关键节点照片（门头、电梯口、路口标志物等），最多 10 张</p>

            {/* 已有图片 */}
            {navPhotos.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
                {navPhotos.map(photo => (
                  <div key={photo.id} className="relative rounded-xl overflow-hidden border-3 border-ink dark:border-night-400 shadow-block-sm group">
                    <img src={getImageUrl(photo.photo_url, 'thumb')} alt={photo.caption || ''} className="w-full aspect-square object-cover" />
                    {photo.caption && (
                      <div className="absolute bottom-0 inset-x-0 bg-ink/70 px-2 py-1">
                        <p className="text-xs text-white truncate">{photo.caption}</p>
                      </div>
                    )}
                    <button onClick={() => handleDeleteNavPhoto(photo.id)}
                      className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-pop-rose border-2 border-ink flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 新增图片 */}
            {newPhotos.length > 0 && (
              <div className="mb-4 space-y-2">
                <p className="text-sm font-display text-ink dark:text-primary-100">待上传（{newPhotos.length} 张）</p>
                {newPhotos.map((_file, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-primary-50 dark:bg-night-200 border-2 border-ink/10 dark:border-night-400">
                    <img src={newPhotoUrls[i]} alt="" className="w-12 h-12 rounded-lg object-cover border-2 border-ink dark:border-night-400 flex-shrink-0" />
                    <input type="text" value={newCaptions[i]} onChange={e => setNewCaptions(c => c.map((v, j) => j === i ? e.target.value : v))}
                      placeholder="图片说明（如：看到蜜雪冰城右转）" className="input-block flex-1 !py-2 !text-sm" />
                    <button type="button" onClick={() => { setNewPhotos(p => p.filter((_, j) => j !== i)); setNewCaptions(c => c.filter((_, j) => j !== i)); }}
                      className="flex-shrink-0 w-8 h-8 rounded-lg bg-pop-rose/15 border-2 border-pop-rose flex items-center justify-center text-pop-rose hover:bg-pop-rose hover:text-white transition-all">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={handleUploadNavPhotos} disabled={uploading} className="btn-primary w-full !py-2.5 !text-sm">
                  {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> 上传中...</> : `确认上传 ${newPhotos.length} 张图片`}
                </button>
              </div>
            )}

            {navPhotos.length < 10 && (
              <label className="flex items-center justify-center gap-2 p-4 rounded-xl border-3 border-dashed border-ink/30 dark:border-night-400 cursor-pointer hover:border-action hover:bg-action/5 transition-all duration-200 text-ink-muted dark:text-primary-100/60 font-display text-sm">
                <Plus className="w-5 h-5" />
                添加导航图片（还可添加 {10 - navPhotos.length - newPhotos.length} 张）
                <input type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif" multiple onChange={handleNewPhotosChange} className="hidden" />
              </label>
            )}
          </motion.div>

        </div>
      </AnimatedPage>
    </div>
  );
};

export default EditVenue;
