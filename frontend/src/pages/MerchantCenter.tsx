import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Calendar, CheckCircle2, Clock, Gamepad2, Image as ImageIcon, MapPin,
  Pencil, Plus, Sparkles, Store, Trash2, Users, XCircle,
} from 'lucide-react';
import { eventService } from '../services/eventService';
import { venueService } from '../services/venueService';
import { sessionService } from '../services/sessionService';
import { Event, Session, Venue } from '../types';
import { formatDate, getImageUrl, getStoredUser } from '../utils/helpers';
import NavHeader from '../components/NavHeader';
import AnimatedPage from '../components/AnimatedPage';
import LoadingSpinner from '../components/LoadingSpinner';
import ScrollToTop from '../components/ScrollToTop';

type CenterTab = 'events' | 'venues' | 'sessions' | 'dance';

type TabConfig = {
  key: CenterTab;
  label: string;
  icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  iconSrc?: string;
  colorClass: string;
  activeClass: string;
  countClass: string;
};

const tabConfig: TabConfig[] = [
  { key: 'events', label: '展会活动', icon: Calendar, colorClass: 'bg-action', activeClass: 'border-action bg-action text-white', countClass: 'bg-white/20 text-white' },
  { key: 'venues', label: '商铺', icon: Store, colorClass: 'bg-pop-purple', activeClass: 'border-pop-purple bg-pop-purple text-white', countClass: 'bg-white/20 text-white' },
  { key: 'sessions', label: '组局', icon: Gamepad2, colorClass: 'bg-blue-600', activeClass: 'border-blue-600 bg-blue-600 text-white', countClass: 'bg-white/20 text-white' },
  { key: 'dance', label: "let's dance!", iconSrc: '/icons/lets-dance.svg', colorClass: 'bg-pop-pink', activeClass: 'border-pop-pink bg-pop-pink text-white', countClass: 'bg-white/20 text-white' },
];

const isDanceSession = (session: Session) => session.game_type === 'dance';

const LetsDanceIcon = ({ className = 'h-5 w-5', size = 'sm' }: { className?: string; size?: 'sm' | 'lg' }) => (
  <span className={`${size === 'lg' ? 'h-16 w-16 rounded-2xl border-3' : 'h-9 w-9 rounded-xl border-2'} flex flex-shrink-0 items-center justify-center border-ink bg-pop-pink text-white shadow-block-sm`}>
    <img src="/icons/lets-dance.svg" alt="" className={`${className} drop-shadow-[0_1px_1px_rgba(6,78,59,0.85)]`} />
  </span>
);

const TabIconBadge = ({ tab }: { tab: TabConfig }) => {
  const Icon = tab.icon;
  if (tab.iconSrc) return <LetsDanceIcon className="h-5 w-5" />;
  return (
    <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border-2 border-ink text-white shadow-block-sm ${tab.colorClass}`}>
      {Icon ? <Icon className="h-5 w-5 flex-shrink-0" strokeWidth={2.4} /> : null}
    </span>
  );
};

const MerchantCenter: React.FC = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeTab, setActiveTab] = useState<CenterTab>('events');
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
  }, [navigate, user?.role]);

  const danceSessions = useMemo(() => sessions.filter(isDanceSession), [sessions]);
  const regularSessions = useMemo(() => sessions.filter(s => !isDanceSession(s)), [sessions]);

  const counts: Record<CenterTab, number> = {
    events: events.length,
    venues: venues.length,
    sessions: regularSessions.length,
    dance: danceSessions.length,
  };

  const handleDeleteEvent = async (id: number) => {
    if (!window.confirm('确定要删除这个展会吗？')) return;
    try {
      await eventService.deleteEvent(id);
      setEvents(prev => prev.filter(e => e.id !== id));
    } catch {
      alert('删除失败，请稍后重试');
    }
  };

  const handleDeleteVenue = async (id: number) => {
    if (!window.confirm('确定要删除这个商铺吗？')) return;
    try {
      await venueService.deleteVenue(id);
      setVenues(prev => prev.filter(v => v.id !== id));
    } catch {
      alert('删除失败，请稍后重试');
    }
  };

  const handleDeleteSession = async (id: number, dance = false) => {
    if (!window.confirm(dance ? '确定要删除这个宅舞召集吗？' : '确定要删除这个组局吗？')) return;
    try {
      await sessionService.deleteSession(id);
      setSessions(prev => prev.filter(s => s.id !== id));
    } catch {
      alert('删除失败，请稍后重试');
    }
  };

  const getStatusBadge = (status: string) => {
    if (status === 'approved') return <span className="badge-approved"><CheckCircle2 className="h-3 w-3" /> 已通过</span>;
    if (status === 'rejected') return <span className="badge-rejected"><XCircle className="h-3 w-3" /> 已拒绝</span>;
    return <span className="badge-pending"><Clock className="h-3 w-3" /> 待审核</span>;
  };

  const EmptyState = ({ icon: Icon, iconSrc, title, action, to }: { icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>; iconSrc?: string; title: string; action: string; to: string }) => (
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="card-block font-puhuiti-full p-10 text-center">
      <div className={`mx-auto mb-4 flex h-16 w-16 animate-float items-center justify-center rounded-2xl ${iconSrc ? '' : 'border-3 border-ink bg-primary-100 shadow-block dark:border-night-400 dark:bg-night-100'}`}>
        {iconSrc ? <LetsDanceIcon className="h-9 w-9" size="lg" /> : Icon ? <Icon className="h-8 w-8 text-action" strokeWidth={2.2} /> : null}
      </div>
      <p className="font-puhuiti-full mb-3 text-xl font-bold text-ink dark:text-primary-100">{title}</p>
      <Link to={to} className="btn-action font-puhuiti-full !text-sm inline-flex"><Plus className="h-4 w-4" /> {action}</Link>
    </motion.div>
  );

  const renderEvents = () => events.length === 0 ? (
    <EmptyState icon={Calendar} title="还没有发布任何展会" action="发布新展会" to="/merchant/create" />
  ) : (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
      {events.map((event, index) => (
        <motion.div key={event.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }} className="card-block overflow-hidden flex flex-col">
          <div className="relative h-40 bg-primary-100 dark:bg-night-200">
            {event.poster_url ? <img src={getImageUrl(event.poster_url, 'preview')} alt={event.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><ImageIcon className="h-12 w-12 text-ink-muted" /></div>}
            <div className="absolute right-3 top-3">{getStatusBadge(event.status)}</div>
          </div>
          <div className="flex flex-1 flex-col p-4">
            <h3 className="mb-2 line-clamp-2 font-display text-lg text-ink dark:text-primary-100">{event.name}</h3>
            <div className="mb-4 flex-1 space-y-1 text-sm text-ink-muted dark:text-primary-100/70">
              <p className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{event.venue_name}</p>
              <p className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{formatDate(event.start_time)}</p>
            </div>
            <div className="flex gap-2">
              <Link to={`/merchant/edit/${event.id}`} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border-2 border-primary-600 bg-primary-100 py-2 text-sm font-display text-primary-700 transition-all hover:bg-primary-600 hover:text-white"><Pencil className="h-4 w-4" /> 编辑</Link>
              <button onClick={() => handleDeleteEvent(event.id)} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border-2 border-pop-rose bg-pop-rose/15 py-2 text-sm font-display text-pop-rose transition-all hover:bg-pop-rose hover:text-white"><Trash2 className="h-4 w-4" /> 删除</button>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );

  const renderVenues = () => venues.length === 0 ? (
    <EmptyState icon={Store} title="还没有发布任何商铺" action="发布新商铺" to="/merchant/venue/create" />
  ) : (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
      {venues.map((venue, index) => (
        <motion.div key={venue.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }} className="card-block overflow-hidden flex flex-col">
          <div className="relative h-40 bg-primary-100 dark:bg-night-200">
            {venue.cover_url ? <img src={getImageUrl(venue.cover_url, 'preview')} alt={venue.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><Store className="h-12 w-12 text-ink-muted" /></div>}
            <div className="absolute right-3 top-3">{getStatusBadge(venue.status)}</div>
          </div>
          <div className="flex flex-1 flex-col p-4">
            <h3 className="mb-2 truncate font-display text-lg text-ink dark:text-primary-100">{venue.name}</h3>
            <div className="mb-4 flex-1 space-y-1 text-sm text-ink-muted dark:text-primary-100/70">
              <p className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{venue.address}</p>
              {venue.phone && <p>电话：{venue.phone}</p>}
            </div>
            <div className="flex gap-2">
              <Link to={`/merchant/venue/edit/${venue.id}`} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border-2 border-pop-purple bg-pop-purple/15 py-2 text-sm font-display text-ink transition-all hover:bg-pop-purple"><Pencil className="h-4 w-4" /> 编辑</Link>
              <button onClick={() => handleDeleteVenue(venue.id)} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border-2 border-pop-rose bg-pop-rose/15 py-2 text-sm font-display text-pop-rose transition-all hover:bg-pop-rose hover:text-white"><Trash2 className="h-4 w-4" /> 删除</button>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );

  const renderSessions = (items: Session[], dance = false) => items.length === 0 ? (
    <EmptyState icon={dance ? undefined : Gamepad2} iconSrc={dance ? '/icons/lets-dance.svg' : undefined} title={dance ? '还没有发布任何宅舞召集' : '还没有发布任何组局'} action={dance ? '发布宅舞召集' : '发布新组局'} to={dance ? '/merchant/session/create?type=dance' : '/merchant/session/create'} />
  ) : (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
      {items.map((session, index) => {
        const remaining = Math.max(0, session.total_seats - session.booked_seats);
        return (
          <motion.div key={session.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }} className="card-block overflow-hidden flex flex-col">
            <div className={`flex items-center gap-3 border-b-3 border-ink p-4 dark:border-night-400 ${dance ? 'bg-gradient-to-br from-pop-pink to-action' : 'bg-gradient-to-br from-blue-500 to-blue-700'}`}>
              {dance ? <LetsDanceIcon className="h-5 w-5" /> : <Gamepad2 className="h-8 w-8 flex-shrink-0 text-white" strokeWidth={2} />}
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-display text-base text-white">{session.game_name}</h3>
                <p className="truncate text-xs text-white/80">{session.venue_name || session.address || '自定义地点'}</p>
              </div>
              {session.status === 'full'
                ? <span className="flex-shrink-0 rounded-lg border border-white/40 bg-pop-rose px-2 py-0.5 text-xs text-white">已满</span>
                : <span className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-white/40 bg-white/20 px-2 py-0.5 text-xs text-white"><Users className="h-3 w-3" />剩 {remaining} 人</span>}
            </div>
            <div className="flex flex-1 flex-col p-4">
              <div className="mb-4 flex-1 space-y-1 text-sm text-ink-muted dark:text-primary-100/70">
                <p className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{formatDate(session.start_time)}</p>
                <p className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{session.booked_seats} / {session.total_seats} 人已报名</p>
                {session.price_per_person && <p>人均：{session.price_per_person}</p>}
              </div>
              <div className="flex gap-2">
                <Link to={`/merchant/session/edit/${session.id}`} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border-2 border-blue-400 bg-blue-100 py-2 text-sm font-display text-blue-700 transition-all hover:bg-blue-500 hover:text-white"><Pencil className="h-4 w-4" /> 编辑</Link>
                <button onClick={() => handleDeleteSession(session.id, dance)} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border-2 border-pop-rose bg-pop-rose/15 py-2 text-sm font-display text-pop-rose transition-all hover:bg-pop-rose hover:text-white"><Trash2 className="h-4 w-4" /> 删除</button>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );

  const renderActiveContent = () => {
    if (loading) return <div className="py-20"><LoadingSpinner text="加载中..." /></div>;
    if (activeTab === 'events') return renderEvents();
    if (activeTab === 'venues') return renderVenues();
    if (activeTab === 'sessions') return renderSessions(regularSessions);
    return renderSessions(danceSessions, true);
  };

  return (
    <div className="min-h-screen bg-primary-50 dark:bg-night-200">
      <NavHeader title="活动中心" />
      <AnimatedPage>
        <div className="container mx-auto max-w-6xl p-4 sm:p-6">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 font-display text-3xl tracking-wide text-ink dark:text-primary-100">
                <Sparkles className="h-7 w-7 text-action" />
                我的<span className="text-gradient">发布</span>
              </h2>
              <p className="mt-1 text-sm text-ink-muted dark:text-primary-100/60">按类型管理你发布过的内容。</p>
            </div>
            <Link to="/merchant/create" className="btn-action !text-sm"><Plus className="h-4 w-4" /> 发布新展会</Link>
          </div>

          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {tabConfig.map(tab => {
              const active = activeTab === tab.key;
              return (
                <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} className={`flex items-center justify-between rounded-2xl border-3 px-4 py-3 text-left shadow-block-sm transition-all ${active ? tab.activeClass : 'border-ink bg-white text-ink hover:-translate-y-0.5 hover:shadow-block dark:border-night-400 dark:bg-night-100 dark:text-primary-100'}`}>
                  <span className="flex min-w-0 items-center gap-2">
                    <TabIconBadge tab={tab} />
                    <span className="truncate font-display text-sm">{tab.label}</span>
                  </span>
                  <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-bold ${active ? tab.countClass : 'bg-primary-100 text-ink dark:bg-night-200 dark:text-primary-100'}`}>{counts[tab.key]}</span>
                </button>
              );
            })}
          </div>

          {renderActiveContent()}
        </div>
      </AnimatedPage>
      <ScrollToTop />
    </div>
  );
};

export default MerchantCenter;


