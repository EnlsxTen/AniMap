import React, { useEffect, useLayoutEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import AMapLoader from '@amap/amap-jsapi-loader';
import gsap from 'gsap';
import {
  Calendar, MapPin, Clock, Building2, Ticket, FileText, User,
  Search, Plus, Menu, X, Sparkles, ExternalLink, Shuffle, Store, Navigation, Phone, Gamepad2, Users, Heart, Send, Eye, EyeOff, LocateFixed, Share2,
} from 'lucide-react';
import { eventService } from '../services/eventService';
import { venueService } from '../services/venueService';
import { sessionService } from '../services/sessionService';
import { favoriteService } from '../services/favoriteService';
import { settingsService, HomeFabSettings } from '../services/settingsService';
import { Event, Venue, Session, EventComment } from '../types';
import { formatDate, getImageUrl, isAuthenticated } from '../utils/helpers';
import { AMAP_KEY } from '../utils/amapConfig';
import NavHeader from '../components/NavHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import NavMenu from '../components/NavMenu';
import LocationConsentModal from '../components/LocationConsentModal';
import ScrollToTop from '../components/ScrollToTop';
import LongPressPoster from '../components/LongPressPoster';
import { useTheme, getThemeViewTransition } from '../contexts/ThemeContext';

type TabType = 'all' | 'events' | 'venues' | 'sessions';
const DETAIL_MARKER_MIN_ZOOM = 11;
const DETAIL_MARKER_ZOOMS: [number, number] = [DETAIL_MARKER_MIN_ZOOM, 20];
const MOBILE_LIST_BATCH_SIZE = 18;

// 性能优化开关：开启后删减地图 marker/FAB 等命令式 GSAP 动画（与 PerfModeContext 同源 localStorage）
const isPerfMode = (): boolean => {
  try {
    return typeof window !== 'undefined' && localStorage.getItem('animap_perf_mode') === 'on';
  } catch {
    return false;
  }
};

type EventMarkerImage = {
  img: HTMLImageElement;
  lng: number;
  lat: number;
  loaded: boolean;
};

type EventMarkerRecord = EventMarkerImage & {
  marker: any;
  node: HTMLElement;
};

type EventDotRecord = {
  marker: any;
  lng: number;
  lat: number;
  radius: number;
  fillColor: string;
  fillOpacity: number;
  strokeWeight: number;
  zIndex: number;
};

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
  onRequestLocation?: () => void;
  isMobile?: boolean;
}

const DIFFICULTY_LABEL: Record<string, string> = { beginner: '新手友好', intermediate: '中等', advanced: '高难度' };
const GAME_TYPE_LABEL: Record<string, string> = { boardgame: '桌游', murder_mystery: '剧本杀', card: '卡牌', other: '其他' };

const SidebarContent: React.FC<SidebarContentProps> = ({
  events, venues, sessions, filteredEvents, filteredVenues, filteredSessions,
  selectedEvent, selectedVenue, selectedSession, searchQuery, loading,
  tab, onTabChange, onSearchChange, onEventClick, onVenueClick, onSessionClick,
  onRequestLocation, isMobile = false,
}) => {
  const [visibleCount, setVisibleCount] = useState(MOBILE_LIST_BATCH_SIZE);

  useEffect(() => {
    setVisibleCount(MOBILE_LIST_BATCH_SIZE);
  }, [tab, searchQuery, filteredEvents.length, filteredVenues.length, filteredSessions.length]);

  const limitItems = <T,>(items: T[]) => (isMobile ? items.slice(0, visibleCount) : items);
  const visibleEvents = limitItems(filteredEvents);
  const visibleVenues = limitItems(filteredVenues);
  const visibleSessions = limitItems(filteredSessions);
  const hasMore =
    isMobile &&
    ((tab === 'all' || tab === 'events') && visibleEvents.length < filteredEvents.length ||
      (tab === 'all' || tab === 'venues') && visibleVenues.length < filteredVenues.length ||
      (tab === 'all' || tab === 'sessions') && visibleSessions.length < filteredSessions.length);
  const listPanelTransition = isMobile
    ? { type: 'spring' as const, stiffness: 430, damping: 26, mass: 0.86 }
    : { type: 'spring' as const, stiffness: 360, damping: 24, mass: 0.86 };
  const getListItemInitial = () => (
    isMobile
      ? { opacity: 0, x: -64, y: 0, scale: 0.92 }
      : { opacity: 0, x: -32, y: 8, scale: 0.97 }
  );
  const getListItemTransition = (index: number) => (
    isMobile
      ? {
          type: 'spring' as const,
          stiffness: 360,
          damping: 17,
          mass: 0.92,
          delay: 0.1 + Math.min(index * 0.045, 0.36),
        }
      : {
          type: 'spring' as const,
          stiffness: 380,
          damping: 22,
          mass: 0.9,
          delay: Math.min(index * 0.03, 0.2),
        }
  );

  return (
  <>
    {/* 头部块 */}
    <div className="shrink-0 p-5 bg-action border-b-3 border-ink dark:border-night-400 relative overflow-hidden">
      <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-pop-yellow border-3 border-ink opacity-80" />
      <div className="absolute -bottom-6 -left-6 w-16 h-16 rounded-2xl bg-pop-purple border-3 border-ink opacity-70 rotate-12" />
      <div className="relative">
        <h2 className="font-display text-2xl text-white tracking-wide flex items-center gap-2">
          <Calendar className="w-6 h-6" strokeWidth={2.5} />
          附近发现
        </h2>
        <div className="flex items-center justify-between">
          <p className="text-sm text-white/85 mt-1 font-medium">
            {events.length} 场展会 · {venues.length} 家店铺 · {sessions.length} 个组局
          </p>
          {(() => { try { return localStorage.getItem('animap_location_consent') !== 'allow'; } catch { return true; } })() && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRequestLocation?.(); }}
              className="mt-1 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/20 text-white text-xs font-bold hover:bg-white/30 transition-colors"
            >
              <LocateFixed className="w-3.5 h-3.5" />
              开启定位
            </button>
          )}
        </div>
      </div>
    </div>

    {/* Tab 切换 */}
    <div className="shrink-0 flex border-b-3 border-ink dark:border-night-400 bg-white dark:bg-night-100">
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
    <div className="shrink-0 p-3 bg-white dark:bg-night-100 border-b-3 border-ink dark:border-night-400">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted dark:text-primary-100/60 pointer-events-none" />
        <input
          id={isMobile ? 'mobile-sidebar-search' : 'desktop-sidebar-search'}
          name={isMobile ? 'mobile-sidebar-search' : 'desktop-sidebar-search'}
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
    <motion.div key={tab} className={`${isMobile ? 'shrink-0 bg-primary-50 dark:bg-night-200' : 'shrink-0 bg-white dark:bg-night-100'}`}
      initial={isMobile ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={isMobile ? { opacity: 1 } : { opacity: 0, y: -6 }}
      transition={listPanelTransition}>
      {/* 展会列表 */}
      {(tab === 'all' || tab === 'events') && visibleEvents.map((event, index) => (
        <motion.div key={`e-${event.id}`}
          data-sidebar-item={`event-${event.id}`}
          initial={getListItemInitial()}
          animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
          transition={getListItemTransition(index)}
          onClick={() => onEventClick(event)}
          className={`select-none mobile-sidebar-list-item p-4 cursor-pointer transition-colors duration-200 border-b-2 ${
            selectedEvent?.id === event.id
              ? 'bg-action/15 dark:bg-action/20 border-l-4 border-l-action border-b-ink dark:border-b-night-400'
              : 'border-b-ink/10 dark:border-b-night-400 border-l-4 border-l-transparent hover:bg-primary-50 dark:hover:bg-night-50'
          }`}
        >
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-16 h-16 sm:w-[76px] sm:h-[76px] rounded-xl overflow-hidden border-3 border-ink dark:border-night-400 shadow-block-sm">
              <LongPressPoster
                src={getImageUrl(event.poster_url, 'thumb')}
                fullSrc={getImageUrl(event.poster_url, 'original')}
                alt={event.name}
                className="w-full h-full"
              />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <h3 className="sidebar-title-clamp font-display text-base text-ink dark:text-primary-100 tracking-wide">{event.name}</h3>
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
      {(tab === 'all' || tab === 'venues') && visibleVenues.map((venue, index) => (
        <motion.div key={`v-${venue.id}`}
          data-sidebar-item={`venue-${venue.id}`}
          initial={getListItemInitial()}
          animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
          transition={getListItemTransition(index)}
          onClick={() => onVenueClick(venue)}
          className={`select-none mobile-sidebar-list-item p-4 cursor-pointer transition-colors duration-200 border-b-2${
            selectedVenue?.id === venue.id
              ? 'bg-pop-purple/15 dark:bg-pop-purple/20 border-l-4 border-l-pop-purple border-b-ink dark:border-b-night-400'
              : 'border-b-ink/10 dark:border-b-night-400 border-l-4 border-l-transparent hover:bg-primary-50 dark:hover:bg-night-50'
          }`}
        >
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden border-3 border-ink dark:border-night-400 shadow-block-sm bg-pop-purple/20 flex items-center justify-center">
              {venue.cover_url
                ? <LongPressPoster src={getImageUrl(venue.cover_url, 'preview')} fullSrc={getImageUrl(venue.cover_url, 'original')} alt={venue.name} className="w-full h-full" />
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
      {(tab === 'all' || tab === 'sessions') && visibleSessions.map((session, index) => {
        const remaining = session.total_seats - session.booked_seats;
        return (
          <motion.div key={`s-${session.id}`}
            data-sidebar-item={`session-${session.id}`}
            initial={getListItemInitial()}
            animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
            transition={getListItemTransition(index)}
            onClick={() => onSessionClick(session)}
            className={`select-none mobile-sidebar-list-item p-4 cursor-pointer transition-colors duration-200 border-b-2${
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

      {hasMore && (
        <div className={`${isMobile ? 'p-4 bg-primary-50 dark:bg-night-200' : 'p-4 bg-white dark:bg-night-100'}`}>
          <button
            type="button"
            className="btn-secondary w-full !py-3"
            onClick={() => setVisibleCount(count => count + MOBILE_LIST_BATCH_SIZE)}
          >
            显示更多
          </button>
        </div>
      )}

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
};

// ==========================================================================
// 首页主组件
// ==========================================================================
const Home: React.FC = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [fullPosterUrl, setFullPosterUrl] = useState<string | null>(null);
  const [detailPosterLoaded, setDetailPosterLoaded] = useState(false);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [eventComments, setEventComments] = useState<EventComment[]>([]);
  const [danmakuVisible, setDanmakuVisible] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem('animap:danmaku-visible') !== '0';
  });
  const [commentText, setCommentText] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);
  const [commentError, setCommentError] = useState('');
  const [venueSessions, setVenueSessions] = useState<Session[]>([]); // 店铺 Modal 内的组局列表
  const [registeringId, setRegisteringId] = useState<number | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set()); // "event-1", "venue-2", "session-3"
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const isMountedRef = useRef(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [mobileSidebarSwipeClosing, setMobileSidebarSwipeClosing] = useState(false);
  const sidebarToggleLockRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [tab, setTab] = useState<TabType>('all');
  const [navMenuOpen, setNavMenuOpen] = useState(false);
  const [publishMenuOpen, setPublishMenuOpen] = useState(false);
  // 主页发布入口开关（管理员可控）。默认全开，加载失败也保持全开。
  const [fabConfig, setFabConfig] = useState<HomeFabSettings>({ event: true, venue: true, session: true, dance: true });
  const [isDesktopLayout, setIsDesktopLayout] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : false
  );
  const mapRef = useRef<any>(null);
  const mapInstance = useRef<any>(null);
  const amapRef = useRef<any>(null);
  const userPositionRef = useRef<[number, number] | null>(null);
  const [userPosition, setUserPosition] = useState<[number, number] | null>(null);
  const userMarkerRef = useRef<any>(null);
  const touchBlockUntilRef = useRef(0);
  const eventMarkers = useRef<any[]>([]);
  const venueMarkers = useRef<any[]>([]);
  const sessionMarkers = useRef<any[]>([]);
  const eventDotMarkers = useRef<any[]>([]);
  const venueDotMarkers = useRef<any[]>([]);
  const sessionDotMarkers = useRef<any[]>([]);
  const eventMarkerRecords = useRef<EventMarkerRecord[]>([]);
  const tabRef = useRef<TabType>('all');
  const [showLocationConsent, setShowLocationConsent] = useState(false);
  const locationDecidedRef = useRef(false);
  const LOCATION_CONSENT_KEY = 'animap_location_consent';  const publishFabRef = useRef<HTMLButtonElement | null>(null);
  const publishActionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const eventModalRef = useRef<HTMLDivElement | null>(null);
  const mobileSidebarPanelRef = useRef<HTMLElement | null>(null);
  const mobileSidebarDragXRef = useRef(0);
  const mobileSidebarDragRafRef = useRef<number | null>(null);
  const mobileSidebarTouchRef = useRef<{ startX: number; startY: number; startedAt: number; locked: boolean } | null>(null);
  const eventMarkerNodes = useRef<HTMLElement[]>([]);
  const eventDotRecords = useRef<EventDotRecord[]>([]);
  const markerDetailVisibleRef = useRef<boolean | null>(null);
  const markerTransitioningRef = useRef(false);
  const transitionOverlayRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const handledFocusRef = useRef('');
  const { theme } = useTheme();

  useEffect(() => {
    document.documentElement.classList.add('animap-home-scroll-lock');
    return () => {
      document.documentElement.classList.remove('animap-home-scroll-lock');
      document.body.style.overflow = '';
    };
  }, []);

  const loadVisibleEventMarkerImages = useCallback(() => {
    const map = mapInstance.current;
    const AMap = amapRef.current;
    if (!map) return;

    const zoom = typeof map.getZoom === 'function' ? map.getZoom() : DETAIL_MARKER_MIN_ZOOM;
    if (zoom < DETAIL_MARKER_MIN_ZOOM) return;

    const bounds = typeof map.getBounds === 'function' ? map.getBounds() : null;
    eventMarkerRecords.current.forEach(item => {
      if (item.loaded) return;

      let isVisible = true;
      if (bounds?.contains && AMap?.LngLat) {
        isVisible = bounds.contains(new AMap.LngLat(item.lng, item.lat));
      }

      if (!isVisible) return;

      const src = item.img.dataset.src;
      if (src) {
        item.img.src = src;
        item.img.removeAttribute('data-src');
        item.loaded = true;
      }
    });
  }, []);

  const getEventHeat = useCallback((event: Event) => {
    const count = Number(event.favorite_count || 0);
    if (count >= 20) return 'hot';
    if (count >= 8) return 'warm';
    return 'normal';
  }, []);

  const getEventHeatStyles = useCallback((event: Event) => {
    const heat = getEventHeat(event);
    if (heat === 'hot') {
      return {
        markerBackground: 'linear-gradient(135deg,#FB7185 0%,#F97316 46%,#FACC15 100%)',
        dotBackground: 'linear-gradient(135deg,#FB7185 0%,#F97316 54%,#FACC15 100%)',
        shadow: '0 0 0 3px rgba(251,113,133,0.25), 4px 4px 0 0 rgba(6,78,59,1)',
        dotSize: 16,
        zIndex: 130,
      };
    }
    if (heat === 'warm') {
      return {
        markerBackground: 'linear-gradient(135deg,#34D399 0%,#38BDF8 52%,#A78BFA 100%)',
        dotBackground: 'linear-gradient(135deg,#34D399 0%,#38BDF8 52%,#A78BFA 100%)',
        shadow: '0 0 0 3px rgba(56,189,248,0.22), 4px 4px 0 0 rgba(6,78,59,1)',
        dotSize: 13,
        zIndex: 120,
      };
    }
    return {
      markerBackground: '#fff',
      dotBackground: '#10B981',
      shadow: '4px 4px 0 0 rgba(6,78,59,1)',
      dotSize: 11,
      zIndex: 110,
    };
  }, [getEventHeat]);

  const isPointInCurrentBounds = useCallback((lng: number, lat: number) => {
    const map = mapInstance.current;
    const AMap = amapRef.current;
    const bounds = typeof map?.getBounds === 'function' ? map.getBounds() : null;
    if (!bounds?.contains || !AMap?.LngLat) return true;
    return bounds.contains(new AMap.LngLat(lng, lat));
  }, []);

  const getVisibleEventDetailRecords = useCallback(() => {
    return eventMarkerRecords.current.filter(item => isPointInCurrentBounds(item.lng, item.lat));
  }, [isPointInCurrentBounds]);

  const getVisibleEventDotRecords = useCallback(() => {
    return eventDotRecords.current.filter(item => isPointInCurrentBounds(item.lng, item.lat));
  }, [isPointInCurrentBounds]);

  const animateTransitionDots = useCallback((
    records: EventDotRecord[],
    mode: 'enter' | 'exit',
    onComplete?: () => void,
  ) => {
    const map = mapInstance.current;
    const container = mapRef.current as HTMLElement | null;
    if (!map || !container || records.length === 0 || typeof map.lngLatToContainer !== 'function') {
      onComplete?.();
      return;
    }

    const reduceMotion = isPerfMode() || (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (reduceMotion) {
      onComplete?.();
      return;
    }

    const animatedRecords = records.slice(0, 36);
    const nodes: HTMLElement[] = [];
    const overlay = document.createElement('div');
    if (transitionOverlayRef.current) {
      gsap.killTweensOf(transitionOverlayRef.current.querySelectorAll('*'));
      transitionOverlayRef.current.remove();
      transitionOverlayRef.current = null;
    }
    if (window.getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }
    overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:2000;overflow:hidden';
    container.appendChild(overlay);
    transitionOverlayRef.current = overlay;

    animatedRecords.forEach((record) => {
      const pixel = map.lngLatToContainer([record.lng, record.lat]);
      const x = typeof pixel.getX === 'function' ? pixel.getX() : pixel.x;
      const y = typeof pixel.getY === 'function' ? pixel.getY() : pixel.y;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;

      const size = Math.max(10, record.radius * 2 + record.strokeWeight * 2);
      const initialScale = mode === 'enter' ? 0.04 : 1;
      const initialOpacity = mode === 'enter' ? 0 : record.fillOpacity;
      const shell = document.createElement('div');
      shell.style.cssText = [
        'position:absolute',
        `left:${x}px`,
        `top:${y}px`,
        `width:${size}px`,
        `height:${size}px`,
        `margin-left:-${size / 2}px`,
        `margin-top:-${size / 2}px`,
        'border-radius:999px',
        `border:${record.strokeWeight}px solid #064E3B`,
        `background:${record.fillColor}`,
        `opacity:${initialOpacity}`,
        'box-shadow:2px 2px 0 rgba(6,78,59,0.85)',
        'will-change:transform,opacity',
        'transform-origin:50% 50%',
        `transform:scale(${initialScale})`,
        'pointer-events:none',
      ].join(';');
      overlay.appendChild(shell);
      nodes.push(shell);
    });

    if (!nodes.length) {
      overlay.remove();
      if (transitionOverlayRef.current === overlay) transitionOverlayRef.current = null;
      onComplete?.();
      return;
    }

    const cleanup = () => {
      overlay.remove();
      if (transitionOverlayRef.current === overlay) transitionOverlayRef.current = null;
      onComplete?.();
    };

    if (mode === 'enter' && !isDesktopLayout) {
      const timeline = gsap.timeline({ onComplete: cleanup });
      timeline
        .fromTo(
          nodes,
          { scale: 0.04, opacity: 0 },
          {
            scale: 1.08,
            opacity: 0.94,
            duration: 0.15,
            ease: 'power2.out',
            stagger: { amount: 0.025, from: 'center' },
            overwrite: true,
          }
        )
        .to(
          nodes,
          {
            scale: 1,
            opacity: 0.92,
            duration: 0.08,
            ease: 'power2.out',
            overwrite: true,
          },
          '>-0.01'
        );
      return;
    }

    gsap.fromTo(
      nodes,
      {
        scale: mode === 'enter' ? 0.25 : 1,
        opacity: mode === 'enter' ? 0 : 1,
      },
      {
        scale: mode === 'enter' ? 0.96 : 0.22,
        opacity: mode === 'enter' ? 0.9 : 0,
        duration: mode === 'enter' ? 0.24 : 0.22,
        ease: mode === 'enter' ? 'power3.out' : 'power3.in',
        stagger: { amount: mode === 'enter' ? 0.08 : 0.04, from: 'center' },
        overwrite: true,
        onComplete: cleanup,
      }
    );
  }, [isDesktopLayout]);

  const syncMarkerVisibility = useCallback(() => {
    const map = mapInstance.current;
    if (!map) return;

    const zoom = typeof map.getZoom === 'function' ? map.getZoom() : DETAIL_MARKER_MIN_ZOOM;
    const showDetailMarkers = zoom >= DETAIL_MARKER_MIN_ZOOM;
    const currentTab = tabRef.current;

    const eventVisible = currentTab === 'all' || currentTab === 'events';
    venueMarkers.current.forEach(m => m.setMap(showDetailMarkers && (currentTab === 'all' || currentTab === 'venues') ? map : null));
    sessionMarkers.current.forEach(m => m.setMap(showDetailMarkers && (currentTab === 'all' || currentTab === 'sessions') ? map : null));
    venueDotMarkers.current.forEach(m => m.setMap(!showDetailMarkers && (currentTab === 'all' || currentTab === 'venues') ? map : null));
    sessionDotMarkers.current.forEach(m => m.setMap(!showDetailMarkers && (currentTab === 'all' || currentTab === 'sessions') ? map : null));

    if (!eventVisible) {
      eventMarkers.current.forEach(m => m.setMap(null));
      eventDotMarkers.current.forEach(m => m.setMap(null));
      markerDetailVisibleRef.current = null;
      return;
    }

    if (eventVisible && markerDetailVisibleRef.current !== showDetailMarkers) {
      const firstSync = markerDetailVisibleRef.current === null;
      markerDetailVisibleRef.current = showDetailMarkers;
      const reduceMotion = isPerfMode() || (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      const visibleDetailRecords = getVisibleEventDetailRecords();
      const enteringMarkers = showDetailMarkers ? visibleDetailRecords.map(item => item.marker) : eventDotMarkers.current;
      const leavingMarkers = showDetailMarkers ? eventDotMarkers.current : eventMarkers.current;

      if (showDetailMarkers) {
        enteringMarkers.forEach(m => m.setMap(map));
      }

      if (reduceMotion || firstSync) {
        if (!showDetailMarkers) {
          enteringMarkers.forEach(m => m.setMap(map));
        }
        leavingMarkers.forEach(m => m.setMap(null));
        markerTransitioningRef.current = false;
      } else {
        const entering = (showDetailMarkers ? visibleDetailRecords.map(item => item.node) : []).filter(Boolean);
        const visibleLeavingRecords = getVisibleEventDetailRecords();
        const leaving = (showDetailMarkers ? [] : visibleLeavingRecords.map(item => item.node)).filter(Boolean);
        const zoomingOutToDots = !showDetailMarkers;
        const visibleDotRecords = getVisibleEventDotRecords();
        const transitionParts = (leaving.length ? 1 : 0) + (entering.length ? 1 : 0) + 1;
        let completedTweens = 0;
        const finishTransition = () => {
          completedTweens += 1;
          if (completedTweens >= transitionParts) {
            markerTransitioningRef.current = false;
          }
        };

        markerTransitioningRef.current = true;
        gsap.killTweensOf([...entering, ...leaving]);

        if (leaving.length) {
          gsap.fromTo(
            leaving,
            { scale: 1, opacity: 1, y: 0, rotate: 0, transformOrigin: '50% 100%' },
            {
              scale: zoomingOutToDots ? 0.18 : 1.34,
              opacity: 0,
              y: zoomingOutToDots ? 1 : -3,
              rotate: zoomingOutToDots ? 0 : 0,
              duration: zoomingOutToDots ? 0.24 : 0.16,
              ease: zoomingOutToDots ? 'power3.inOut' : 'power2.out',
              stagger: { amount: zoomingOutToDots ? 0.06 : 0.04, from: 'center' },
              overwrite: true,
              onComplete: () => {
                leavingMarkers.forEach(m => m.setMap(null));
                finishTransition();
              },
            }
          );
        } else {
          leavingMarkers.forEach(m => m.setMap(null));
        }

        if (entering.length) {
          gsap.fromTo(
            entering,
            {
              scale: showDetailMarkers ? 0.58 : 0.2,
              opacity: 0,
              y: showDetailMarkers ? 8 : 0,
              rotate: showDetailMarkers ? -1.5 : 0,
              transformOrigin: showDetailMarkers ? '50% 100%' : '50% 50%',
            },
            {
              scale: 1,
              opacity: 1,
              y: 0,
              rotate: 0,
              duration: showDetailMarkers ? 0.42 : 0.26,
              delay: showDetailMarkers ? 0.05 : 0.12,
              stagger: { amount: showDetailMarkers ? 0.08 : 0.04, from: 'center' },
              ease: showDetailMarkers ? 'back.out(1.55)' : 'back.out(2.4)',
              overwrite: true,
              onComplete: finishTransition,
            }
          );
        } else {
          if (showDetailMarkers) {
            visibleDetailRecords.forEach(item => {
              gsap.set(item.node, { scale: 1, opacity: 1, y: 0, rotate: 0 });
            });
          }
        }

        if (showDetailMarkers) {
          animateTransitionDots(visibleDotRecords, 'exit', () => {
            eventDotMarkers.current.forEach(m => m.setMap(null));
            finishTransition();
          });
        } else {
          animateTransitionDots(visibleDotRecords, 'enter', () => {
            eventDotMarkers.current.forEach(m => m.setMap(map));
            finishTransition();
          });
        }
      }
    } else {
      if (markerTransitioningRef.current) return;
      if (showDetailMarkers) {
        eventMarkerRecords.current.forEach(item => {
          item.marker.setMap(isPointInCurrentBounds(item.lng, item.lat) ? map : null);
        });
      } else {
        eventMarkers.current.forEach(m => m.setMap(null));
      }
      eventDotMarkers.current.forEach(m => m.setMap(!showDetailMarkers ? map : null));
    }

    if (showDetailMarkers && eventVisible) {
      requestAnimationFrame(loadVisibleEventMarkerImages);
    }
  }, [animateTransitionDots, getVisibleEventDetailRecords, getVisibleEventDotRecords, isPointInCurrentBounds, loadVisibleEventMarkerImages]);

  const doGpsLocate = useCallback(() => {
    const map = mapInstance.current;
    const AMap = amapRef.current;
    if (!map || !AMap) return;

    if (userPositionRef.current) {
      map.setZoomAndCenter(15, userPositionRef.current, false, 600);
      return;
    }

    // 确保 Geolocation 插件已加载（首次可能未加载）
    AMap.plugin('AMap.Geolocation', () => {
      const geo = new AMap.Geolocation({ enableHighAccuracy: true, timeout: 5000 });
      geo.getCurrentPosition((status: string, result: any) => {
        if (status === 'complete' && result.position) {
          const pos: [number, number] = [result.position.lng, result.position.lat];
          userPositionRef.current = pos;
          setUserPosition(pos);
          map.setZoomAndCenter(15, pos, false, 600);
          if (userMarkerRef.current) userMarkerRef.current.setMap(null);
          addUserLocationMarker();
        }
      });
    });
  }, []);

  const handleLocationAllow = useCallback(() => {
    setShowLocationConsent(false);
    locationDecidedRef.current = true;
    localStorage.setItem(LOCATION_CONSENT_KEY, 'allow');
    if (mapReady && mapInstance.current && amapRef.current) {
      doGpsLocate();
    } else {
      initMap(true);
    }
  }, [mapReady, doGpsLocate]);

  const handleLocationSkip = useCallback(() => {
    setShowLocationConsent(false);
    locationDecidedRef.current = true;
    localStorage.setItem(LOCATION_CONSENT_KEY, 'skip');
    initMap(false);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    loadData();
    const saved = localStorage.getItem(LOCATION_CONSENT_KEY);
    if (saved === 'allow') {
      initMap(true);
    } else if (saved === 'skip') {
      initMap(false);
    } else {
      setShowLocationConsent(true);
      initMap(false);
    }
    return () => {
      isMountedRef.current = false;
      if (mapInstance.current) {
        mapInstance.current.destroy();
        mapInstance.current = null;
      }
    };
  }, []);

  const loadData = async () => {
    // home-fab 配置即时发出,不等主数据
    settingsService.getHomeFab().then(cfg => {
      if (isMountedRef.current) setFabConfig(cfg);
    }).catch(() => {});
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
      // 加载收藏状态（轻量接口，只返回 key 集合）
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

  const initMap = async (withGeolocation = true) => {
    try {
      const plugins: string[] = ['AMap.Marker', 'AMap.InfoWindow', 'AMap.CitySearch'];
      if (withGeolocation) plugins.push('AMap.Geolocation');

      const AMap = await AMapLoader.load({
        key: AMAP_KEY,
        version: '2.0',
        plugins,
      });

      let initialCenter: [number, number] = [116.397428, 39.90923];

      let located = false;
      // 1. 仅在用户授权后尝试精确 GPS 定位
      if (withGeolocation) {
        located = await new Promise<boolean>((resolve) => {
          const geo = new AMap.Geolocation({ enableHighAccuracy: true, timeout: 5000 });
          geo.getCurrentPosition((status: string, result: any) => {
            if (status === 'complete' && result.position) {
              initialCenter = [result.position.lng, result.position.lat];
              userPositionRef.current = [result.position.lng, result.position.lat];
              setUserPosition([result.position.lng, result.position.lat]);
              resolve(true);
            } else {
              resolve(false);
            }
          });
        });
      }

      // 2. GPS 不可用或用户跳过时 fallback 到城市中心点
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
        // 全程未设置 pitch/rotation，视觉上始终是俯视 2D；用 3D(WebGL) 只是白付合成开销，
        // 在 iOS Safari 上和大量 backdrop-blur 层叠加更容易拖动/缩放卡顿甚至绿屏，改用 2D 更轻量。
        viewMode: '2D',
        mapStyle: theme === 'dark' ? 'amap://styles/dark' : 'amap://styles/normal',
      });

      mapInstance.current = map;
      amapRef.current = AMap;

      // 防止双指缩放时误触 marker：多指触摸结束后 500ms 内屏蔽所有 marker click
      const mapContainer = map.getContainer();
      if (mapContainer) {
        mapContainer.addEventListener('touchstart', (e: TouchEvent) => {
          if (e.touches.length > 1) touchBlockUntilRef.current = 0; // 缩放手势进行中
        }, { passive: true });
        mapContainer.addEventListener('touchend', (e: TouchEvent) => {
          if (e.touches.length === 0) touchBlockUntilRef.current = Date.now() + 500;
        }, { passive: true });
      }

      // 节流：地图每次移动时避免频繁重绘
      let syncTimer: ReturnType<typeof setTimeout> | null = null;
      let loadTimer: ReturnType<typeof setTimeout> | null = null;
      map.on('zoomend', syncMarkerVisibility);
      map.on('moveend', () => {
        if (syncTimer) clearTimeout(syncTimer);
        if (loadTimer) clearTimeout(loadTimer);
        syncTimer = setTimeout(syncMarkerVisibility, 120);
        loadTimer = setTimeout(loadVisibleEventMarkerImages, 200);
      });
      if (isMountedRef.current) setMapReady(true);
    } catch (e) { console.error('Failed to load map:', e); }
  };

  // 主题切换时同步地图样式。
  // 若主题切换走了 view-transition 扩散动画，则等动画结束后再换肤：
  // AMap 换肤会异步重载瓦片，若发生在过渡快照期间，快照会定格在半旧半新的瓦片上，
  // 扩散揭底时地图区跳色闪烁；推迟到结束后则是一次干净的整幅换肤。
  useEffect(() => {
    const applyStyle = () => {
      if (mapInstance.current) {
        mapInstance.current.setMapStyle(theme === 'dark' ? 'amap://styles/dark' : 'amap://styles/normal');
      }
    };
    const pending = getThemeViewTransition();
    if (!pending) {
      applyStyle();
      return;
    }
    let cancelled = false;
    pending.then(() => { if (!cancelled) applyStyle(); });
    return () => { cancelled = true; };
  }, [theme]);

  useEffect(() => {
    if (mapReady && mapInstance.current) {
      addEventMarkers();
      addVenueMarkers();
      addSessionMarkers();
      addUserLocationMarker();
      syncMarkerVisibility();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, venues, sessions, mapReady, syncMarkerVisibility, isDesktopLayout]);

  // Tab 切换时控制 marker 显示/隐藏（数据未变化时也需要响应）
  useEffect(() => {
    tabRef.current = tab;
    syncMarkerVisibility();
  }, [tab, syncMarkerVisibility]);

  const addUserLocationMarker = () => {
    const AMap = amapRef.current;
    const map = mapInstance.current;
    if (!AMap || !map) return;

    // 移除旧标记
    if (userMarkerRef.current) {
      userMarkerRef.current.setMap(null);
      userMarkerRef.current = null;
    }

    const pos = userPositionRef.current;
    if (!pos) return;

    // 创建用户当前位置标记 — pulsing circle
    const container = document.createElement('div');
    container.style.cssText = 'position:relative;width:28px;height:28px;display:flex;align-items:center;justify-content:center';

    // 外圈脉冲
    const pulse = document.createElement('div');
    pulse.style.cssText = 'position:absolute;inset:0;border-radius:50%;background:#3B82F6;opacity:0.25;animation:animap-user-pulse 1.8s ease-out infinite';
    container.appendChild(pulse);

    // 中心点
    const dot = document.createElement('div');
    dot.style.cssText = 'width:14px;height:14px;border-radius:50%;background:#2563EB;border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3);position:relative;z-index:1';
    container.appendChild(dot);

    // 注入动画样式
    if (!document.getElementById('animap-user-marker-style')) {
      const style = document.createElement('style');
      style.id = 'animap-user-marker-style';
      style.textContent = '@keyframes animap-user-pulse{0%{transform:scale(0.6);opacity:0.4}100%{transform:scale(1.8);opacity:0}}';
      document.head.appendChild(style);
    }

    const marker = new AMap.Marker({
      position: pos,
      content: container,
      anchor: 'center',
      offset: new AMap.Pixel(0, 0),
      zIndex: 110,
    });
    userMarkerRef.current = marker;
    marker.setMap(map);
  };

  const addEventMarkers = () => {
    const AMap = amapRef.current;
    if (!AMap) return;
    eventMarkers.current.forEach(m => m.setMap(null));
    eventDotMarkers.current.forEach(m => m.setMap(null));
    eventMarkers.current = [];
    eventDotMarkers.current = [];
    eventMarkerRecords.current = [];
    eventMarkerNodes.current = [];
    eventDotRecords.current = [];
    markerDetailVisibleRef.current = null;
    markerTransitioningRef.current = false;
    events.forEach((event) => {
      const heatStyle = getEventHeatStyles(event);
      const div = document.createElement('div');
      // 使用 DOM API 设置文本内容，避免 XSS
      const outer = document.createElement('div');
      outer.style.cssText = 'width:56px;height:68px;position:relative;cursor:pointer;will-change:transform,opacity;transform-origin:50% 100%';
      const hoverShell = document.createElement('div');
      hoverShell.style.cssText = 'width:56px;height:68px;position:relative;transition:transform 260ms cubic-bezier(0.34,1.56,0.64,1);transform-origin:50% 100%';
      hoverShell.onmouseenter = () => { hoverShell.style.transform = 'translateY(-4px) scale(1.05)'; };
      hoverShell.onmouseleave = () => { hoverShell.style.transform = 'translateY(0) scale(1)'; };
      const box = document.createElement('div');
      box.style.cssText = `width:56px;height:56px;border-radius:14px;overflow:hidden;border:3px solid #064E3B;background:${heatStyle.markerBackground};box-shadow:${heatStyle.shadow};padding:${heatStyle.markerBackground === '#fff' ? '0' : '3px'}`;
      const img = document.createElement('img');
      img.dataset.src = getImageUrl(event.poster_url, 'thumb');
      img.loading = 'lazy';
      img.decoding = 'async';
      img.setAttribute('fetchpriority', 'low');
      img.style.cssText = `width:100%;height:100%;object-fit:cover;border-radius:${heatStyle.markerBackground === '#fff' ? '0' : '10px'}`;
      img.onerror = () => { img.style.display = 'none'; };
      box.appendChild(img);
      if ((event.favorite_count || 0) > 0) {
        const badge = document.createElement('div');
        badge.textContent = String(event.favorite_count);
        badge.style.cssText = 'position:absolute;right:-7px;top:-7px;min-width:22px;height:22px;padding:0 5px;border-radius:999px;border:2px solid #064E3B;background:#fff;color:#F97316;font-size:11px;font-weight:800;line-height:18px;text-align:center;box-shadow:2px 2px 0 #064E3B';
        hoverShell.appendChild(badge);
      }
      const arrow = document.createElement('div');
      arrow.style.cssText = 'width:0;height:0;margin:2px auto 0;border-left:8px solid transparent;border-right:8px solid transparent;border-top:10px solid #064E3B';
      hoverShell.appendChild(box); hoverShell.appendChild(arrow);
      outer.appendChild(hoverShell);
      div.appendChild(outer);
      eventMarkerNodes.current.push(outer);
      const marker = new AMap.Marker({ position: [event.longitude, event.latitude], content: div, anchor: 'bottom-center', zIndex: heatStyle.zIndex });
      marker.on('click', () => {
        if (Date.now() < touchBlockUntilRef.current) return;
        setSelectedEvent(event); setSelectedVenue(null);
        setDetailPosterLoaded(false);
        setIsMobileSidebarOpen(false);
        mapInstance.current.setCenter([event.longitude, event.latitude]);
      });
      eventMarkers.current.push(marker);
      eventMarkerRecords.current.push({
        marker,
        node: outer,
        img,
        lng: Number(event.longitude),
        lat: Number(event.latitude),
        loaded: false,
      });

      const dotSize = heatStyle.dotSize;
      const heat = getEventHeat(event);
      const dotRadius = Math.max(5, Math.round(dotSize / 2));
      const dotFillColor = heat === 'hot' ? '#F97316' : heat === 'warm' ? '#38BDF8' : '#10B981';
      const dotFillOpacity = heat === 'normal' ? 0.92 : 0.96;
      const dotStrokeWeight = heat === 'normal' ? 2 : 3;
      const dotMarker = new AMap.CircleMarker({
        center: [event.longitude, event.latitude],
        radius: dotRadius,
        strokeColor: '#064E3B',
        strokeWeight: dotStrokeWeight,
        fillColor: dotFillColor,
        fillOpacity: dotFillOpacity,
        cursor: 'pointer',
        zIndex: heatStyle.zIndex,
      });
      dotMarker.on('click', () => {
        if (Date.now() < touchBlockUntilRef.current) return;
        setSelectedEvent(event); setSelectedVenue(null); setSelectedSession(null);
        setDetailPosterLoaded(false);
        setIsMobileSidebarOpen(false);
        mapInstance.current.setCenter([event.longitude, event.latitude]);
        mapInstance.current.setZoom(DETAIL_MARKER_MIN_ZOOM);
      });
      eventDotMarkers.current.push(dotMarker);
      eventDotRecords.current.push({
        marker: dotMarker,
        lng: Number(event.longitude),
        lat: Number(event.latitude),
        radius: dotRadius,
        fillColor: dotFillColor,
        fillOpacity: dotFillOpacity,
        strokeWeight: dotStrokeWeight,
        zIndex: heatStyle.zIndex,
      });
    });
    syncMarkerVisibility();
  };

  const addVenueMarkers = () => {
    const AMap = amapRef.current;
    if (!AMap) return;
    venueMarkers.current.forEach(m => m.setMap(null));
    venueDotMarkers.current.forEach(m => m.setMap(null));
    venueMarkers.current = [];
    venueDotMarkers.current = [];
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
        img.src = getImageUrl(venue.cover_url, 'thumb');
        img.loading = 'lazy';
        img.decoding = 'async';
        img.style.cssText = 'width:100%;height:100%;object-fit:cover';
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
      const marker = new AMap.Marker({ position: [venue.longitude, venue.latitude], content: div, anchor: 'bottom-center', zooms: DETAIL_MARKER_ZOOMS });
      marker.on('click', () => {
        if (Date.now() < touchBlockUntilRef.current) return;
        setSelectedVenue(venue); setSelectedEvent(null); setSelectedSession(null);
        setNavMenuOpen(false);
        setIsMobileSidebarOpen(false);
        mapInstance.current.setCenter([venue.longitude, venue.latitude]);
        // 加载该店铺的组局列表
        sessionService.getVenueSessions(venue.id).then(r => setVenueSessions(r.sessions)).catch(() => setVenueSessions([]));
      });
      venueMarkers.current.push(marker);

      const dotMarker = new AMap.CircleMarker({
        center: [venue.longitude, venue.latitude],
        radius: 6,
        strokeColor: '#064E3B',
        strokeWeight: 2,
        fillColor: '#7C3AED',
        fillOpacity: 0.9,
        zIndex: 120,
        cursor: 'pointer',
      });
      dotMarker.on('click', () => {
        if (Date.now() < touchBlockUntilRef.current) return;
        setSelectedVenue(venue); setSelectedEvent(null); setSelectedSession(null);
        setNavMenuOpen(false);
        setIsMobileSidebarOpen(false);
        mapInstance.current.setCenter([venue.longitude, venue.latitude]);
        mapInstance.current.setZoom(DETAIL_MARKER_MIN_ZOOM);
        sessionService.getVenueSessions(venue.id).then(r => setVenueSessions(r.sessions)).catch(() => setVenueSessions([]));
      });
      venueDotMarkers.current.push(dotMarker);
    });
    syncMarkerVisibility();
  };

  const addSessionMarkers = () => {
    const AMap = amapRef.current;
    if (!AMap) return;
    sessionMarkers.current.forEach(m => m.setMap(null));
    sessionDotMarkers.current.forEach(m => m.setMap(null));
    sessionMarkers.current = [];
    sessionDotMarkers.current = [];
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
      const marker = new AMap.Marker({ position: [session.longitude, session.latitude], content: div, anchor: 'bottom-center', zooms: DETAIL_MARKER_ZOOMS });
      marker.on('click', () => {
        if (Date.now() < touchBlockUntilRef.current) return;
        setSelectedSession(session); setSelectedEvent(null); setSelectedVenue(null);
        setIsMobileSidebarOpen(false);
        mapInstance.current.setCenter([session.longitude, session.latitude]);
        mapInstance.current.setZoom(16);
      });
      sessionMarkers.current.push(marker);

      const dotMarker = new AMap.CircleMarker({
        center: [session.longitude, session.latitude],
        radius: 6,
        strokeColor: '#064E3B',
        strokeWeight: 2,
        fillColor: '#2563EB',
        fillOpacity: 0.9,
        zIndex: 130,
        cursor: 'pointer',
      });
      dotMarker.on('click', () => {
        if (Date.now() < touchBlockUntilRef.current) return;
        setSelectedSession(session); setSelectedEvent(null); setSelectedVenue(null);
        setIsMobileSidebarOpen(false);
        mapInstance.current.setCenter([session.longitude, session.latitude]);
        mapInstance.current.setZoom(DETAIL_MARKER_MIN_ZOOM);
      });
      sessionDotMarkers.current.push(dotMarker);
    });
    syncMarkerVisibility();
  };

  const handleEventClick = useCallback((event: Event) => {
    setSelectedEvent(event); setSelectedVenue(null);
    setDetailPosterLoaded(false);
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

  useEffect(() => {
    const focus = searchParams.get('focus');
    if (!focus || loading || handledFocusRef.current === focus) return;

    const [type, rawId] = focus.split('-');
    const id = Number(rawId);
    if (!id) return;

    if (type === 'event') {
      const event = events.find(item => item.id === id);
      if (!event) return;
      handledFocusRef.current = focus;
      setTab('events');
      handleEventClick(event);
      setSearchParams({}, { replace: true });
      return;
    }

    if (type === 'venue') {
      const venue = venues.find(item => item.id === id);
      if (!venue) return;
      handledFocusRef.current = focus;
      setTab('venues');
      handleVenueClick(venue);
      setSearchParams({}, { replace: true });
      return;
    }

    if (type === 'session') {
      const session = sessions.find(item => item.id === id);
      if (!session) return;
      handledFocusRef.current = focus;
      setTab('sessions');
      handleSessionClick(session);
      setSearchParams({}, { replace: true });
    }
  }, [events, venues, sessions, loading, searchParams, setSearchParams, handleEventClick, handleVenueClick, handleSessionClick]);

  const handleTabChange = useCallback((t: TabType) => { setTab(t); }, []);

  const handleSearchChange = useCallback((q: string) => { setSearchQuery(q); }, []);

  const closeMobileSidebar = useCallback(() => {
    setMobileSidebarSwipeClosing(false);
    mobileSidebarDragXRef.current = 0;
    mobileSidebarTouchRef.current = null;
    if (mobileSidebarDragRafRef.current !== null) cancelAnimationFrame(mobileSidebarDragRafRef.current);
    mobileSidebarDragRafRef.current = null;
    if (mobileSidebarPanelRef.current) {
      mobileSidebarPanelRef.current.style.transform = '';
      mobileSidebarPanelRef.current.style.visibility = '';
    }
    // 清除拖拽标记，重置滚动位置
    document.body.removeAttribute('data-sidebar-dragging');
    const sidebar = document.querySelector('.animap-home-scrollable');
    if (sidebar) sidebar.scrollTop = 0;
    setIsMobileSidebarOpen(false);
  }, []);

  const setMobileSidebarPanelDrag = useCallback((x: number) => {
    mobileSidebarDragXRef.current = x;
    document.body.setAttribute('data-sidebar-dragging', 'true');
    if (mobileSidebarDragRafRef.current !== null) return;
    mobileSidebarDragRafRef.current = requestAnimationFrame(() => {
      mobileSidebarDragRafRef.current = null;
      if (mobileSidebarPanelRef.current) {
        mobileSidebarPanelRef.current.style.transform = `translateX(${mobileSidebarDragXRef.current}px)`;
      }
    });
  }, []);

  const finishMobileSidebarSwipeClose = useCallback(() => {
    const panel = mobileSidebarPanelRef.current;
    mobileSidebarTouchRef.current = null;
    document.body.removeAttribute('data-sidebar-dragging');
    const sidebar = document.querySelector('.animap-home-scrollable');
    if (sidebar) sidebar.scrollTop = 0;
    if (!panel) {
      setIsMobileSidebarOpen(false);
      return;
    }
    if (mobileSidebarDragRafRef.current !== null) cancelAnimationFrame(mobileSidebarDragRafRef.current);
    mobileSidebarDragRafRef.current = null;
    panel.style.transition = 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease-out';
    panel.style.transform = 'translateX(calc(-100% - 2rem))';
    panel.style.opacity = '0.96';
    window.setTimeout(() => {
      panel.style.visibility = 'hidden';
      mobileSidebarDragXRef.current = 0;
      setMobileSidebarSwipeClosing(true);
      setIsMobileSidebarOpen(false);
    }, 220);
  }, []);

  const handleMobileSidebarTouchStart = useCallback((event: React.TouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    mobileSidebarTouchRef.current = { startX: touch.clientX, startY: touch.clientY, startedAt: performance.now(), locked: false };
    setMobileSidebarPanelDrag(0);
  }, [setMobileSidebarPanelDrag]);

  const handleMobileSidebarTouchMove = useCallback((event: React.TouchEvent<HTMLElement>) => {
    const mobileSidebarTouch = mobileSidebarTouchRef.current;
    if (!mobileSidebarTouch) return;
    const touch = event.touches[0];
    const deltaX = touch.clientX - mobileSidebarTouch.startX;
    const deltaY = touch.clientY - mobileSidebarTouch.startY;
    const horizontal = Math.abs(deltaX) > Math.abs(deltaY) + 8;
    if (!mobileSidebarTouch.locked && !horizontal) return;
    if (!mobileSidebarTouch.locked) mobileSidebarTouchRef.current = { ...mobileSidebarTouch, locked: true };
    if (deltaX >= 0) {
      setMobileSidebarPanelDrag(0);
      return;
    }
    event.preventDefault();
    setMobileSidebarPanelDrag(Math.max(deltaX, -150));
  }, [setMobileSidebarPanelDrag]);

  const handleMobileSidebarTouchEnd = useCallback(() => {
    const mobileSidebarTouch = mobileSidebarTouchRef.current;
    if (!mobileSidebarTouch) return;
    const elapsed = Math.max(1, performance.now() - mobileSidebarTouch.startedAt);
    const dragX = mobileSidebarDragXRef.current;
    const distance = Math.abs(dragX);
    const velocity = distance / elapsed;
    if (dragX < -88 || velocity > 0.55) {
      finishMobileSidebarSwipeClose();
      return;
    }
    if (mobileSidebarPanelRef.current) mobileSidebarPanelRef.current.style.transform = '';
    mobileSidebarDragXRef.current = 0;
    mobileSidebarTouchRef.current = null;
    document.body.removeAttribute('data-sidebar-dragging');
  }, [closeMobileSidebar, finishMobileSidebarSwipeClose]);

  const handlePublishAction = useCallback((to: string) => {
    setPublishMenuOpen(false);
    navigate(isAuthenticated() ? to : '/login');
  }, [navigate]);

  const handleLocateMe = useCallback(() => {
    if (!mapInstance.current || !amapRef.current) return;
    const saved = localStorage.getItem(LOCATION_CONSENT_KEY);
    if (saved !== 'allow') {
      setShowLocationConsent(true);
      return;
    }
    doGpsLocate();
  }, [doGpsLocate]);

  useLayoutEffect(() => {
    const items = publishActionRefs.current.filter(Boolean);
    const button = publishFabRef.current;
    // FAB 被隐藏/未挂载时 button 为 null，GSAP 会抛 "target null not found" 警告，直接跳过动画
    if (!button) return;
    const launchOffsets = items.map((_, index) => 74 + index * 66);

    gsap.killTweensOf([button, ...items]);

    // 性能优化模式：跳过弹性动画，直接定位到最终状态
    if (isPerfMode()) {
      gsap.set(button, { rotate: publishMenuOpen ? 45 : 0, scaleX: 1, scaleY: 1 });
      if (publishMenuOpen) {
        gsap.set(items, { autoAlpha: 1, x: 0, y: 0, scaleX: 1, scaleY: 1, rotate: 0 });
      } else {
        gsap.set(items, { autoAlpha: 0, x: 48, scale: 0.16 });
      }
      return;
    }

    const timeline = gsap.timeline();

    if (publishMenuOpen) {
      timeline
        .set(items, {
          autoAlpha: 0,
          x: 46,
          y: (index) => launchOffsets[index],
          scale: 0.12,
          rotate: 22,
          transformOrigin: '100% 100%',
        }, 0)
        .to(button, {
          rotate: 36,
          scaleX: 1.18,
          scaleY: 0.84,
          duration: 0.1,
          ease: 'power3.out',
        }, 0)
        .to(button, {
          rotate: 45,
          scaleX: 1,
          scaleY: 1,
          duration: 0.58,
          ease: 'elastic.out(1.35, 0.42)',
        }, 0.08);

      items.forEach((item, index) => {
        timeline
          .to(item, {
            autoAlpha: 1,
            x: -10,
            y: -8,
            scaleX: 1.08,
            scaleY: 0.92,
            rotate: -3,
            duration: 0.25,
            ease: 'power3.out',
          }, 0.04 + index * 0.065)
          .to(item, {
            x: 0,
            y: 0,
            scaleX: 1,
            scaleY: 1,
            rotate: 0,
            duration: 0.55,
            ease: 'elastic.out(1.15, 0.52)',
          }, 0.22 + index * 0.065);
      });
    } else {
      timeline
        .to(button, {
          rotate: 0,
          scaleX: 0.9,
          scaleY: 1.12,
          duration: 0.1,
          ease: 'power3.out',
        }, 0)
        .to(button, {
          scaleX: 1,
          scaleY: 1,
          duration: 0.32,
          ease: 'elastic.out(1, 0.55)',
        }, 0.08);

      [...items].reverse().forEach((item, reverseIndex) => {
        const index = items.indexOf(item);
        timeline
          .to(item, {
            x: -7,
            y: -7,
            scaleX: 1.06,
            scaleY: 0.94,
            rotate: -2,
            duration: 0.08,
            ease: 'power2.out',
          }, reverseIndex * 0.035)
          .to(item, {
            autoAlpha: 0,
            x: 48,
            y: launchOffsets[index],
            scale: 0.16,
            rotate: 18,
            duration: 0.22,
            ease: 'power3.in',
          }, 0.08 + reverseIndex * 0.035);
      });
    }
  }, [publishMenuOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPublishMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    document.body.style.overflow = isMobileSidebarOpen ? 'hidden' : '';
    if (isMobileSidebarOpen) {
      // 安全阀：10 秒后强制解锁 body，防止卡死绿屏。
      // 注意：只解锁 body，不再强制关闭列表（否则列表会无故自动收回）。
      const timeout = setTimeout(() => {
        document.body.style.overflow = '';
      }, 10000);
      return () => {
        document.body.style.overflow = '';
        clearTimeout(timeout);
      };
    }
    return () => { document.body.style.overflow = ''; };
  }, [isMobileSidebarOpen]);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const sync = () => setIsDesktopLayout(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  // 搜索过滤
  const filteredEvents = useMemo(() => {
    const filtered = events.filter(e =>
      !searchQuery ||
      e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.venue_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.address.toLowerCase().includes(searchQuery.toLowerCase())
    );
    // 按用户位置距离排序（近→远），无位置时保持原序
    if (userPosition && !searchQuery) {
      const [uLng, uLat] = userPosition;
      const toRad = (d: number) => d * Math.PI / 180;
      return [...filtered].sort((a, b) => {
        const dA = Math.acos(Math.sin(toRad(uLat)) * Math.sin(toRad(Number(a.latitude))) + Math.cos(toRad(uLat)) * Math.cos(toRad(Number(a.latitude))) * Math.cos(toRad(uLng - Number(a.longitude))));
        const dB = Math.acos(Math.sin(toRad(uLat)) * Math.sin(toRad(Number(b.latitude))) + Math.cos(toRad(uLat)) * Math.cos(toRad(Number(b.latitude))) * Math.cos(toRad(uLng - Number(b.longitude))));
        return dA - dB;
      });
    }
    return filtered;
  }, [events, searchQuery, userPosition]);

  const handleToggleFavorite = async (type: 'event' | 'venue' | 'session', id: number) => {
    if (!isAuthenticated()) { navigate('/login'); return; }
    const key = `${type}-${id}`;
    const wasFavorited = favorites.has(key);
    const favoriteDelta = wasFavorited ? -1 : 1;
    // 涔愯鏇存柊
    setFavorites(prev => {
      const next = new Set(prev);
      wasFavorited ? next.delete(key) : next.add(key);
      return next;
    });
    if (type === 'event') {
      const updateFavoriteCount = (event: Event) => (
        event.id === id ? { ...event, favorite_count: Math.max(0, Number(event.favorite_count || 0) + favoriteDelta) } : event
      );
      setEvents(prev => prev.map(updateFavoriteCount));
      setSelectedEvent(prev => prev && prev.id === id ? updateFavoriteCount(prev) : prev);
    }
    try {
      await favoriteService.toggle(type, id);
    } catch {
      // 失败时回滚
      setFavorites(prev => {
        const next = new Set(prev);
        wasFavorited ? next.add(key) : next.delete(key);
        return next;
      });
      if (type === 'event') {
        const rollbackFavoriteCount = (event: Event) => (
          event.id === id ? { ...event, favorite_count: Math.max(0, Number(event.favorite_count || 0) - favoriteDelta) } : event
        );
        setEvents(prev => prev.map(rollbackFavoriteCount));
        setSelectedEvent(prev => prev && prev.id === id ? rollbackFavoriteCount(prev) : prev);
      }
    }
  };

  useEffect(() => {
    let alive = true;
    setCommentText('');
    setCommentError('');
    if (!selectedEvent) {
      setEventComments([]);
      return;
    }

    eventService.getEventComments(selectedEvent.id)
      .then(res => {
        if (alive) setEventComments(res.comments);
      })
      .catch(() => {
        if (alive) setCommentError('评论加载失败');
      });

    return () => { alive = false; };
  }, [selectedEvent?.id]);

  const handleSubmitComment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedEvent) return;
    if (!isAuthenticated()) { navigate('/login'); return; }

    const content = commentText.trim();
    if (!content) {
      setCommentError('请输入评论内容');
      return;
    }
    if (content.length > 80) {
      setCommentError('评论最多 80 个字');
      return;
    }

    setCommentLoading(true);
    setCommentError('');
    try {
      const res = await eventService.createEventComment(selectedEvent.id, content);
      setEventComments(prev => [...prev.slice(-79), res.comment]);
      setCommentText('');
    } catch (err: any) {
      setCommentError(err?.response?.data?.error || '发表评论失败');
    } finally {
      setCommentLoading(false);
    }
  };

  const handleToggleDanmakuVisible = () => {
    setDanmakuVisible(prev => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('animap:danmaku-visible', next ? '1' : '0');
      }
      return next;
    });
  };

  const filteredVenues = useMemo(() => venues.filter(v =>
    !searchQuery ||
    v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.address.toLowerCase().includes(searchQuery.toLowerCase())
  ), [venues, searchQuery]);

  const filteredSessions = useMemo(() => sessions.filter(s =>
    !searchQuery ||
    s.game_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.venue_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.address.toLowerCase().includes(searchQuery.toLowerCase())
  ), [sessions, searchQuery]);

  // 随机切换到另一个展会
  const handleRandomNext = () => {
    if (events.length <= 1) {
      setSelectedEvent(null);
      return;
    }
    const others = events.filter(e => e.id !== selectedEvent?.id);
    const next = others[Math.floor(Math.random() * others.length)];
    setSelectedEvent(next);
    setDetailPosterLoaded(false);
    setNavMenuOpen(false);
    if (mapInstance.current) {
      mapInstance.current.setCenter([next.longitude, next.latitude]);
      mapInstance.current.setZoom(15);
    }
  };

  // 分享当前活动：生成 ?focus=event-{id} 链接，别人打开后会自动弹出该活动详情。
  // 优先调用系统原生分享面板（手机可直接选微信/QQ），否则复制链接到剪贴板。
  const handleShareEvent = async () => {
    if (!selectedEvent) return;
    const url = `${window.location.origin}/?focus=event-${selectedEvent.id}`;
    const title = `${selectedEvent.name} · AniMap`;
    const text = `${selectedEvent.name}${selectedEvent.venue_name ? ' @ ' + selectedEvent.venue_name : ''}`;
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
        return;
      }
    } catch {
      // 用户取消分享（AbortError）等，直接返回，不再降级提示
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      alert('活动链接已复制，快去分享给好友吧');
    } catch {
      alert('活动链接：' + url);
    }
  };

  useEffect(() => {
    if (!isDesktopLayout || !selectedEvent) return;

    const frame = requestAnimationFrame(() => {
      const sidebar = document.querySelector<HTMLElement>('[data-desktop-sidebar]');
      const item = document.querySelector<HTMLElement>(`[data-sidebar-item="event-${selectedEvent.id}"]`);
      if (!sidebar || !item) return;

      const sidebarRect = sidebar.getBoundingClientRect();
      const itemRect = item.getBoundingClientRect();
      const targetTop = sidebar.scrollTop + itemRect.top - sidebarRect.top;
      sidebar.scrollTo({ top: Math.max(targetTop, 0), behavior: 'smooth' });
    });

    return () => cancelAnimationFrame(frame);
  }, [isDesktopLayout, selectedEvent?.id]);

  useEffect(() => {
    if (eventModalRef.current) {
      eventModalRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [selectedEvent?.id]);

  // 详情面板关闭后 resize 地图：backdrop-blur 的 GPU 合成层在 iOS/Android 上
  // 会让 AMap canvas 显示网格占位，调 resize() 强制重绘修复
  useEffect(() => {
    if (!selectedEvent && !selectedVenue && !selectedSession && mapInstance.current) {
      const t = setTimeout(() => {
        if (mapInstance.current) mapInstance.current.resize();
      }, 320);
      return () => clearTimeout(t);
    }
  }, [selectedEvent, selectedVenue, selectedSession]);

  const publishActions = [
    { key: 'event' as const, label: '发布活动', to: '/merchant/create', icon: Calendar, color: 'bg-action' },
    { key: 'venue' as const, label: '发布商铺', to: '/merchant/venue/create', icon: Store, color: 'bg-pop-purple' },
    { key: 'session' as const, label: '发布组局', to: '/merchant/session/create', icon: Gamepad2, color: 'bg-blue-600' },
    { key: 'dance' as const, label: "let's dance!", to: '/merchant/session/create?type=dance', icon: null, iconSrc: '/icons/lets-dance.svg', color: 'bg-pop-pink' },
  ].filter((action) => fabConfig[action.key]);

  return (
    <div className="flex h-screen-safe flex-col bg-primary-50 dark:bg-night-200">
      <NavHeader />

      <div className="relative flex-1 overflow-hidden lg:flex">
        {/* 地图 */}
        <div className="animap-home-touch-surface relative h-full min-h-0 flex-1 select-none">
          <div ref={mapRef} className="h-full w-full select-none" style={{ WebkitUserSelect: 'none' }} />

          {/* 回到我的位置 */}
          <button
            type="button"
            onClick={handleLocateMe}
            aria-label="回到我的位置"
            className="absolute right-4 z-20 flex h-10 w-10 items-center justify-center rounded-2xl border-3 border-ink bg-white transition-all duration-200 hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-action/30 dark:border-night-400 dark:bg-night-100"
            style={{ top: 'max(12px, calc(0.75rem + env(safe-area-inset-top, 0px)))' }}
          >
            <LocateFixed className="h-5 w-5 text-action" strokeWidth={2.5} />
          </button>

          <AnimatePresence>
            {loading && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 flex items-center justify-center bg-primary-50/90 dark:bg-night-200/90 sm:backdrop-blur-sm z-10"
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
          <div className="absolute bottom-6 left-0 right-0 z-30 flex justify-between px-5 pointer-events-none lg:hidden">
            <button
              type="button"
              onClick={() => {
                if (sidebarToggleLockRef.current) return;
                sidebarToggleLockRef.current = true;
                setTimeout(() => { sidebarToggleLockRef.current = false; }, 400);
                setMobileSidebarSwipeClosing(false);
                setIsMobileSidebarOpen(p => !p);
              }}
              className="pointer-events-auto w-14 h-14 rounded-2xl bg-white dark:bg-night-100 border-3 border-ink dark:border-night-400 shadow-block hover:-translate-y-1 hover:shadow-block-lg transition-all duration-200 flex items-center justify-center text-ink dark:text-primary-100"
              aria-label="展会列表"
            >
              <Menu className="w-6 h-6" strokeWidth={2.5} />
            </button>

            {publishActions.length > 0 && (
            <div className="pointer-events-auto relative flex flex-col items-end gap-3">
              <div
                className={`absolute bottom-[4.5rem] right-0 z-20 flex flex-col-reverse items-end gap-3 ${publishMenuOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
                aria-hidden={!publishMenuOpen}
                role="menu"
              >
                {publishActions.map((action, index) => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.to}
                      ref={(node) => { publishActionRefs.current[index] = node; }}
                      type="button"
                      role="menuitem"
                      tabIndex={publishMenuOpen ? 0 : -1}
                      onClick={() => handlePublishAction(action.to)}
                      className="group flex min-w-[156px] origin-bottom-right items-center justify-between gap-3 rounded-2xl border-3 border-ink bg-white px-3 py-2.5 text-sm font-sans font-semibold text-ink shadow-block-sm outline-none transition-shadow duration-200 hover:shadow-block focus-visible:ring-3 focus-visible:ring-action/40 dark:border-night-400 dark:bg-night-100 dark:text-primary-100"
                      style={{ opacity: 0, visibility: 'hidden', transform: 'translateY(16px) scale(0.82)' }}
                    >
                      <span className={action.label === "let's dance!" ? "whitespace-nowrap font-sans font-bold tracking-normal" : "whitespace-nowrap font-sans font-semibold"}>{action.label}</span>
                      <span className={`flex h-9 w-9 items-center justify-center rounded-xl border-2 border-ink text-white shadow-block-sm ${action.color}`}>
                        {action.iconSrc ? <img src={action.iconSrc} alt="" className="h-5 w-5" /> : Icon ? <Icon className="h-5 w-5" strokeWidth={2.5} /> : null}
                      </span>
                    </button>
                  );
                })}
              </div>

              {publishMenuOpen && (
                <button
                  type="button"
                  className="fixed inset-0 z-10 cursor-default"
                  aria-label="关闭发布菜单"
                  onClick={() => setPublishMenuOpen(false)}
                />
              )}

            <button
              ref={publishFabRef}
              type="button"
              onClick={() => setPublishMenuOpen(open => !open)}
              className="pointer-events-auto relative z-30 w-14 h-14 rounded-2xl bg-action border-3 border-ink dark:border-night-400 shadow-block hover:-translate-y-1 hover:shadow-block-lg transition-shadow duration-200 flex items-center justify-center text-white outline-none focus-visible:ring-3 focus-visible:ring-action/40"
              aria-label={publishMenuOpen ? '关闭发布菜单' : '打开发布菜单'}
              aria-expanded={publishMenuOpen}
              aria-haspopup="menu"
            >
              <Plus className="w-7 h-7" strokeWidth={3} />
            </button>
          </div>
          )}
        </div>

        {/* 桌面端侧边栏 */}
        </div>
        {isDesktopLayout && (
          <aside data-desktop-sidebar className="hidden lg:flex flex-col w-[400px] overflow-y-auto rounded-l-3xl bg-white dark:bg-night-100 border-l-3 border-y-3 border-ink dark:border-night-400 shadow-block">
            <SidebarContent
              events={events} venues={venues} sessions={sessions}
              filteredEvents={filteredEvents} filteredVenues={filteredVenues} filteredSessions={filteredSessions}
              selectedEvent={selectedEvent} selectedVenue={selectedVenue} selectedSession={selectedSession}
              searchQuery={searchQuery} loading={loading}
              tab={tab} onTabChange={handleTabChange}
              onSearchChange={handleSearchChange}
              onEventClick={handleEventClick} onVenueClick={handleVenueClick} onSessionClick={handleSessionClick}
              onRequestLocation={() => setShowLocationConsent(true)}
            />
          </aside>
        )}
      </div>

      {/* 移动端遮罩 */}
      <AnimatePresence mode="wait">
        {isMobileSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] touch-none bg-ink/50 sm:backdrop-blur-sm lg:hidden"
            onClick={closeMobileSidebar}
            onTouchMove={(event) => event.preventDefault()}
          />
        )}
      </AnimatePresence>

      {/* 移动端抽屉 */}
      <AnimatePresence mode="wait">
        {isMobileSidebarOpen && (
          <motion.aside
            ref={mobileSidebarPanelRef}
            initial={{ x: 'calc(-100% - 2rem)', scale: 0.98 }}
            animate={mobileSidebarSwipeClosing ? false : { x: 0, scale: 1 }}
            exit={mobileSidebarSwipeClosing ? undefined : { x: 'calc(-100% - 2rem)', scale: 0.98 }}
            transition={{ type: 'spring', damping: 25, stiffness: 430, mass: 0.82 }}
            onTouchStart={handleMobileSidebarTouchStart}
            onTouchMove={handleMobileSidebarTouchMove}
            onTouchEnd={handleMobileSidebarTouchEnd}
            onTouchCancel={handleMobileSidebarTouchEnd}
            className="animap-home-scrollable fixed bottom-4 left-4 top-4 z-[80] w-[88vw] max-w-sm touch-pan-y overscroll-contain overflow-x-hidden overflow-y-auto rounded-3xl bg-white dark:bg-night-200 border-3 border-ink dark:border-night-400 shadow-block-lg lg:hidden"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-[1.35rem] bg-action border-b-3 border-ink px-4 py-3">
              <div>
                <p className="font-display text-lg text-white">附近发现</p>
                <p className="text-xs text-white/80">展会 · 店铺 · 组局</p>
              </div>
              <button
                type="button"
                onClick={closeMobileSidebar}
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
              onRequestLocation={() => setShowLocationConsent(true)}
              isMobile
            />
          </motion.aside>
        )}
      </AnimatePresence>
      {/* 详情 Modal */}
      <AnimatePresence onExitComplete={() => { mapInstance.current?.resize(); }}>
        {selectedEvent && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-ink/70 sm:backdrop-blur-sm flex items-center justify-center p-4 z-50"
            onClick={() => { setSelectedEvent(null); setNavMenuOpen(false); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.88, y: 36 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 24 }}
              transition={{ type: 'spring', damping: 20, stiffness: 390, mass: 0.9 }}
              ref={eventModalRef}
              className="card-flat shadow-block-lg max-w-lg w-full max-h-modal overflow-y-auto relative"
              onClick={e => e.stopPropagation()}
            >
              {/* 顶部关闭按钮：保留悬浮关闭能力，不再用白色遮罩盖住海报 */}
              <div className="sticky top-0 z-20 flex justify-end p-2 pointer-events-none">
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="pointer-events-auto w-10 h-10 rounded-xl bg-white/95 dark:bg-night-100/95 border-3 border-ink dark:border-night-400 shadow-block-sm flex items-center justify-center hover:-translate-y-0.5 hover:shadow-block transition-all duration-200 text-ink dark:text-primary-100"
                  aria-label="关闭"
                >
                  <X className="w-5 h-5" strokeWidth={2.5} />
                </button>
              </div>

              {/* 海报区（负边距拉到顶部，让关闭条浮在海报上） */}
              <div className="relative -mt-14">
                <LongPressPoster
                  src={getImageUrl(selectedEvent.poster_url, 'medium')}
                  fullSrc={getImageUrl(selectedEvent.poster_url, 'original')}
                  alt={selectedEvent.name}
                  className="w-full"
                  onClick={() => setFullPosterUrl(getImageUrl(selectedEvent.poster_url, 'original'))}
                >
                  <div className="relative w-full cursor-pointer">
                    <div className="aspect-[16/10] overflow-hidden rounded-t-2xl border-b-3 border-ink dark:border-night-400 relative">
                      {!detailPosterLoaded && (
                        <div className="absolute inset-0 img-loading-shimmer z-10 flex items-center justify-center">
                          <div className="w-8 h-8 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                        </div>
                      )}
                      <img
                        src={getImageUrl(selectedEvent.poster_url, 'medium')}
                        alt={selectedEvent.name}
                        decoding="async"
                        draggable={false}
                        onLoad={() => setDetailPosterLoaded(true)}
                        className="w-full h-full object-cover"
                        style={{ WebkitTouchCallout: 'none', pointerEvents: 'none' }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-ink/20 pointer-events-none">
                        <span className="px-3 py-1.5 rounded-xl bg-white/90 border-2 border-ink text-sm font-bold text-ink shadow-block-sm dark:bg-night-100/90 dark:text-primary-100 dark:border-night-400">
                          🔍 查看完整海报
                        </span>
                      </div>
                    </div>
                    <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-ink/90 via-ink/40 to-transparent pointer-events-none" />
                    <h2 className="absolute bottom-4 left-5 right-16 font-display text-2xl text-white tracking-wide pointer-events-none">
                      {selectedEvent.name}
                    </h2>
                  </div>
                </LongPressPoster>
                {danmakuVisible && (
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  {eventComments.slice(-10).map((comment, index) => (
                    <div
                      key={`${comment.id}-${index}`}
                      className="event-danmaku"
                      style={{
                        top: `${16 + (index % 5) * 15}%`,
                        animationDelay: `${(index % 4) * 1.8}s`,
                        animationDuration: `${18 + (index % 3) * 3}s`,
                      }}
                    >
                      <span className="font-display">{comment.username}：</span>{comment.content}
                    </div>
                  ))}
                </div>
                )}
                {selectedEvent.ticket_price && (
                  <div className="absolute top-3 left-3 px-3 py-1.5 bg-action border-3 border-ink rounded-xl shadow-block-sm">
                    <span className="font-display text-white text-sm">{selectedEvent.ticket_price}</span>
                  </div>
                )}
                <div className="absolute top-3 right-14 px-2.5 py-1 rounded-xl bg-gradient-to-r from-pop-rose to-action border-2 border-ink shadow-block-sm flex items-center gap-1 text-white">
                  <Heart className="w-3.5 h-3.5" fill="currentColor" strokeWidth={0} />
                  <span className="font-display text-xs leading-none">{selectedEvent.favorite_count || 0}</span>
                </div>
                <button
                  type="button"
                  onClick={handleToggleDanmakuVisible}
                  className="absolute right-3 bottom-16 flex h-9 w-9 items-center justify-center rounded-xl border-2 border-ink bg-white/92 text-ink shadow-block-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-block dark:border-night-400 dark:bg-night-100/92 dark:text-primary-100"
                  aria-label={danmakuVisible ? '关闭弹幕显示' : '开启弹幕显示'}
                  title={danmakuVisible ? '关闭弹幕显示' : '开启弹幕显示'}
                >
                  {danmakuVisible ? <Eye className="h-4 w-4" strokeWidth={2.5} /> : <EyeOff className="h-4 w-4" strokeWidth={2.5} />}
                </button>
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

              <div className="px-5 pb-4">
                <div className="rounded-xl border-2 border-ink/10 dark:border-night-400 bg-primary-50 dark:bg-night-200 p-3">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <p className="font-display text-sm text-ink dark:text-primary-100">弹幕评论</p>
                    <span className="text-xs text-ink-muted dark:text-primary-100/60">{eventComments.length} 条</span>
                  </div>
                  <form onSubmit={handleSubmitComment} className="flex gap-2">
                    <input
                      id="event-comment-input"
                      name="event-comment"
                      type="text"
                      value={commentText}
                      onChange={e => setCommentText(e.target.value)}
                      maxLength={80}
                      placeholder={isAuthenticated() ? '发一条会飘过海报的评论...' : '登录后发表评论'}
                      className="flex-1 min-w-0 px-3 py-2 rounded-lg border-2 border-ink dark:border-night-400 bg-white dark:bg-night-100 text-sm text-ink dark:text-primary-100 focus:outline-none focus:ring-3 focus:ring-action/30"
                    />
                    <button type="submit" disabled={commentLoading} className="btn-action !py-2 !px-3 !text-sm">
                      {commentLoading ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                  </form>
                  {commentError && <p className="mt-2 text-xs text-pop-rose">{commentError}</p>}
                </div>
              </div>

              {/* 底部操作区：导航 + 购票 + 换个展会 */}
              <div className="p-5 pt-0 grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setNavMenuOpen(true)} className="btn-primary w-full !px-3 !py-3">
                  <Navigation className="w-5 h-5" />导航到这里
                </button>
                <button type="button"
                  onClick={() => handleToggleFavorite('event', selectedEvent.id)}
                  aria-label={favorites.has(`event-${selectedEvent.id}`) ? '取消收藏' : '收藏展会'}
                  className={`btn-secondary w-full !px-3 !py-3 ${favorites.has(`event-${selectedEvent.id}`) ? '!bg-pop-rose !text-white !border-pop-rose' : ''}`}>
                  <Heart className="w-5 h-5" strokeWidth={favorites.has(`event-${selectedEvent.id}`) ? 0 : 2} fill={favorites.has(`event-${selectedEvent.id}`) ? 'currentColor' : 'none'} />
                  <span className="font-display">{selectedEvent.favorite_count || 0}</span>
                </button>
                <button type="button" onClick={handleShareEvent} aria-label="分享活动" className="btn-secondary w-full !px-3 !py-3">
                  <Share2 className="w-5 h-5" />
                  <span className="font-display">分享活动</span>
                </button>
                {selectedEvent.ticket_url && (
                  <a href={selectedEvent.ticket_url} target="_blank" rel="noopener noreferrer" className="btn-action w-full !px-3 !py-3">
                    <Ticket className="w-5 h-5" />立即购票<ExternalLink className="w-4 h-4" />
                  </a>
                )}
                <button type="button" onClick={handleRandomNext} className="btn-secondary w-full !px-3 !py-3">
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
            className="fixed inset-0 bg-ink/70 sm:backdrop-blur-sm flex items-center justify-center p-4 z-50"
            onClick={() => { setSelectedVenue(null); setNavMenuOpen(false); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.88, y: 36 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 24 }}
              transition={{ type: 'spring', damping: 20, stiffness: 390, mass: 0.9 }}
              className="card-flat shadow-block-lg max-w-lg w-full max-h-modal overflow-y-auto relative"
              onClick={e => e.stopPropagation()}
            >
              {/* sticky 关闭栏 */}
              <div className="sticky top-0 z-20 flex justify-end p-2 bg-gradient-to-b from-white via-white/90 to-transparent dark:from-night-100 dark:via-night-100/90 pointer-events-none">
                <button onClick={() => setSelectedVenue(null)}
                  className="pointer-events-auto w-10 h-10 rounded-xl bg-white dark:bg-night-100 border-3 border-ink dark:border-night-400 shadow-block-sm flex items-center justify-center hover:-translate-y-0.5 hover:shadow-block transition-all duration-200 text-ink dark:text-primary-100"
                  aria-label="关闭">
                  <X className="w-5 h-5" strokeWidth={2.5} />
                </button>
              </div>

              {/* 灏侀潰鍖?*/}
              <div className="relative -mt-14">
                <div className="aspect-[16/10] overflow-hidden rounded-t-2xl border-b-3 border-ink dark:border-night-400 bg-pop-purple/20 flex items-center justify-center">
                  {selectedVenue.cover_url
                    ? <img src={getImageUrl(selectedVenue.cover_url, 'medium')} alt={selectedVenue.name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
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
                            <p className="text-sm font-sans font-semibold text-ink dark:text-primary-100 truncate">{s.game_name}</p>
                            <p className="text-xs text-ink-muted dark:text-primary-100/60">{formatDate(s.start_time)}</p>
                          </div>
                          {s.status === 'full'
                            ? <span className="text-xs px-2 py-0.5 rounded-md bg-pop-rose/15 text-pop-rose border border-pop-rose flex-shrink-0">已满</span>
                            : <span className="text-xs px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-300 flex-shrink-0 flex items-center gap-1">
                                <Users className="w-3 h-3" />余{remaining}人
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
            className="fixed inset-0 bg-ink/70 sm:backdrop-blur-sm flex items-center justify-center p-4 z-50"
            onClick={() => { setSelectedSession(null); setNavMenuOpen(false); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.88, y: 36 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 24 }}
              transition={{ type: 'spring', damping: 20, stiffness: 390, mass: 0.9 }}
              className="card-flat shadow-block-lg max-w-lg w-full max-h-modal overflow-y-auto relative"
              onClick={e => e.stopPropagation()}
            >
              {/* sticky 关闭栏 */}
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
                        <Users className="w-3.5 h-3.5" />余{selectedSession.total_seats - selectedSession.booked_seats}人
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

      {/* 全屏海报预览 */}
      <AnimatePresence>
        {fullPosterUrl && (
          <motion.div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-ink/90 sm:backdrop-blur-md p-4 cursor-pointer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setFullPosterUrl(null)}
          >
            <button
              type="button"
              onClick={() => setFullPosterUrl(null)}
              className="absolute top-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-xl border-2 border-white/30 bg-white/15 text-white backdrop-blur-sm transition-colors hover:bg-white/25 focus:outline-none focus:ring-4 focus:ring-action/40"
              aria-label="关闭海报预览"
            >
              <X className="h-5 w-5" strokeWidth={2.5} />
            </button>
            <motion.img
              src={fullPosterUrl}
              alt="完整海报"
              className="max-h-[90vh] max-w-[90vw] rounded-2xl border-3 border-white/20 shadow-2xl object-contain"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              onClick={e => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <LocationConsentModal
        open={showLocationConsent}
        onAllow={handleLocationAllow}
        onSkip={handleLocationSkip}
      />
      <ScrollToTop />
    </div>
  );
};

export default Home;










