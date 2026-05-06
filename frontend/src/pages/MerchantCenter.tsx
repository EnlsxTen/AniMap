import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Calendar, Clock, CheckCircle2, XCircle, Plus, MapPin,
  Pencil, Trash2, Sparkles, Image as ImageIcon, Store, Gamepad2, Users,
} from 'lucide-react';
import { eventService } from '../services/eventService';
import { venueService } from '../services/venueService';
import { sessionService } from '../services/sessionService';
import { Event, Venue, Session } from '../types';
import { formatDate, getImageUrl, getStoredUser } from '../utils/helpers';
import NavHeader from '../components/NavHeader';
import AnimatedPage from '../components/AnimatedPage';
import LoadingSpinner from '../components/LoadingSpinner';

const MerchantCenter: React.FC = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const user = getStoredUser();

  useEffect(() => {
    if (user?.role !== 'merchant' && user?.role !== 'personal' && user?.role !== 'admin') {
      navigate('/');
      return;
    }
    Promise.all([
      eventService.getMerchantEvents().then(r => setEvents(r.events)),
      venueService.getMerchantVenues().then(r => setVenues(r.venues)),
      sessionService.getMySessions().then(r => setSessions(r.sessions)),
    ]).finally(() => setLoading(false));
  }, []);

  const handleDeleteEvent = async (id: number) => {
    if (!window.confirm('确定要删除这个展会吗？')) return;
    try {
      await eventService.deleteEvent(id);
      setEvents(events.filter(e => e.id !== id));
    } catch { alert('删除失败，请稍后重试'); }
  };

  const handleDeleteVenue = async (id: number) => {
    if (!window.confirm('确定要删除这个店铺吗？')) return;
    try {
      await venueService.deleteVenue(id);
      setVenues(venues.filter(v => v.id !== id));
    } catch { alert('删除失败，请稍后重试'); }
  };

  const handleDeleteSession = async (id: number) => {
    if (!window.confirm('确定要删除这个组局吗？')) return;
    try {
      await sessionService.deleteSession(id);
      setSessions(sessions.filter(s => s.id !== id));
    } catch { alert('删除失败，请稍后重试'); }
  };

  const stats = useMemo(() => ({
    total: events.length,
    pending: events.filter(e => e.status === 'pending').length,
    approved: events.filter(e => e.status === 'approved').length,
    rejected: events.filter(e => e.status === 'rejected').length,
  }), [events]);

  const getStatusBadge = (status: string) => {
    if (status === 'approved') return <span className="badge-approved"><CheckCircle2 className="w-3 h-3" /> 已通过</span>;
    if (status === 'rejected') return <span className="badge-rejected"><XCircle className="w-3 h-3" /> 已拒绝</span>;
    return <span className="badge-pending"><Clock className="w-3 h-3" /> 待审核</span>;
  };

  const statCards = [
    { label: '全部活动', value: stats.total,    color: 'bg-pop-purple', icon: Calendar },
    { label: '待审核',   value: stats.pending,  color: 'bg-pop-yellow', icon: Clock },
    { label: '已通过',   value: stats.approved, color: 'bg-primary-400', icon: CheckCircle2 },
    { label: '已拒绝',   value: stats.rejected, color: 'bg-pop-rose',    icon: XCircle },
  ];

  return (
    <div className="min-h-screen bg-primary-50 dark:bg-night-200">
      <NavHeader title="活动中心" />

      <AnimatedPage>
        <div className="container mx-auto p-4 sm:p-6 max-w-6xl">
          {/* 标题 + 操作 */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <h2 className="font-display text-3xl text-ink dark:text-primary-100 tracking-wide flex items-center gap-2">
                <Sparkles className="w-7 h-7 text-action" />
                我的<span className="text-gradient">活动</span>
              </h2>
              <p className="text-sm text-ink-muted dark:text-primary-100/60 mt-1">管理你发布的所有活动</p>
            </div>
            <Link to="/merchant/create" className="btn-action !text-sm">
              <Plus className="w-4 h-4" />
              发布新活动
            </Link>
          </div>

          {/* 统计卡片 */}
          {!loading && events.length > 0 && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {statCards.map((s, i) => {
                const Icon = s.icon;
                return (
                  <motion.div
                    key={s.label}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                    className="card-block p-4 flex items-center justify-between"
                  >
                    <div>
                      <p className="text-xs font-display text-ink-muted dark:text-primary-100/60 uppercase tracking-wider">{s.label}</p>
                      <p className="font-display text-3xl text-ink dark:text-primary-100 mt-1">{s.value}</p>
                    </div>
                    <div className={`w-12 h-12 rounded-xl ${s.color} border-3 border-ink dark:border-night-400 flex items-center justify-center`}>
                      <Icon className="w-6 h-6 text-ink" strokeWidth={2.5} />
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}

          {/* 信息条 */}
          <div className="mb-6 px-5 py-3.5 rounded-xl bg-pop-cyan/20 border-2 border-ink dark:border-night-400 text-sm text-ink dark:text-primary-200">
            {user?.role === 'personal'
              ? '✨ 个人用户发布的活动在地图上默认展示7天，提交后同样需要审核。'
              : '✨ 商户可自定义活动在地图上的展示截止时间，最长可设置为3个月。'}
          </div>

          {/* 内容 */}
          {loading ? (
            <div className="py-20"><LoadingSpinner size="lg" text="加载活动中..." /></div>
          ) : events.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="card-block p-12 text-center"
            >
              <div className="w-20 h-20 mx-auto rounded-2xl bg-pop-yellow border-3 border-ink dark:border-night-400 shadow-block flex items-center justify-center mb-4 animate-float">
                <Calendar className="w-10 h-10 text-ink" strokeWidth={2} />
              </div>
              <p className="font-display text-xl text-ink dark:text-primary-100 mb-2">还没有发布任何活动</p>
              <p className="text-ink-muted dark:text-primary-100/60 mb-6">快来发布你的第一个展会吧</p>
              <Link to="/merchant/create" className="btn-action !text-sm">
                <Plus className="w-4 h-4" />
                立即发布
              </Link>
            </motion.div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {events.map((event, index) => (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.06 }}
                  className="card-block overflow-hidden flex flex-col"
                >
                  {/* 海报 */}
                  <div className="relative overflow-hidden aspect-[16/10] border-b-3 border-ink dark:border-night-400">
                    <img
                      src={getImageUrl(event.poster_url)}
                      alt={event.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-3 right-3">
                      {getStatusBadge(event.status)}
                    </div>
                  </div>

                  {/* 信息 */}
                  <div className="p-4 flex-1 flex flex-col">
                    <h3 className="font-display text-lg text-ink dark:text-primary-100 mb-2 truncate tracking-wide">{event.name}</h3>
                    <div className="space-y-1.5 mb-4 flex-1">
                      <p className="text-sm text-ink-muted dark:text-primary-100/70 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-action flex-shrink-0" />
                        <span className="truncate">{event.venue_name}</span>
                      </p>
                      <p className="text-xs text-ink-muted dark:text-primary-100/60 flex items-center gap-1.5">
                        <Clock className="w-3 h-3 flex-shrink-0" />
                        {formatDate(event.start_time)}
                      </p>
                      <p className="text-xs text-ink-muted dark:text-primary-100/60 flex items-center gap-1.5">
                        <ImageIcon className="w-3 h-3 flex-shrink-0" />
                        展示至 {formatDate(event.display_until)}
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <Link
                        to={`/merchant/edit/${event.id}`}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-pop-purple/15 text-pop-purple font-display border-2 border-pop-purple text-sm hover:bg-pop-purple hover:text-white transition-all duration-200"
                      >
                        <Pencil className="w-4 h-4" />
                        编辑
                      </Link>
                      <button
                        onClick={() => handleDeleteEvent(event.id)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-pop-rose/15 text-pop-rose font-display border-2 border-pop-rose text-sm hover:bg-pop-rose hover:text-white transition-all duration-200"
                      >
                       <Trash2 className="w-4 h-4" />
                        删除
                       </button>

                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {/* 我的店铺 */}
          <div className="mt-10">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <h2 className="font-display text-3xl text-ink dark:text-primary-100 tracking-wide flex items-center gap-2">
                  <Store className="w-7 h-7 text-pop-purple" />
                  我的<span className="text-gradient">店铺</span>
                </h2>
                <p className="text-sm text-ink-muted dark:text-primary-100/60 mt-1">管理你发布的店铺</p>
              </div>
              <Link to="/merchant/venue/create" className="btn-primary !text-sm">
                <Plus className="w-4 h-4" />
                发布新店铺
              </Link>
            </div>

            {venues.length === 0 ? (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card-block p-10 text-center">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-pop-purple/20 border-3 border-ink dark:border-night-400 shadow-block flex items-center justify-center mb-4 animate-float">
                  <Store className="w-8 h-8 text-pop-purple" strokeWidth={2} />
                </div>
                <p className="font-display text-xl text-ink dark:text-primary-100 mb-2">还没有发布任何店铺</p>
                <Link to="/merchant/venue/create" className="btn-primary !text-sm inline-flex mt-4">
                  <Plus className="w-4 h-4" /> 立即发布
                </Link>
              </motion.div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {venues.map((venue, index) => (
                  <motion.div key={venue.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.06 }} className="card-block overflow-hidden flex flex-col">
                    <div className="relative overflow-hidden aspect-[16/10] border-b-3 border-ink dark:border-night-400 bg-pop-purple/10 flex items-center justify-center">
                      {venue.cover_url
                        ? <img src={getImageUrl(venue.cover_url)} alt={venue.name} className="w-full h-full object-cover" />
                        : <Store className="w-12 h-12 text-pop-purple/40" strokeWidth={1.5} />
                      }
                      <div className="absolute top-3 right-3">
                        {venue.status === 'approved'
                          ? <span className="badge-approved"><CheckCircle2 className="w-3 h-3" /> 已通过</span>
                          : venue.status === 'rejected'
                          ? <span className="badge-rejected"><XCircle className="w-3 h-3" /> 已拒绝</span>
                          : <span className="badge-pending"><Clock className="w-3 h-3" /> 待审核</span>
                        }
                      </div>
                    </div>
                    <div className="p-4 flex-1 flex flex-col">
                      <h3 className="font-display text-lg text-ink dark:text-primary-100 mb-2 truncate">{venue.name}</h3>
                      <div className="space-y-1 mb-4 flex-1">
                        <p className="text-sm text-ink-muted dark:text-primary-100/70 flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-pop-purple flex-shrink-0" />
                          <span className="truncate">{venue.address}</span>
                        </p>
                        {venue.business_hours && (
                          <p className="text-xs text-ink-muted dark:text-primary-100/60 flex items-center gap-1.5">
                            <Clock className="w-3 h-3 flex-shrink-0" />
                            {venue.business_hours}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Link to={`/merchant/venue/edit/${venue.id}`}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-pop-purple/15 text-pop-purple font-display border-2 border-pop-purple text-sm hover:bg-pop-purple hover:text-white transition-all duration-200">
                          <Pencil className="w-4 h-4" /> 编辑
                        </Link>
                        <button onClick={() => handleDeleteVenue(venue.id)}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-pop-rose/15 text-pop-rose font-display border-2 border-pop-rose text-sm hover:bg-pop-rose hover:text-white transition-all duration-200">
                          <Trash2 className="w-4 h-4" /> 删除
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {/* 我的组局 */}
          <div className="mt-10">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <h2 className="font-display text-3xl text-ink dark:text-primary-100 tracking-wide flex items-center gap-2">
                  <Gamepad2 className="w-7 h-7 text-blue-500" />
                  我的<span className="text-gradient">组局</span>
                </h2>
                <p className="text-sm text-ink-muted dark:text-primary-100/60 mt-1">管理你发布的组局活动</p>
              </div>
              <Link to="/merchant/session/create" className="btn-action !text-sm" style={{ background: '#3b82f6', borderColor: '#064E3B' }}>
                <Plus className="w-4 h-4" />
                发布新组局
              </Link>
            </div>

            {sessions.length === 0 ? (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card-block p-10 text-center">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-blue-100 border-3 border-ink dark:border-night-400 shadow-block flex items-center justify-center mb-4 animate-float">
                  <Gamepad2 className="w-8 h-8 text-blue-500" strokeWidth={2} />
                </div>
                <p className="font-display text-xl text-ink dark:text-primary-100 mb-2">还没有发布任何组局</p>
                <Link to="/merchant/session/create" className="btn-action !text-sm inline-flex mt-4">
                  <Plus className="w-4 h-4" /> 立即发布
                </Link>
              </motion.div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {sessions.map((session, index) => {
                  const remaining = session.total_seats - session.booked_seats;
                  return (
                    <motion.div key={session.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.06 }} className="card-block overflow-hidden flex flex-col">
                      <div className="p-4 bg-gradient-to-br from-blue-500 to-blue-700 border-b-3 border-ink dark:border-night-400 flex items-center gap-3">
                        <Gamepad2 className="w-8 h-8 text-white flex-shrink-0" strokeWidth={2} />
                        <div className="min-w-0 flex-1">
                          <h3 className="font-display text-base text-white truncate">{session.game_name}</h3>
                          <p className="text-xs text-white/80">{session.venue_name || '野生局'}</p>
                        </div>
                        {session.status === 'full'
                          ? <span className="text-xs px-2 py-0.5 rounded-lg bg-pop-rose text-white border border-white/40 flex-shrink-0">已满</span>
                          : <span className="text-xs px-2 py-0.5 rounded-lg bg-white/20 text-white border border-white/40 flex-shrink-0 flex items-center gap-1">
                              <Users className="w-3 h-3" />差{remaining}人
                            </span>
                        }
                      </div>
                      <div className="p-4 flex-1 flex flex-col">
                        <div className="space-y-1 mb-4 flex-1">
                          <p className="text-sm text-ink-muted dark:text-primary-100/70 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                            {formatDate(session.start_time)}
                          </p>
                          <p className="text-xs text-ink-muted dark:text-primary-100/60 flex items-center gap-1.5">
                            <Users className="w-3 h-3 flex-shrink-0" />
                            {session.booked_seats} / {session.total_seats} 人已报名
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Link to={`/merchant/session/edit/${session.id}`}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-blue-100 text-blue-700 font-display border-2 border-blue-400 text-sm hover:bg-blue-500 hover:text-white transition-all duration-200">
                            <Pencil className="w-4 h-4" /> 编辑
                          </Link>
                          <button onClick={() => handleDeleteSession(session.id)}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-pop-rose/15 text-pop-rose font-display border-2 border-pop-rose text-sm hover:bg-pop-rose hover:text-white transition-all duration-200">
                            <Trash2 className="w-4 h-4" /> 删除
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </AnimatedPage>
    </div>
  );
};

export default MerchantCenter;
