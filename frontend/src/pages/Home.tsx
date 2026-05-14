import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import AMapLoader from '@amap/amap-jsapi-loader';
import {
  Calendar, MapPin, Clock, Building2, Ticket, FileText, User,
  Search, Plus, Menu, X, Sparkles, ExternalLink, Shuffle, Store, Navigation, Phone, Gamepad2, Users, Heart,
} from 'lucide-react';
import { eventService } from '../services/eventService';
import { venueService } from '../services/venueService';
import { sessionService } from '../services/sessionService';
import { favoriteService } from '../services/favoriteService';
import { Event, Venue, Session } from '../types';
import { formatDate, getImageUrl, isAuthenticated } from '../utils/helpers';
import { AMAP_KEY } from '../utils/amapConfig';
import NavHeader from '../components/NavHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import NavMenu from '../components/NavMenu';
import { useTheme } from '../contexts/ThemeContext';

type TabType = 'all' | 'events' | 'venues' | 'sessions';

// ==========================================================================
// 侧边栏内容（提取到组件外部，避免每次父组件渲染都重新创建导致 input 失焦）
// ==========================================================================
interface SidebarContentProps {
  events: Event[];
  venues: Venue[];
  sessions: Session[];
  filteredEvents: Event[];
  filteredVenues: Venue[];
  filteredSessions: Session[];
  selectedEvent: Event | null;
  selectedVenue: Venue | null;
  selectedSession: Session | null;
  searchQuery: string;
  loading: boolean;
  tab: TabType;
  onTabChange: (t: TabType) => void;
  onSearchChange: (q: string) => void;
  onEventClick: (e: Event) => void;
  onVenueClick: (v: Venue) => void;
  onSessionClick: (s: Session) => void;
  isMobile?: boolean;
}

const DIFFICULTY_LABEL: Record<string, string> = { beginner: '新手友好', intermediate: '中等', advanced: '高难度' };
const GAME_TYPE_LABEL: Record<string, string> = { boardgame: '桌游', murder_mystery: '谋杀之谜', card: '卡牌', other: '其他' };

const SidebarContent: React.FC<SidebarContentProps> = ({
  events, venues, sessions, filteredEvents, filteredVenues, filteredSessions,
  selectedEvent, selectedVenue, selectedSession, searchQuery, loading,
  tab, onTabChange, onSearchChange, onEventClick, onVenueClick, onSessionClick,
  isMobile = false,
}) => (
  <>
    {/* 头部块 */}
    <div className="p-5 bg-action border-b-3 border-ink dark:border-night-400 relative overflow-hidden">
      <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-pop-yellow border-3 border-ink opacity-80" />
      <div className="absolute -bottom-6 -left-6 w-16 h-16 rounded-2xl bg-pop-purple border-3 border-ink opacity-70 rotate-12" />
      <div className="relative">
        <h2 className="font-display text-2xl text-white tracking-wide flex items-center gap-2">
          <Calendar className="w-6 h-6" strokeWidth={2.5} />
          附近发现
        </h2>
        <p className="text-sm text-white/85 mt-1 font-medium">
          {events.length} 场展会 · {venues.length} 家店铺 · {sessions.length} 个组局
        </p>
      </div>
    </div>

    {/* Tab 切换 */}
    <div className="flex border-b-3 border-ink dark:border-night-400 bg-white dark:bg-night-100">
      {([['all', '全部'], ['events', '展会'], ['venues', '店铺'], ['sessions', '组局']] as [TabType, string][]).map(([t, label]) => (
        <button key={t} type="button" onClick={() => onTabChange(t)}
          className={`flex-1 py-2.5 text-xs font-display transition-colors duration-200 ${
            tab === t
              ? 'text-action border-b-3 border-action -mb-[3px]'
              : 'text-ink-muted dark:text-primary-100/60 hover:text-ink dark:hover:text-primary-100'
          }`}>
          {label}
        </button>
      ))}
    </div>

    {/* 搜索 */}
    <div className="p-3 bg-white dark:bg-night-100 border-b-3 border-ink dark:border-night-400">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted dark:text-primary-100/60 pointer-events-none" />
        <input
          type="search"
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          placeholder={tab === 'venues' ? '搜索店铺、地址...' : '搜索展会、场馆、地址...'}
          autoComplete="off"
          className="w-full pl-10 pr-3 py-2.5 rounded-lg border-2 border-ink dark:border-night-400 bg-primary-50 dark:bg-night-200 text-sm text-ink dark:text-primary-100 placeholder:text-ink-muted/60 focus:outline-none focus:ring-3 focus:ring-action/30"
        />
      </div>
    </div>

    {/* 列表 */}
    <AnimatePresence mode="wait">
    <motion.div key={tab} className="bg-white dark:bg-night-100"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}>
      {/* 展会列表 */}
      {(tab === 'all' || tab === 'events') && filteredEvents.map((event, index) => (
        <motion.div key={`e-${event.id}`}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: 'easeOut', delay: Math.min(index * 0.03, 0.24) }}
          onClick={() => onEventClick(event)}
          className={`p-4 cursor-pointer transition-all duration-200 border-b-2 ${
            selectedEvent?.id === event.id
              ? 'bg-action/15 dark:bg-action/20 border-l-4 border-l-action border-b-ink dark:border-b-night-400'
              : 'border-b-ink/10 dark:border-b-night-400 border-l-4 border-l-transparent hover:bg-primary-50 dark:hover:bg-night-50'
          }`}
        >
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-16 h-16 sm:w-[76px] sm:h-[76px] rounded-xl overflow-hidden border-3 border-ink dark:border-night-400 shadow-block-sm">
              <img src={getImageUrl(event.poster_url)} alt={event.name} className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <h3 className="font-display text-base text-ink dark:text-primary-100 truncate tracking-wide">{event.name}</h3>
              <p className="text-xs text-ink-muted dark:text-primary-100/70 flex items-center gap-1 truncate">
                <MapPin className="w-3.5 h-3.5 text-action flex-shrink-0" />
                <span className="truncate">{event.venue_name}</span>
              </p>
              <p className="text-xs text-ink-muted dark:text-primary-100/60 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                {formatDate(event.start_time)}
              </p>
              {event.ticket_price && (
                <span className="inline-block text-xs font-display font-bold text-action bg-action/15 px-2 py-0.5 rounded-md border-2 border-action">
                  {event.ticket_price}
                </span>
              )}
            </div>
          </div>
        </motion.div>
      ))}

      {/* 店铺列表 */}
      {(tab === 'all' || tab === 'venues') && filteredVenues.map((venue, index) => (
        <motion.div key={`v-${venue.id}`}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: 'easeOut', delay: Math.min(index * 0.03, 0.24) }}
          onClick={() => onVenueClick(venue)}
          className={`p-4 cursor-pointer transition-all duration-200 border-b-2 ${
            selectedVenue?.id === venue.id
              ? 'bg-pop-purple/15 dark:bg-pop-purple/20 border-l-4 border-l-pop-purple border-b-ink dark:border-b-night-400'
              : 'border-b-ink/10 dark:border-b-night-400 border-l-4 border-l-transparent hover:bg-primary-50 dark:hover:bg-night-50'
          }`}
        >
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden border-3 border-ink dark:border-night-400 shadow-block-sm bg-pop-purple/20 flex items-center justify-center">
              {venue.cover_url
                ? <img src={getImageUrl(venue.cover_url)} alt={venue.name} className="w-full h-full object-cover" />
                : <Store className="w-7 h-7 text-pop-purple" strokeWidth={2} />
              }
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <h3 className="font-display text-base text-ink dark:text-primary-100 truncate tracking-wide">{venue.name}</h3>
              <p className="text-xs text-ink-muted dark:text-primary-100/70 flex items-center gap-1 truncate">
                <MapPin className="w-3.5 h-3.5 text-pop-purple flex-shrink-0" />
                <span className="truncate">{venue.address}</span>
              </p>
              {venue.business_hours && (
                <p className="text-xs text-ink-muted dark:text-primary-100/60 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                  {venue.business_hours}
                </p>
              )}
            </div>
          </div>
        </motion.div>
      ))}

      {/* 组局列表 */}
      {(tab === 'all' || tab === 'sessions') && filteredSessions.map((session, index) => {
        const remaining = session.total_seats - session.booked_seats;
        return (
          <motion.div key={`s-${session.id}`}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut', delay: Math.min(index * 0.03, 0.24) }}
            onClick={() => onSessionClick(session)}
            className={`p-4 cursor-pointer transition-all duration-200 border-b-2 ${
              selectedSession?.id === session.id
                ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-l-blue-500 border-b-ink dark:border-b-night-400'
                : 'border-b-ink/10 dark:border-b-night-400 border-l-4 border-l-transparent hover:bg-primary-50 dark:hover:bg-night-50'
            }`}
          >
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-16 h-16 rounded-xl bg-blue-100 dark:bg-blue-900/30 border-3 border-ink dark:border-night-400 shadow-block-sm flex items-center justify-center">
                <Gamepad2 className="w-7 h-7 text-blue-600 dark:text-blue-400" strokeWidth={2} />
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <h3 className="font-display text-base text-ink dark:text-primary-100 truncate">{session.game_name}</h3>
                <p className="text-xs text-ink-muted dark:text-primary-100/70 flex items-center gap-1 truncate">
                  <MapPin className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                  <span className="truncate">{session.venue_name || '野生局'}</span>
                </p>
                <p className="text-xs text-ink-muted dark:text-primary-100/60 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                  {formatDate(session.start_time)}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700">
                    {DIFFICULTY_LABEL[session.difficulty]}
                  </span>
                  {session.status === 'full'
                    ? <span className="text-xs px-2 py-0.5 rounded-md bg-pop-rose/15 text-pop-rose border border-pop-rose font-bold">已满</span>
                    : <span className="text-xs px-2 py-0.5 rounded-md bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border border-primary-300 dark:border-primary-700 flex items-center gap-1">
                        <Users className="w-3 h-3" />还差 {remaining} 人
                      </span>
                  }
                </div>
              </div>
            </div>
          </motion.div>
        );
      })}

      {/* 空状态 */}
      {!loading && filteredEvents.length === 0 && (tab === 'events' || tab === 'all') && (
        <div className={`empty-state ${isMobile ? 'py-8' : ''}`}>
          <p className="font-display text-base text-ink dark:text-primary-100">
            {searchQuery ? '没有匹配的展会' : '暂无展会信息'}
          </p>
        </div>
      )}
      {!loading && filteredVenues.length === 0 && (tab === 'venues') && (
        <div className={`empty-state ${isMobile ? 'py-8' : ''}`}>
          <p className="font-display text-base text-ink dark:text-primary-100">
            {searchQuery ? '没有匹配的店铺' : '暂无店铺信息'}
          </p>
        </div>
      )}
      {!loading && filteredSessions.length === 0 && (tab === 'sessions') && (
        <div className={`empty-state ${isMobile ? 'py-8' : ''}`}>
          <p className="font-display text-base text-ink dark:text-primary-100">暂无组局信息</p>
        </div>
      )}
    </motion.div>
    </AnimatePresence>
  </>
);

// ==========================================================================
// 首页主组件
// ==========================================================================
const Home: React.FC = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [venueSessions, setVenueSessions] = useState<Session[]>([]); // 店铺 Modal 内的组局列表
  const [registeringId, setRegisteringId] = useState<number | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set()); // "event-1", "venue-2", "session-3"
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const isMountedRef = useRef(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [tab, setTab] = useState<TabType>('all');
  const [navMenuOpen, setNavMenuOpen] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const mapRef = useRef<any>(null);
  const mapInstance = useRef<any>(null);
  const amapRef = useRef<any>(null);
  const eventMarkers = useRef<any[]>([]);
  const venueMarkers = useRef<any[]>([]);
  const sessionMarkers = useRef<any[]>([]);
  const navigate = useNavigate();
  const { theme } = useTheme();

  useEffect(() => {
    isMountedRef.current = true;
    loadData();
    initMap();
    return () => {
      isMountedRef.current = false;
      if (mapInstance.current) {
        mapInstance.current.destroy();
        mapInstance.current = null;
      }
    };
  }, []);

  const loadData = async () => {
    try {
      const [evRes, vRes, sRes] = await Promise.all([
        eventService.getPublicEvents(),
        venueService.getPublicVenues(),
        sessionService.getPublicSessions(),
      ]);
      if (!isMountedRef.current) return;
      setEvents(evRes.events);
      setVenues(vRes.venues);
      setSessions(sRes.sessions);
      // 加载收藏状态（用轻量接口，只返回 key 集合）
      if (isAuthenticated()) {
        favoriteService.getMyFavoriteKeys().then(r => {
          if (isMountedRef.current) setFavorites(new Set(r.keys));
        }).catch(() => {});
      }
    } catch (e) {
      console.error('Failed to load data:', e);
      if (isMountedRef.current) setLoadError(true);
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  };

  const initMap = async () => {
    try {
      const AMap = await AMapLoader.load({
        key: AMAP_KEY,
        version: '2.0',
        plugins: ['AMap.Marker', 'AMap.InfoWindow', 'AMap.Geolocation', 'AMap.CitySearch'],
      });

      let initialCenter: [number, number] = [116.397428, 39.90923];

      // 1. 尝试精确 GPS 定位
      const located = await new Promise<boolean>((resolve) => {
        const geo = new AMap.Geolocation({ enableHighAccuracy: true, timeout: 5000 });
        geo.getCurrentPosition((status: string, result: any) => {
          if (status === 'complete' && result.position) {
            initialCenter = [result.position.lng, result.position.lat];
            resolve(true);
          } else {
            resolve(false);
          }
        });
      });

      // 2. GPS 失败 → fallback 到城市中心点
      if (!located) {
        await new Promise<void>((resolve) => {
          const citySearch = new AMap.CitySearch();
          citySearch.getLocalCity((status: string, result: any) => {
            if (status === 'complete' && result.rectangle) {
              const bounds = result.rectangle.split(';');
              const [lng1, lat1] = bounds[0].split(',').map(Number);
              const [lng2, lat2] = bounds[1].split(',').map(Number);
              initialCenter = [(lng1 + lng2) / 2, (lat1 + lat2) / 2];
            }
            resolve();
          });
        });
      }

      const map = new AMap.Map(mapRef.current, {
        zoom: 12,
        center: initialCenter,
        viewMode: '3D',
        mapStyle: theme === 'dark' ? 'amap://styles/dark' : 'amap://styles/normal',
      });

      mapInstance.current = map;
      amapRef.current = AMap;
      if (isMountedRef.current) setMapReady(true);
    } catch (e) { console.error('Failed to load map:', e); }
  };

  // 主题切换时同步地图样式
  useEffect(() => {
    if (mapInstance.current) {
      mapInstance.current.setMapStyle(theme === 'dark' ? 'amap://styles/dark' : 'amap://styles/normal');
    }
  }, [theme]);

  useEffect(() => {
    if (mapReady && mapInstance.current) {
      addEventMarkers();
      addVenueMarkers();
      addSessionMarkers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, venues, sessions, mapReady]);

  // Tab 切换时控制 marker 显示/隐藏（数据未变化时也需要响应）
  useEffect(() => {
    eventMarkers.current.forEach(m => m.setMap(tab === 'venues' || tab === 'sessions' ? null : mapInstance.current));
    venueMarkers.current.forEach(m => m.setMap(tab === 'events' || tab === 'sessions' ? null : mapInstance.current));
    sessionMarkers.current.forEach(m => m.setMap(tab === 'events' || tab === 'venues' ? null : mapInstance.current));
  }, [tab]);

  const addEventMarkers = () => {
    const AMap = amapRef.current;
    if (!AMap) return;
    eventMarkers.current.forEach(m => m.setMap(null));
    eventMarkers.current = [];
    events.forEach((event) => {
      const div = document.createElement('div');
      const src = getImageUrl(event.poster_url);
      // 使用 DOM API 设置文本内容，避免 XSS
      const outer = document.createElement('div');
      outer.style.cssText = 'width:56px;height:68px;position:relative;cursor:pointer;transition:transform 0.2s ease';
      outer.onmouseenter = () => { outer.style.transform = 'translateY(-4px) scale(1.05)'; };
      outer.onmouseleave = () => { outer.style.transform = 'translateY(0) scale(1)'; };
      const box = document.createElement('div');
      box.style.cssText = 'width:56px;height:56px;border-radius:14px;overflow:hidden;border:3px solid #064E3B;background:#fff;box-shadow:4px 4px 0 0 rgba(6,78,59,1)';
      const img = document.createElement('img');
      img.src = src; img.style.cssText = 'width:100%;height:100%;object-fit:cover';
      img.onerror = () => { img.style.display = 'none'; };
      box.appendChild(img);
      const arrow = document.createElement('div');
      arrow.style.cssText = 'width:0;height:0;margin:2px auto 0;border-left:8px solid transparent;border-right:8px solid transparent;border-top:10px solid #064E3B';
      outer.appendChild(box); outer.appendChild(arrow);
      div.appendChild(outer);
      const marker = new AMap.Marker({ position: [event.longitude, event.latitude], content: div, anchor: 'bottom-center' });
      marker.on('click', () => {
        setSelectedEvent(event); setSelectedVenue(null);
        setIsMobileSidebarOpen(false);
        mapInstance.current.setCenter([event.longitude, event.latitude]);
      });
      marker.setMap(mapInstance.current);
      eventMarkers.current.push(marker);
    });
  };

  const addVenueMarkers = () => {
    const AMap = amapRef.current;
    if (!AMap) return;
    venueMarkers.current.forEach(m => m.setMap(null));
    venueMarkers.current = [];
    venues.forEach((venue) => {
      const div = document.createElement('div');
      const outer = document.createElement('div');
      outer.style.cssText = 'width:52px;height:64px;position:relative;cursor:pointer;transition:transform 0.2s ease';
      outer.onmouseenter = () => { outer.style.transform = 'translateY(-4px) scale(1.05)'; };
      outer.onmouseleave = () => { outer.style.transform = 'translateY(0) scale(1)'; };
      const box = document.createElement('div');
      box.style.cssText = 'width:52px;height:52px;border-radius:14px;overflow:hidden;border:3px solid #064E3B;background:#7C3AED;box-shadow:4px 4px 0 0 rgba(6,78,59,1);display:flex;align-items:center;justify-content:center';
      if (venue.cover_url) {
        const img = document.createElement('img');
        img.src = getImageUrl(venue.cover_url); img.style.cssText = 'width:100%;height:100%;object-fit:cover';
        img.onerror = () => { img.style.display = 'none'; };
        box.appendChild(img);
      } else {
        const span = document.createElement('span');
        span.style.cssText = 'color:#fff;font-size:18px;font-weight:700';
        span.textContent = venue.name.charAt(0); // textContent 安全，不会 XSS
        box.appendChild(span);
      }
      const arrow = document.createElement('div');
      arrow.style.cssText = 'width:0;height:0;margin:2px auto 0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:9px solid #064E3B';
      outer.appendChild(box); outer.appendChild(arrow);
      div.appendChild(outer);
      const marker = new AMap.Marker({ position: [venue.longitude, venue.latitude], content: div, anchor: 'bottom-center' });
      marker.on('click', () => {
        setSelectedVenue(venue); setSelectedEvent(null); setSelectedSession(null);
        setNavMenuOpen(false);
        setIsMobileSidebarOpen(false);
        mapInstance.current.setCenter([venue.longitude, venue.latitude]);
        // 加载该店铺的组局列表
        sessionService.getVenueSessions(venue.id).then(r => setVenueSessions(r.sessions)).catch(() => setVenueSessions([]));
      });
      marker.setMap(mapInstance.current);
      venueMarkers.current.push(marker);
    });
  };

  const addSessionMarkers = () => {
    const AMap = amapRef.current;
    if (!AMap) return;
    sessionMarkers.current.forEach(m => m.setMap(null));
    sessionMarkers.current = [];
    sessions.forEach((session) => {
      if (!session.latitude || !session.longitude) return;
      const div = document.createElement('div');
      const outer = document.createElement('div');
      outer.style.cssText = 'width:48px;height:60px;position:relative;cursor:pointer;transition:transform 0.2s ease';
      outer.onmouseenter = () => { outer.style.transform = 'translateY(-4px) scale(1.05)'; };
      outer.onmouseleave = () => { outer.style.transform = 'translateY(0) scale(1)'; };
      const box = document.createElement('div');
      box.style.cssText = 'width:48px;height:48px;border-radius:14px;border:3px solid #064E3B;background:#2563EB;box-shadow:4px 4px 0 0 rgba(6,78,59,1);display:flex;align-items:center;justify-content:center';
      const svgNS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('width', '26'); svg.setAttribute('height', '26');
      svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', '#fff'); svg.setAttribute('stroke-width', '2');
      svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
      // Gamepad2 icon paths
      const p1 = document.createElementNS(svgNS, 'line'); p1.setAttribute('x1', '6'); p1.setAttribute('y1', '12'); p1.setAttribute('x2', '10'); p1.setAttribute('y2', '12'); svg.appendChild(p1);
      const p2 = document.createElementNS(svgNS, 'line'); p2.setAttribute('x1', '8'); p2.setAttribute('y1', '10'); p2.setAttribute('x2', '8'); p2.setAttribute('y2', '14'); svg.appendChild(p2);
      const p3 = document.createElementNS(svgNS, 'circle'); p3.setAttribute('cx', '15'); p3.setAttribute('cy', '12'); p3.setAttribute('r', '1'); svg.appendChild(p3);
      const p4 = document.createElementNS(svgNS, 'circle'); p4.setAttribute('cx', '17'); p4.setAttribute('cy', '10'); p4.setAttribute('r', '1'); svg.appendChild(p4);
      const p5 = document.createElementNS(svgNS, 'path'); p5.setAttribute('d', 'M6 9h12l1.5 9H4.5L6 9z'); svg.appendChild(p5);
      box.appendChild(svg);
      const arrow = document.createElement('div');
      arrow.style.cssText = 'width:0;height:0;margin:2px auto 0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:9px solid #064E3B';
      outer.appendChild(box); outer.appendChild(arrow);
      div.appendChild(outer);
      const marker = new AMap.Marker({ position: [session.longitude, session.latitude], content: div, anchor: 'bottom-center' });
      marker.on('click', () => {
        setSelectedSession(session); setSelectedEvent(null); setSelectedVenue(null);
        setIsMobileSidebarOpen(false);
        mapInstance.current.setCenter([session.longitude, session.latitude]);
        mapInstance.current.setZoom(16);
      });
      marker.setMap(mapInstance.current);
      sessionMarkers.current.push(marker);
    });
  };

  const handleEventClick = useCallback((event: Event) => {
    setSelectedEvent(event); setSelectedVenue(null);
    setNavMenuOpen(false);
    setIsMobileSidebarOpen(false);
    if (mapInstance.current) {
      mapInstance.current.setCenter([event.longitude, event.latitude]);
      mapInstance.current.setZoom(15);
    }
  }, []);

  const handleVenueClick = useCallback((venue: Venue) => {
    setSelectedVenue(venue); setSelectedEvent(null); setSelectedSession(null);
    setNavMenuOpen(false);
    setIsMobileSidebarOpen(false);
    if (mapInstance.current) {
      mapInstance.current.setCenter([venue.longitude, venue.latitude]);
      mapInstance.current.setZoom(16);
    }
    sessionService.getVenueSessions(venue.id).then(r => setVenueSessions(r.sessions)).catch(() => setVenueSessions([]));
  }, []);

  const handleSessionClick = useCallback((session: Session) => {
    setSelectedSession(session); setSelectedEvent(null); setSelectedVenue(null);
    setNavMenuOpen(false);
    setIsMobileSidebarOpen(false);
    if (mapInstance.current) {
      mapInstance.current.setCenter([session.longitude, session.latitude]);
      mapInstance.current.setZoom(16);
    }
  }, []);

  const handleTabChange = useCallback((t: TabType) => { setTab(t); }, []);

  const handleSearchChange = useCallback((q: string) => { setSearchQuery(q); }, []);

  useEffect(() => {
    document.body.style.overflow = isMobileSidebarOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isMobileSidebarOpen]);

  // 搜索过滤
  const filteredEvents = events.filter(e =>
    !searchQuery ||
    e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.venue_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleToggleFavorite = async (type: 'event' | 'venue' | 'session', id: number) => {
    if (!isAuthenticated()) { navigate('/login'); return; }
    const key = `${type}-${id}`;
    const wasFavorited = favorites.has(key);
    // 乐观更新
    setFavorites(prev => {
      const next = new Set(prev);
      wasFavorited ? next.delete(key) : next.add(key);
      return next;
    });
    try {
      await favoriteService.toggle(type, id);
    } catch {
      // 失败时回滚
      setFavorites(prev => {
        const next = new Set(prev);
        wasFavorited ? next.add(key) : next.delete(key);
        return next;
      });
    }
  };

  const filteredVenues = venues.filter(v =>
    !searchQuery ||
    v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredSessions = sessions.filter(s =>
    !searchQuery ||
    s.game_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.venue_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 随机切换到另一个展会
  const handleRandomNext = () => {
    if (events.length <= 1) {
      setSelectedEvent(null);
      return;
    }
    const others = events.filter(e => e.id !== selectedEvent?.id);
    const next = others[Math.floor(Math.random() * others.length)];
    setSelectedEvent(next);
    if (mapInstance.current) {
      mapInstance.current.setCenter([next.longitude, next.latitude]);
      mapInstance.current.setZoom(15);
    }
  };

  return (
    <div className="flex h-screen-safe flex-col bg-primary-50 dark:bg-night-200">
      <NavHeader />

      <div className="relative flex-1 overflow-hidden lg:flex">
        {/* 地图 */}
        <div className="relative h-full min-h-0 flex-1">
          <div ref={mapRef} className="h-full w-full" />

          <AnimatePresence>
            {loading && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 flex items-center justify-center bg-primary-50/90 dark:bg-night-200/90 backdrop-blur-sm z-10"
              >
                <LoadingSpinner size="lg" text="加载中..." />
              </motion.div>
            )}
            {!loading && loadError && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="absolute top-4 left-1/2 -translate-x-1/2 z-10 px-4 py-2 rounded-xl bg-pop-rose/90 border-2 border-pop-rose text-white text-sm font-medium shadow-block-sm"
              >
                数据加载失败，请刷新页面重试
              </motion.div>
            )}
          </AnimatePresence>

          {/* 移动端悬浮按钮 */}
          <div className="absolute bottom-6 left-0 right-0 z-20 flex justify-between px-5 pointer-events-none lg:hidden">
            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen(p => !p)}
              className="pointer-events-auto w-14 h-14 rounded-2xl bg-white dark:bg-night-100 border-3 border-ink dark:border-night-400 shadow-block hover:-translate-y-1 hover:shadow-block-lg transition-all duration-200 flex items-center justify-center text-ink dark:text-primary-100"
              aria-label="展会列表"
            >
              <Menu className="w-6 h-6" strokeWidth={2.5} />
            </button>

            <div className="pointer-events-auto relative">
              {/* 展开菜单 */}
              <AnimatePresence>
                {fabOpen && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.8, y: 10 }}
                    transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                    className="absolute bottom-16 right-0 flex flex-col gap-2 items-end"
                  >
                    {[
                      { label: '发布活动', path: '/merchant/create', color: 'bg-pop-yellow' },
                      { label: '发布店铺', path: '/merchant/venue/create', color: 'bg-pop-cyan' },
                      { label: '发布组局', path: '/merchant/session/create', color: 'bg-pop-purple' },
                    ].map(item => (
                      <button
                        key={item.path}
                        type="button"
                        onClick={() => { setFabOpen(false); navigate(isAuthenticated() ? item.path : '/login'); }}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl ${item.color} border-3 border-ink dark:border-night-400 shadow-block text-ink font-display text-sm whitespace-nowrap`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
              <button
                type="button"
                onClick={() => setFabOpen(p => !p)}
                className={`w-14 h-14 rounded-2xl bg-action border-3 border-ink dark:border-night-400 shadow-block hover:-translate-y-1 hover:shadow-block-lg transition-all duration-200 flex items-center justify-center text-white ${fabOpen ? 'rotate-45' : ''}`}
                aria-label="发布"
              >
                <Plus className="w-7 h-7 transition-transform duration-200" strokeWidth={3} />
              </button>
            </div>
          </div>
        </div>

        {/* 桌面端侧边栏 */}
        <aside className="hidden lg:flex flex-col w-[400px] overflow-y-auto bg-white dark:bg-night-100 border-l-3 border-ink dark:border-night-400">
          <SidebarContent
            events={events} venues={venues} sessions={sessions}
            filteredEvents={filteredEvents} filteredVenues={filteredVenues} filteredSessions={filteredSessions}
            selectedEvent={selectedEvent} selectedVenue={selectedVenue} selectedSession={selectedSession}
            searchQuery={searchQuery} loading={loading}
            tab={tab} onTabChange={handleTabChange}
            onSearchChange={handleSearchChange}
            onEventClick={handleEventClick} onVenueClick={handleVenueClick} onSessionClick={handleSessionClick}
          />
        </aside>
      </div>

      {/* 移动端遮罩 */}
      <AnimatePresence>
        {isMobileSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-30 bg-ink/50 backdrop-blur-sm lg:hidden"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* 移动端抽屉 */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[88vw] max-w-sm transform overflow-y-auto bg-white dark:bg-night-100 border-r-3 border-ink dark:border-night-400 transition-transform duration-300 ease-out lg:hidden ${
          isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between bg-action border-b-3 border-ink px-4 py-3">
          <div>
            <p className="font-display text-lg text-white">附近发现</p>
            <p className="text-xs text-white/80">展会 · 店铺 · 组局</p>
          </div>
          <button
            type="button"
            onClick={() => setIsMobileSidebarOpen(false)}
            className="btn-icon"
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <SidebarContent
          events={events} venues={venues} sessions={sessions}
          filteredEvents={filteredEvents} filteredVenues={filteredVenues} filteredSessions={filteredSessions}
          selectedEvent={selectedEvent} selectedVenue={selectedVenue} selectedSession={selectedSession}
          searchQuery={searchQuery} loading={loading}
          tab={tab} onTabChange={handleTabChange}
          onSearchChange={handleSearchChange}
          onEventClick={handleEventClick} onVenueClick={handleVenueClick} onSessionClick={handleSessionClick}
          isMobile
        />
      </aside>

      {/* 详情 Modal */}
      <AnimatePresence>
        {selectedEvent && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-ink/70 backdrop-blur-sm flex items-center justify-center p-4 z-50"
            onClick={() => { setSelectedEvent(null); setNavMenuOpen(false); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 30 }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              className="card-flat shadow-block-lg max-w-lg w-full max-h-modal overflow-y-auto relative"
              onClick={e => e.stopPropagation()}
            >
              {/* 顶部 sticky 关闭条：始终浮在 Modal 顶部，不随内容滚动 */}
              <div className="sticky top-0 z-20 flex justify-end p-2 bg-gradient-to-b from-white via-white/90 to-transparent dark:from-night-100 dark:via-night-100/90 pointer-events-none">
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="pointer-events-auto w-10 h-10 rounded-xl bg-white dark:bg-night-100 border-3 border-ink dark:border-night-400 shadow-block-sm flex items-center justify-center hover:-translate-y-0.5 hover:shadow-block transition-all duration-200 text-ink dark:text-primary-100"
                  aria-label="关闭"
                >
                  <X className="w-5 h-5" strokeWidth={2.5} />
                </button>
              </div>

              {/* 海报区（负边距拉到顶部，让关闭条浮在海报上） */}
              <div className="relative -mt-14">
                <div className="aspect-[16/10] overflow-hidden rounded-t-2xl border-b-3 border-ink dark:border-night-400">
                  <img
                    src={getImageUrl(selectedEvent.poster_url)}
                    alt={selectedEvent.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-ink/90 via-ink/40 to-transparent" />
                <h2 className="absolute bottom-4 left-5 right-16 font-display text-2xl text-white tracking-wide">
                  {selectedEvent.name}
                </h2>
                {selectedEvent.ticket_price && (
                  <div className="absolute top-3 left-3 px-3 py-1.5 bg-action border-3 border-ink rounded-xl shadow-block-sm">
                    <span className="font-display text-white text-sm">{selectedEvent.ticket_price}</span>
                  </div>
                )}
              </div>

              {/* 信息 */}
              <div className="p-5 space-y-3">
                {[
                  { icon: Clock, color: 'bg-primary-400', label: '时间', value: `${formatDate(selectedEvent.start_time)} - ${formatDate(selectedEvent.end_time)}` },
                  { icon: Building2, color: 'bg-pop-purple', label: '场馆', value: selectedEvent.venue_name },
                  { icon: MapPin, color: 'bg-action', label: '地址', value: selectedEvent.address },
                  ...(selectedEvent.ticket_price ? [{ icon: Ticket, color: 'bg-pop-yellow', label: '票价', value: selectedEvent.ticket_price }] : []),
                  ...(selectedEvent.description ? [{ icon: FileText, color: 'bg-pop-cyan', label: '简介', value: selectedEvent.description }] : []),
                  ...(selectedEvent.merchant_name ? [{ icon: User, color: 'bg-pop-pink', label: '主办方', value: selectedEvent.merchant_name }] : []),
                ].map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="flex items-start gap-3 p-3 rounded-xl bg-primary-50 dark:bg-night-200 border-2 border-ink/10 dark:border-night-400"
                    >
                      <div className={`flex-shrink-0 w-10 h-10 rounded-lg ${item.color} border-2 border-ink dark:border-night-400 flex items-center justify-center`}>
                        <Icon className="w-5 h-5 text-ink" strokeWidth={2.5} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-[11px] font-display text-ink-muted dark:text-primary-100/60 uppercase tracking-wider">{item.label}</span>
                        <p className="text-sm text-ink dark:text-primary-100 font-medium mt-0.5 break-words">{item.value}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* 底部操作区：导航 + 购票 + 换个展会 */}
              <div className="p-5 pt-0 flex flex-col sm:flex-row gap-3">
                <button type="button" onClick={() => setNavMenuOpen(true)} className="btn-primary flex-1 !py-3">
                  <Navigation className="w-5 h-5" />导航到这里
                </button>
                <button type="button"
                  onClick={() => handleToggleFavorite('event', selectedEvent.id)}
                  className={`!py-3 !px-4 btn-secondary flex-shrink-0 ${favorites.has(`event-${selectedEvent.id}`) ? '!bg-pop-rose !text-white !border-pop-rose' : ''}`}>
                  <Heart className="w-5 h-5" strokeWidth={favorites.has(`event-${selectedEvent.id}`) ? 0 : 2} fill={favorites.has(`event-${selectedEvent.id}`) ? 'currentColor' : 'none'} />
                </button>
                {selectedEvent.ticket_url && (
                  <a href={selectedEvent.ticket_url} target="_blank" rel="noopener noreferrer" className="btn-action flex-1 !py-3">
                    <Ticket className="w-5 h-5" />立即购票<ExternalLink className="w-4 h-4" />
                  </a>
                )}
                <button type="button" onClick={handleRandomNext} className="btn-secondary flex-1 !py-3">
                  <Shuffle className="w-5 h-5" />换个展会看看
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 展会详情页的导航菜单 */}
      {selectedEvent && (
        <NavMenu
          lat={Number(selectedEvent.latitude)}
          lng={Number(selectedEvent.longitude)}
          name={selectedEvent.name}
          open={navMenuOpen}
          onClose={() => setNavMenuOpen(false)}
        />
      )}

      {/* 店铺详情 Modal */}
      <AnimatePresence>
        {selectedVenue && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-ink/70 backdrop-blur-sm flex items-center justify-center p-4 z-50"
            onClick={() => { setSelectedVenue(null); setNavMenuOpen(false); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 30 }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              className="card-flat shadow-block-lg max-w-lg w-full max-h-modal overflow-y-auto relative"
              onClick={e => e.stopPropagation()}
            >
              {/* sticky 关闭条 */}
              <div className="sticky top-0 z-20 flex justify-end p-2 bg-gradient-to-b from-white via-white/90 to-transparent dark:from-night-100 dark:via-night-100/90 pointer-events-none">
                <button onClick={() => setSelectedVenue(null)}
                  className="pointer-events-auto w-10 h-10 rounded-xl bg-white dark:bg-night-100 border-3 border-ink dark:border-night-400 shadow-block-sm flex items-center justify-center hover:-translate-y-0.5 hover:shadow-block transition-all duration-200 text-ink dark:text-primary-100"
                  aria-label="关闭">
                  <X className="w-5 h-5" strokeWidth={2.5} />
                </button>
              </div>

              {/* 封面区 */}
              <div className="relative -mt-14">
                <div className="aspect-[16/10] overflow-hidden rounded-t-2xl border-b-3 border-ink dark:border-night-400 bg-pop-purple/20 flex items-center justify-center">
                  {selectedVenue.cover_url
                    ? <img src={getImageUrl(selectedVenue.cover_url)} alt={selectedVenue.name} className="w-full h-full object-cover" />
                    : <Store className="w-16 h-16 text-pop-purple/40" strokeWidth={1.5} />
                  }
                </div>
                <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-ink/90 via-ink/40 to-transparent" />
                <h2 className="absolute bottom-4 left-5 right-16 font-display text-2xl text-white tracking-wide">{selectedVenue.name}</h2>
              </div>

              {/* 信息 */}
              <div className="p-5 space-y-3">
                {[
                  selectedVenue.address && { icon: MapPin, color: 'bg-action', label: '地址', value: selectedVenue.address },
                  selectedVenue.phone && { icon: Phone, color: 'bg-pop-purple', label: '电话', value: selectedVenue.phone },
                  selectedVenue.business_hours && { icon: Clock, color: 'bg-pop-yellow', label: '营业时间', value: selectedVenue.business_hours },
                  selectedVenue.description && { icon: FileText, color: 'bg-pop-cyan', label: '简介', value: selectedVenue.description },
                ].filter(Boolean).map((item: any, i) => {
                  const Icon = item.icon;
                  return (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-primary-50 dark:bg-night-200 border-2 border-ink/10 dark:border-night-400">
                      <div className={`flex-shrink-0 w-10 h-10 rounded-lg ${item.color} border-2 border-ink dark:border-night-400 flex items-center justify-center`}>
                        <Icon className="w-5 h-5 text-ink" strokeWidth={2.5} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-[11px] font-display text-ink-muted dark:text-primary-100/60 uppercase tracking-wider">{item.label}</span>
                        <p className="text-sm text-ink dark:text-primary-100 font-medium mt-0.5 break-words">{item.value}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 近期组局列表 */}
              {venueSessions.length > 0 && (
                <div className="px-5 pb-3">
                  <p className="font-display text-sm text-ink dark:text-primary-100 mb-2 flex items-center gap-1.5">
                    <Gamepad2 className="w-4 h-4 text-blue-500" />
                    近期组局
                  </p>
                  <div className="space-y-2">
                    {venueSessions.slice(0, 3).map(s => {
                      const remaining = s.total_seats - s.booked_seats;
                      return (
                        <div key={s.id} onClick={() => { setSelectedSession(s); setSelectedVenue(null); }}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 cursor-pointer hover:border-blue-400 transition-colors">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-display text-ink dark:text-primary-100 truncate">{s.game_name}</p>
                            <p className="text-xs text-ink-muted dark:text-primary-100/60">{formatDate(s.start_time)}</p>
                          </div>
                          {s.status === 'full'
                            ? <span className="text-xs px-2 py-0.5 rounded-md bg-pop-rose/15 text-pop-rose border border-pop-rose flex-shrink-0">已满</span>
                            : <span className="text-xs px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-300 flex-shrink-0 flex items-center gap-1">
                                <Users className="w-3 h-3" />差{remaining}人
                              </span>
                          }
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 底部操作区 */}
              <div className="p-5 pt-0 flex flex-col sm:flex-row gap-3">
                <button type="button" onClick={() => setNavMenuOpen(true)} className="btn-primary flex-1 !py-3">
                  <Navigation className="w-5 h-5" />导航到这里
                </button>
                <button type="button"
                  onClick={() => handleToggleFavorite('venue', selectedVenue.id)}
                  className={`!py-3 !px-4 btn-secondary flex-shrink-0 ${favorites.has(`venue-${selectedVenue.id}`) ? '!bg-pop-rose !text-white !border-pop-rose' : ''}`}>
                  <Heart className="w-5 h-5" strokeWidth={favorites.has(`venue-${selectedVenue.id}`) ? 0 : 2} fill={favorites.has(`venue-${selectedVenue.id}`) ? 'currentColor' : 'none'} />
                </button>
                <Link to={`/venues/${selectedVenue.id}`} className="btn-secondary flex-1 !py-3 flex items-center justify-center gap-2">
                  <Store className="w-5 h-5" />查看详情
                </Link>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 店铺详情页的导航菜单 */}
      {selectedVenue && (
        <NavMenu
          lat={Number(selectedVenue.latitude)}
          lng={Number(selectedVenue.longitude)}
          name={selectedVenue.name}
          open={navMenuOpen}
          onClose={() => setNavMenuOpen(false)}
        />
      )}

      {/* 组局详情 Modal */}
      <AnimatePresence>
        {selectedSession && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-ink/70 backdrop-blur-sm flex items-center justify-center p-4 z-50"
            onClick={() => { setSelectedSession(null); setNavMenuOpen(false); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 30 }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              className="card-flat shadow-block-lg max-w-lg w-full max-h-modal overflow-y-auto relative"
              onClick={e => e.stopPropagation()}
            >
              {/* sticky 关闭条 */}
              <div className="sticky top-0 z-20 flex justify-end p-2 bg-gradient-to-b from-white via-white/90 to-transparent dark:from-night-100 dark:via-night-100/90 pointer-events-none">
                <button onClick={() => setSelectedSession(null)}
                  className="pointer-events-auto w-10 h-10 rounded-xl bg-white dark:bg-night-100 border-3 border-ink dark:border-night-400 shadow-block-sm flex items-center justify-center hover:-translate-y-0.5 hover:shadow-block transition-all duration-200 text-ink dark:text-primary-100"
                  aria-label="关闭">
                  <X className="w-5 h-5" strokeWidth={2.5} />
                </button>
              </div>

              {/* 头部 */}
              <div className="relative -mt-14 px-5 pt-16 pb-5 bg-gradient-to-br from-blue-600 to-blue-800 border-b-3 border-ink dark:border-night-400">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-xl bg-white/20 border-2 border-white/40 flex items-center justify-center flex-shrink-0">
                    <Gamepad2 className="w-6 h-6 text-white" strokeWidth={2} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-xl text-white tracking-wide">{selectedSession.game_name}</h2>
                    <p className="text-sm text-white/80 mt-0.5">{GAME_TYPE_LABEL[selectedSession.game_type]}</p>
                  </div>
                  {selectedSession.status === 'full'
                    ? <span className="flex-shrink-0 px-3 py-1 rounded-lg bg-pop-rose text-white text-xs font-bold border-2 border-white/40">已满</span>
                    : <span className="flex-shrink-0 px-3 py-1 rounded-lg bg-white/20 text-white text-xs font-bold border-2 border-white/40 flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" />差{selectedSession.total_seats - selectedSession.booked_seats}人
                      </span>
                  }
                </div>
              </div>

              {/* 信息 */}
              <div className="p-5 space-y-3">
                {[
                  { icon: Clock, color: 'bg-primary-400', label: '时间', value: `${formatDate(selectedSession.start_time)} - ${formatDate(selectedSession.end_time)}` },
                  { icon: MapPin, color: 'bg-action', label: '地点', value: selectedSession.venue_name || selectedSession.address },
                  { icon: Users, color: 'bg-blue-400', label: '人数', value: `${selectedSession.booked_seats} / ${selectedSession.total_seats} 人` },
                  { icon: Gamepad2, color: 'bg-pop-purple', label: '难度', value: DIFFICULTY_LABEL[selectedSession.difficulty] },
                  ...(selectedSession.price_per_person ? [{ icon: Ticket, color: 'bg-pop-yellow', label: '人均', value: selectedSession.price_per_person }] : []),
                  ...(selectedSession.description ? [{ icon: FileText, color: 'bg-pop-cyan', label: '说明', value: selectedSession.description }] : []),
                  ...(selectedSession.host_name ? [{ icon: User, color: 'bg-pop-pink', label: '发起人', value: selectedSession.host_name }] : []),
                ].map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-primary-50 dark:bg-night-200 border-2 border-ink/10 dark:border-night-400">
                      <div className={`flex-shrink-0 w-10 h-10 rounded-lg ${item.color} border-2 border-ink dark:border-night-400 flex items-center justify-center`}>
                        <Icon className="w-5 h-5 text-ink" strokeWidth={2.5} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-[11px] font-display text-ink-muted dark:text-primary-100/60 uppercase tracking-wider">{item.label}</span>
                        <p className="text-sm text-ink dark:text-primary-100 font-medium mt-0.5 break-words">{item.value}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 底部操作区 */}
              <div className="p-5 pt-0 flex flex-col sm:flex-row gap-3">
                <button type="button" onClick={() => setNavMenuOpen(true)} className="btn-primary flex-1 !py-3">
                  <Navigation className="w-5 h-5" />导航到这里
                </button>
                <button type="button"
                  onClick={() => handleToggleFavorite('session', selectedSession.id)}
                  className={`!py-3 !px-4 btn-secondary flex-shrink-0 ${favorites.has(`session-${selectedSession.id}`) ? '!bg-pop-rose !text-white !border-pop-rose' : ''}`}>
                  <Heart className="w-5 h-5" strokeWidth={favorites.has(`session-${selectedSession.id}`) ? 0 : 2} fill={favorites.has(`session-${selectedSession.id}`) ? 'currentColor' : 'none'} />
                </button>
                {isAuthenticated() && selectedSession.status === 'open' && (
                  <button type="button" disabled={registeringId === selectedSession.id}
                    onClick={async () => {
                      setRegisteringId(selectedSession.id);
                      try {
                        await sessionService.register(selectedSession.id);
                        setSessions(prev => prev.map(s => s.id === selectedSession.id
                          ? { ...s, booked_seats: s.booked_seats + 1, status: s.booked_seats + 1 >= s.total_seats ? 'full' : 'open' }
                          : s
                        ));
                        setSelectedSession(prev => prev ? { ...prev, booked_seats: prev.booked_seats + 1, status: prev.booked_seats + 1 >= prev.total_seats ? 'full' : 'open' } : null);
                        alert('报名成功！确认邮件已发送到你的邮箱');
                      } catch (e: any) {
                        alert(e?.response?.data?.error || '报名失败');
                      } finally {
                        setRegisteringId(null);
                      }
                    }}
                    className="btn-action flex-1 !py-3">
                    {registeringId === selectedSession.id ? <><span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />报名中...</> : <><Users className="w-5 h-5" />申请加入</>}
                  </button>
                )}
                {!isAuthenticated() && selectedSession.status === 'open' && (
                  <Link to="/login" className="btn-action flex-1 !py-3 flex items-center justify-center gap-2">
                    <Users className="w-5 h-5" />
                    登录后报名
                  </Link>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 组局的导航菜单 */}
      {selectedSession && (
        <NavMenu
          lat={Number(selectedSession.latitude)}
          lng={Number(selectedSession.longitude)}
          name={selectedSession.game_name}
          open={navMenuOpen}
          onClose={() => setNavMenuOpen(false)}
        />
      )}

      {/* 装饰：右下角小标签 */}
      <div className="hidden xl:block fixed bottom-4 left-[420px] z-10 pointer-events-none">
        <div className="px-3 py-1.5 bg-white dark:bg-night-100 border-2 border-ink dark:border-night-400 rounded-lg shadow-block-sm flex items-center gap-1.5 text-xs font-display text-ink dark:text-primary-100">
          <Sparkles className="w-3.5 h-3.5 text-action" />
          高德地图驱动
        </div>
      </div>
    </div>
  );
};

export default Home;
