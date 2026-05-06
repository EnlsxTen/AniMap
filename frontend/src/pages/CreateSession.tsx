import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, Send } from 'lucide-react';
import { sessionService } from '../services/sessionService';
import { venueService } from '../services/venueService';
import { Venue } from '../types';
import { getApiErrorMessage, getStoredUser } from '../utils/helpers';
import AnimatedPage from '../components/AnimatedPage';
import NavHeader from '../components/NavHeader';
import MapPicker from '../components/MapPicker';

const GAME_TYPES = [
  { value: 'boardgame', label: '桌游' },
  { value: 'murder_mystery', label: '谋杀之谜' },
  { value: 'card', label: '卡牌' },
  { value: 'other', label: '其他' },
];
const DIFFICULTIES = [
  { value: 'beginner', label: '新手友好' },
  { value: 'intermediate', label: '中等难度' },
  { value: 'advanced', label: '高难度' },
];

const CreateSession: React.FC = () => {
  const user = getStoredUser();
  const isMerchant = user?.role === 'merchant' || user?.role === 'admin';
  const [myVenues, setMyVenues] = useState<Venue[]>([]);
  const [formData, setFormData] = useState({
    game_name: '', game_type: 'boardgame', start_time: '', end_time: '',
    total_seats: '4', difficulty: 'beginner', description: '', price_per_person: '',
    venue_id: '', address: '', // address 用于野生局
  });
  const [selectedLocation, setSelectedLocation] = useState<{ lng: number; lat: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!isMerchant) return;
    venueService.getMerchantVenues().then(r => {
      const approved = r.venues.filter(v => v.status === 'approved');
      setMyVenues(approved);
      if (approved.length > 0) setFormData(p => ({ ...p, venue_id: String(approved[0].id) }));
    }).catch(() => {});
  }, [isMerchant]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const isWild = formData.venue_id === '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (new Date(formData.end_time) <= new Date(formData.start_time)) {
      setError('结束时间必须晚于开始时间'); return;
    }
    if (isWild && !selectedLocation) {
      setError('请在地图上选择活动地点'); return;
    }
    setLoading(true);
    try {
      const payload: Record<string, any> = {
        game_name: formData.game_name,
        game_type: formData.game_type,
        start_time: formData.start_time,
        end_time: formData.end_time,
        total_seats: parseInt(formData.total_seats),
        difficulty: formData.difficulty,
        description: formData.description || undefined,
        price_per_person: formData.price_per_person || undefined,
      };
      if (formData.venue_id) {
        payload.venue_id = parseInt(formData.venue_id);
      } else if (selectedLocation) {
        payload.latitude = selectedLocation.lat;
        payload.longitude = selectedLocation.lng;
        payload.address = formData.address || '野生局';
      }
      await sessionService.createSession(payload);
      alert('组局发布成功！');
      navigate('/merchant');
    } catch (err) {
      setError(getApiErrorMessage(err, '发布失败'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-primary-50 dark:bg-night-200">
      <NavHeader title="发布组局" backTo="/merchant" />
      <AnimatedPage>
        <div className="container mx-auto p-4 sm:p-6 max-w-2xl">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card-block p-6 sm:p-8">
            {error && (
              <div className="mb-5 px-4 py-3 rounded-xl bg-pop-rose/15 border-2 border-pop-rose text-sm text-pop-rose font-medium">{error}</div>
            )}
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="label-block">游戏名称 <span className="text-action">*</span></label>
                <input type="text" name="game_name" value={formData.game_name} onChange={handleChange} className="input-block" placeholder="例如：《山中小屋》" required />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label-block">游戏类型</label>
                  <select name="game_type" value={formData.game_type} onChange={handleChange} className="input-block">
                    {GAME_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label-block">难度</label>
                  <select name="difficulty" value={formData.difficulty} onChange={handleChange} className="input-block">
                    {DIFFICULTIES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label-block">开始时间 <span className="text-action">*</span></label>
                  <input type="datetime-local" name="start_time" value={formData.start_time} onChange={handleChange} className="input-block" required />
                </div>
                <div>
                  <label className="label-block">结束时间 <span className="text-action">*</span></label>
                  <input type="datetime-local" name="end_time" value={formData.end_time} onChange={handleChange} className="input-block" required />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label-block">总座位数 <span className="text-action">*</span></label>
                  <input type="number" name="total_seats" value={formData.total_seats} onChange={handleChange} min="1" max="50" className="input-block" required />
                </div>
                <div>
                  <label className="label-block">人均费用</label>
                  <input type="text" name="price_per_person" value={formData.price_per_person} onChange={handleChange} placeholder="例如：免费 或 50元" className="input-block" />
                </div>
              </div>

              {/* 关联店铺 / 野生局 */}
              <div>
                <label className="label-block">活动地点</label>
                {isMerchant && myVenues.length > 0 ? (
                  <select name="venue_id" value={formData.venue_id} onChange={handleChange} className="input-block">
                    {myVenues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    <option value="">野生局（自定义地点）</option>
                  </select>
                ) : (
                  <p className="text-sm text-ink-muted dark:text-primary-100/60 mb-2">野生局 — 请在地图上选择地点</p>
                )}
                {isWild && (
                  <div className="mt-3">
                    <MapPicker onLocationSelect={d => {
                      setFormData(p => ({ ...p, address: d.address }));
                      setSelectedLocation({ lng: d.lng, lat: d.lat });
                    }} />
                  </div>
                )}
              </div>

              <div>
                <label className="label-block">补充说明</label>
                <textarea name="description" value={formData.description} onChange={handleChange} rows={3} className="input-block resize-none" placeholder="例如：新手可以，有人教学" />
              </div>

              <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
                <button type="button" onClick={() => navigate('/merchant')} className="btn-secondary flex-1">取消</button>
                <button type="submit" disabled={loading} className="btn-action flex-1">
                  {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> 发布中...</> : <><Send className="w-5 h-5" /> 发布组局</>}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      </AnimatedPage>
    </div>
  );
};

export default CreateSession;
