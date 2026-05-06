import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, Save } from 'lucide-react';
import { sessionService } from '../services/sessionService';
import { getApiErrorMessage } from '../utils/helpers';
import AnimatedPage from '../components/AnimatedPage';
import NavHeader from '../components/NavHeader';
import LoadingSpinner from '../components/LoadingSpinner';

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

const fmt = (s: string) => {
  const d = new Date(s);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

const EditSession: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [formData, setFormData] = useState({
    game_name: '', game_type: 'boardgame', start_time: '', end_time: '',
    total_seats: '4', difficulty: 'beginner', description: '', price_per_person: '',
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    sessionService.getSessionById(Number(id)).then(r => {
      const s = r.session;
      setFormData({
        game_name: s.game_name,
        game_type: s.game_type,
        start_time: fmt(s.start_time),
        end_time: fmt(s.end_time),
        total_seats: String(s.total_seats),
        difficulty: s.difficulty,
        description: s.description || '',
        price_per_person: s.price_per_person || '',
      });
    }).catch(() => setError('加载组局信息失败')).finally(() => setLoading(false));
  }, [id]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (new Date(formData.end_time) <= new Date(formData.start_time)) {
      setError('结束时间必须晚于开始时间'); return;
    }
    setSubmitting(true);
    try {
      await sessionService.updateSession(Number(id), {
        ...formData,
        total_seats: parseInt(formData.total_seats),
        description: formData.description || undefined,
        price_per_person: formData.price_per_person || undefined,
      });
      alert('组局已更新');
      navigate('/merchant');
    } catch (err) {
      setError(getApiErrorMessage(err, '更新失败'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="min-h-screen bg-primary-50 dark:bg-night-200 flex items-center justify-center"><LoadingSpinner size="lg" text="加载中..." /></div>;

  return (
    <div className="min-h-screen bg-primary-50 dark:bg-night-200">
      <NavHeader title="编辑组局" backTo="/merchant" />
      <AnimatedPage>
        <div className="container mx-auto p-4 sm:p-6 max-w-2xl">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card-block p-6 sm:p-8">
            {error && <div className="mb-5 px-4 py-3 rounded-xl bg-pop-rose/15 border-2 border-pop-rose text-sm text-pop-rose font-medium">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="label-block">游戏名称 <span className="text-action">*</span></label>
                <input type="text" name="game_name" value={formData.game_name} onChange={handleChange} className="input-block" required />
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
              <div>
                <label className="label-block">补充说明</label>
                <textarea name="description" value={formData.description} onChange={handleChange} rows={3} className="input-block resize-none" />
              </div>
              <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
                <button type="button" onClick={() => navigate('/merchant')} className="btn-secondary flex-1">取消</button>
                <button type="submit" disabled={submitting} className="btn-action flex-1">
                  {submitting ? <><Loader2 className="w-5 h-5 animate-spin" /> 更新中...</> : <><Save className="w-5 h-5" /> 保存修改</>}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      </AnimatedPage>
    </div>
  );
};

export default EditSession;
