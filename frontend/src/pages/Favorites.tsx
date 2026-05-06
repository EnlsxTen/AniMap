import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Heart, Calendar, Store, Gamepad2, MapPin, Clock, Users, Trash2, Bell, BellOff } from 'lucide-react';
import { favoriteService } from '../services/favoriteService';
import { Favorite } from '../types';
import { formatDate, getImageUrl } from '../utils/helpers';
import NavHeader from '../components/NavHeader';
import AnimatedPage from '../components/AnimatedPage';
import LoadingSpinner from '../components/LoadingSpinner';

const Favorites: React.FC = () => {
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    favoriteService.getMyFavorites()
      .then(r => setFavorites(r.favorites))
      .catch(() => setError('加载收藏失败，请刷新重试'))
      .finally(() => setLoading(false));
  }, []);

  const handleRemove = async (fav: Favorite) => {
    // 乐观更新
    setFavorites(prev => prev.filter(f => f.id !== fav.id));
    try {
      await favoriteService.toggle(fav.item_type, fav.item_id);
    } catch {
      // 失败时回滚
      setFavorites(prev => [...prev, fav].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
      setError('取消收藏失败，请重试');
    }
  };

  const handleToggleReminder = async (fav: Favorite) => {
    const newVal = !fav.reminder_enabled;
    setFavorites(prev => prev.map(f => f.id === fav.id ? { ...f, reminder_enabled: newVal } : f));
    try {
      await favoriteService.setReminder(fav.id, newVal);
    } catch {
      setFavorites(prev => prev.map(f => f.id === fav.id ? { ...f, reminder_enabled: fav.reminder_enabled } : f));
      setError('设置提醒失败，请重试');
    }
  };

  const renderCard = (fav: Favorite) => {
    const d = fav.detail;
    if (!d) return null;

    if (fav.item_type === 'event') return (
      <div className="flex gap-3">
        <div className="flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden border-3 border-ink dark:border-night-400 shadow-block-sm">
          <img src={getImageUrl(d.poster_url)} alt={d.name} className="w-full h-full object-cover" />
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-action flex-shrink-0" />
            <span className="text-xs text-action font-display">展会</span>
          </div>
          <h3 className="font-display text-base text-ink dark:text-primary-100 truncate">{d.name}</h3>
          <p className="text-xs text-ink-muted dark:text-primary-100/60 flex items-center gap-1">
            <Clock className="w-3 h-3" />{formatDate(d.start_time)}
          </p>
          <p className="text-xs text-ink-muted dark:text-primary-100/60 flex items-center gap-1 truncate">
            <MapPin className="w-3 h-3 text-action" />{d.venue_name}
          </p>
        </div>
      </div>
    );

    if (fav.item_type === 'venue') return (
      <div className="flex gap-3">
        <div className="flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden border-3 border-ink dark:border-night-400 shadow-block-sm bg-pop-purple/10 flex items-center justify-center">
          {d.cover_url
            ? <img src={getImageUrl(d.cover_url)} alt={d.name} className="w-full h-full object-cover" />
            : <Store className="w-7 h-7 text-pop-purple" strokeWidth={2} />
          }
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <Store className="w-3.5 h-3.5 text-pop-purple flex-shrink-0" />
            <span className="text-xs text-pop-purple font-display">店铺</span>
          </div>
          <h3 className="font-display text-base text-ink dark:text-primary-100 truncate">{d.name}</h3>
          <p className="text-xs text-ink-muted dark:text-primary-100/60 flex items-center gap-1 truncate">
            <MapPin className="w-3 h-3 text-pop-purple" />{d.address}
          </p>
          {d.business_hours && <p className="text-xs text-ink-muted dark:text-primary-100/60 flex items-center gap-1"><Clock className="w-3 h-3" />{d.business_hours}</p>}
        </div>
      </div>
    );

    // session
    const remaining = d.total_seats - d.booked_seats;
    return (
      <div className="flex gap-3">
        <div className="flex-shrink-0 w-16 h-16 rounded-xl bg-blue-100 dark:bg-blue-900/30 border-3 border-ink dark:border-night-400 shadow-block-sm flex items-center justify-center">
          <Gamepad2 className="w-7 h-7 text-blue-600 dark:text-blue-400" strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <Gamepad2 className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
            <span className="text-xs text-blue-500 font-display">组局</span>
          </div>
          <h3 className="font-display text-base text-ink dark:text-primary-100 truncate">{d.game_name}</h3>
          <p className="text-xs text-ink-muted dark:text-primary-100/60 flex items-center gap-1">
            <Clock className="w-3 h-3" />{formatDate(d.start_time)}
          </p>
          <div className="flex items-center gap-2">
            {d.status === 'full'
              ? <span className="text-xs px-1.5 py-0.5 rounded bg-pop-rose/15 text-pop-rose border border-pop-rose">已满</span>
              : <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 border border-blue-300 flex items-center gap-1"><Users className="w-3 h-3" />差{remaining}人</span>
            }
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-primary-50 dark:bg-night-200">
      <NavHeader title="我的收藏" backTo="/" />
      <AnimatedPage>
        <div className="container mx-auto p-4 sm:p-6 max-w-2xl">
          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-pop-rose/15 border-2 border-pop-rose text-sm text-pop-rose font-medium">{error}</div>
          )}
          {loading ? (
            <div className="py-20"><LoadingSpinner size="lg" text="加载收藏..." /></div>
          ) : favorites.length === 0 ? (
            <div className="card-block p-16 text-center">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-pop-rose/20 border-3 border-ink dark:border-night-400 shadow-block flex items-center justify-center mb-4 animate-float">
                <Heart className="w-8 h-8 text-pop-rose" strokeWidth={2} />
              </div>
              <p className="font-display text-xl text-ink dark:text-primary-100 mb-2">还没有收藏任何内容</p>
              <p className="text-sm text-ink-muted dark:text-primary-100/60 mb-6">在地图上点击展会、店铺或组局，可以收藏感兴趣的内容</p>
              <Link to="/" className="btn-action !text-sm inline-flex">去逛逛</Link>
            </div>
          ) : (
            <div className="space-y-3">
              {favorites.map((fav, i) => (
                <motion.div key={fav.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="card-block p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    {renderCard(fav)}
                  </div>
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    {fav.item_type !== 'venue' && (
                      <button onClick={() => handleToggleReminder(fav)}
                        className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center transition-all duration-200 ${
                          fav.reminder_enabled
                            ? 'bg-action border-action text-white'
                            : 'bg-action/10 border-action/30 text-action/50 hover:border-action hover:text-action'
                        }`}
                        title={fav.reminder_enabled ? '关闭邮件提醒' : '开启邮件提醒'}>
                        {fav.reminder_enabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                      </button>
                    )}
                    <button onClick={() => handleRemove(fav)}
                      className="w-8 h-8 rounded-lg bg-pop-rose/10 border-2 border-pop-rose/30 flex items-center justify-center text-pop-rose hover:bg-pop-rose hover:text-white transition-all duration-200"
                      title="取消收藏">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </AnimatedPage>
    </div>
  );
};

export default Favorites;
