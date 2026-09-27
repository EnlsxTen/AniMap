import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft, Calendar, ClipboardCheck, Heart, Home, Info, LogOut,
  Menu, MessageCircle, Moon, Settings, Sparkles, Sun, UserRound, Users, X, Zap,
} from 'lucide-react';
import { authService } from '../services/authService';
import { useTheme } from '../contexts/ThemeContext';
import { usePerfMode } from '../contexts/PerfModeContext';
import { getImageUrl, getStoredUser, isAuthenticated } from '../utils/helpers';
import AboutProjectModal from './AboutProjectModal';
import AnimatedBrandText from './AnimatedBrandText';

interface NavHeaderProps {
  title?: string;
  backTo?: string;
  transparent?: boolean;
}

const QQ_GROUP_URL = 'https://qun.qq.com/universal-share/share?ac=1&authKey=aIr7EAq%2FxjhMhDrV8SS9kayXPPzhFsIOVYLWyw8PRI5EUqA0dP9JT3ZClyAUQiG0&busi_data=eyJncm91cENvZGUiOiIxMDkwMzMzNTY1IiwidG9rZW4iOiJLTzNJelBORDh6MHFwcjBZcjdLZU8weFoxTk56YWNCWHR2Q05WeHJJYnNnSE5mZTFHM0kxM3dONHgwcFl1bjlUIiwidWluIjoiMzM4NjU3OTg1NyJ9&data=LyjHMWVIm2xPXeWKaSM67LWFEtHK4Ht-m0lNR0hn4MRww_8-aDYbvHAOwBFPWiVDxpCD1chDgBSklcU58Pk16w&svctype=4&tempid=h5_group_info';

const QQIcon: React.FC<{ className?: string }> = ({ className = 'h-4 w-4' }) => (
  <img src="/icons/qq.svg" alt="" aria-hidden="true" className={className} />
);

const NavHeader: React.FC<NavHeaderProps> = ({ title, backTo, transparent = false }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuSwipeClosing, setMenuSwipeClosing] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [storedUser, setStoredUser] = useState(() => getStoredUser());
  const menuPanelRef = useRef<HTMLDivElement | null>(null);
  const menuContactRef = useRef<HTMLAnchorElement | null>(null);
  const menuHeaderMetaRef = useRef<HTMLDivElement | null>(null);
  const menuDragXRef = useRef(0);
  const menuDragRafRef = useRef<number | null>(null);
  const menuContactRestoreTimerRef = useRef<number | null>(null);
  const menuTouchRef = useRef<{ startX: number; startY: number; startedAt: number; locked: boolean } | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const user = storedUser;
  const loggedIn = isAuthenticated();
  const { theme, toggleTheme } = useTheme();
  const { perfMode, togglePerfMode } = usePerfMode();

  useEffect(() => {
    const syncUser = () => setStoredUser(getStoredUser());
    window.addEventListener('storage', syncUser);
    window.addEventListener('animap:user-updated', syncUser);
    return () => {
      window.removeEventListener('storage', syncUser);
      window.removeEventListener('animap:user-updated', syncUser);
    };
  }, []);

  const handleLogout = () => {
    authService.logout();
    navigate('/login');
  };

  const isActive = (path: string) => location.pathname === path;

  const closeMenu = () => {
    setMenuSwipeClosing(false);
    menuDragXRef.current = 0;
    menuTouchRef.current = null;
    if (menuContactRestoreTimerRef.current !== null) window.clearTimeout(menuContactRestoreTimerRef.current);
    menuContactRestoreTimerRef.current = null;
    if (menuDragRafRef.current !== null) cancelAnimationFrame(menuDragRafRef.current);
    menuDragRafRef.current = null;
    if (menuPanelRef.current) {
      menuPanelRef.current.style.transition = '';
      menuPanelRef.current.style.transform = '';
      menuPanelRef.current.style.opacity = '';
      menuPanelRef.current.style.visibility = '';
    }
    if (menuContactRef.current) menuContactRef.current.style.visibility = '';
    if (menuHeaderMetaRef.current) menuHeaderMetaRef.current.style.visibility = '';
    setMenuOpen(false);
  };

  const setMenuHeaderMetaVisible = (visible: boolean) => {
    const visibility = visible ? '' : 'hidden';
    if (menuContactRef.current) menuContactRef.current.style.visibility = visibility;
    if (menuHeaderMetaRef.current) menuHeaderMetaRef.current.style.visibility = visibility;
  };

  const setMenuPanelDrag = (x: number) => {
    menuDragXRef.current = x;
    if (menuDragRafRef.current !== null) return;
    menuDragRafRef.current = requestAnimationFrame(() => {
      menuDragRafRef.current = null;
      if (menuPanelRef.current) {
        menuPanelRef.current.style.transform = `translateX(${menuDragXRef.current}px)`;
      }
    });
  };

  const finishMenuSwipeClose = () => {
    const panel = menuPanelRef.current;
    menuTouchRef.current = null;
    if (!panel) {
      setMenuOpen(false);
      return;
    }
    if (menuDragRafRef.current !== null) cancelAnimationFrame(menuDragRafRef.current);
    menuDragRafRef.current = null;
    setMenuHeaderMetaVisible(false);
    panel.style.transition = 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease-out';
    panel.style.transform = 'translateX(calc(100% + 2rem))';
    panel.style.opacity = '0.96';
    window.setTimeout(() => {
      panel.style.visibility = 'hidden';
      menuDragXRef.current = 0;
      setMenuSwipeClosing(true);
      setMenuOpen(false);
    }, 220);
  };

  const handleMenuTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (menuContactRestoreTimerRef.current !== null) window.clearTimeout(menuContactRestoreTimerRef.current);
    menuContactRestoreTimerRef.current = null;
    setMenuHeaderMetaVisible(true);
    const touch = event.touches[0];
    menuTouchRef.current = { startX: touch.clientX, startY: touch.clientY, startedAt: performance.now(), locked: false };
    setMenuPanelDrag(0);
  };

  const handleMenuTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    const menuTouch = menuTouchRef.current;
    if (!menuTouch) return;
    const touch = event.touches[0];
    const deltaX = touch.clientX - menuTouch.startX;
    const deltaY = touch.clientY - menuTouch.startY;
    const horizontal = Math.abs(deltaX) > Math.abs(deltaY) + 8;
    if (!menuTouch.locked && !horizontal) return;
    if (!menuTouch.locked) {
      menuTouchRef.current = { ...menuTouch, locked: true };
      setMenuHeaderMetaVisible(false);
    }
    if (deltaX <= 0) {
      setMenuPanelDrag(0);
      return;
    }
    event.preventDefault();
    if (deltaX > 8) setMenuHeaderMetaVisible(false);
    setMenuPanelDrag(Math.min(deltaX, 150));
  };

  const handleMenuTouchEnd = () => {
    const menuTouch = menuTouchRef.current;
    if (!menuTouch) return;
    const elapsed = Math.max(1, performance.now() - menuTouch.startedAt);
    const dragX = menuDragXRef.current;
    const velocity = dragX / elapsed;
    if (dragX > 88 || velocity > 0.55) {
      finishMenuSwipeClose();
      return;
    }
    if (menuPanelRef.current) {
      menuPanelRef.current.style.transition = 'transform 160ms cubic-bezier(0.22, 1, 0.36, 1)';
      menuPanelRef.current.style.transform = 'translateX(0px)';
      window.setTimeout(() => {
        if (menuPanelRef.current) {
          menuPanelRef.current.style.transition = '';
          menuPanelRef.current.style.transform = '';
        }
      }, 160);
    }
    menuContactRestoreTimerRef.current = window.setTimeout(() => {
      setMenuHeaderMetaVisible(true);
      menuContactRestoreTimerRef.current = null;
    }, 220);
    menuDragXRef.current = 0;
    menuTouchRef.current = null;
  };

  const navLinks = [
    { to: '/', label: '首页', icon: Home, show: true },
    { to: '/merchant', label: '活动中心', icon: Calendar, show: loggedIn },
    { to: '/favorites', label: '个人中心', icon: Heart, show: loggedIn },
    { to: '/profile', label: '账号管理', icon: UserRound, show: loggedIn },
    { to: '/admin/reviews', label: '审核后台', icon: ClipboardCheck, show: user?.role === 'admin' },
    { to: '/admin/settings', label: '站点设置', icon: Settings, show: user?.role === 'admin' },
    { to: '/my-comments', label: '我的弹幕', icon: MessageCircle, show: loggedIn },
    { to: '/admin/users', label: '用户管理', icon: Users, show: user?.role === 'admin' },
  ].filter(link => link.show);

  return (
    <>
      <header className={transparent ? 'absolute inset-x-0 top-0 z-30 px-4 py-3' : 'header-block px-4 py-3'}>
        <div className="flex w-full min-w-0 items-center gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {backTo && (
              <button onClick={() => navigate(backTo)} className="btn-icon" aria-label="返回">
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            <Link to="/" className="group flex min-w-0 items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border-3 border-ink bg-action shadow-block-sm transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-block dark:border-night-400">
                {title ? <Home className="h-5 w-5 text-white" strokeWidth={2.5} /> : <Sparkles className="h-5 w-5 text-white" strokeWidth={2.5} />}
              </div>
              {title ? (
                <span className="font-puhuiti-full truncate text-xl font-bold tracking-wide text-ink dark:text-primary-100">
                  {title}
                </span>
              ) : (
                <AnimatedBrandText variant="breath" className="font-display text-xl tracking-wide text-ink dark:text-primary-100" />
              )}
            </Link>
          </div>

          <div className="min-w-2 flex-1" />

          <div className="flex flex-shrink-0 items-center gap-2">
            <nav className="hidden items-center gap-1 2xl:flex">
              {navLinks.map(link => {
                const Icon = link.icon;
                const active = isActive(link.to);
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    className={active
                      ? 'flex items-center gap-1.5 rounded-lg border-2 border-ink bg-action px-3.5 py-2 text-sm font-medium text-white transition-all duration-200 dark:border-night-400'
                      : 'flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium text-ink transition-all duration-200 hover:bg-primary-100 dark:text-primary-100 dark:hover:bg-night-50'}
                  >
                    <Icon className="h-4 w-4" />
                    {link.label}
                  </Link>
                );
              })}
            </nav>

            <div className="ml-1 hidden items-center gap-2 border-l-2 border-ink/15 pl-2 dark:border-night-400 2xl:flex">
              <button
                type="button"
                onClick={() => setAboutOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border-2 border-ink bg-white px-3 py-2 text-sm font-bold text-ink shadow-block-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary-100 dark:border-night-400 dark:bg-night-50 dark:text-primary-100"
              >
                <Info className="h-4 w-4" />
                关于
              </button>
              {loggedIn ? (
                <>
                  <Link
                    to="/profile"
                    className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-sm text-ink-muted transition-colors hover:bg-primary-100 hover:text-ink dark:text-primary-100/60 dark:hover:bg-night-50 dark:hover:text-primary-100"
                  >
                    <span className="h-8 w-8 overflow-hidden rounded-lg border-2 border-ink/20 bg-primary-100 dark:border-night-400 dark:bg-night-200">
                      {user?.avatar_url ? (
                        <img src={getImageUrl(user.avatar_url, 'thumb')} alt={user?.username || '用户头像'} className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center">
                          <UserRound className="h-4 w-4" />
                        </span>
                      )}
                    </span>
                    <span className="max-w-[88px] truncate">{user?.username}</span>
                  </Link>
                  <a
                    href={QQ_GROUP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border-2 border-ink bg-primary-100 px-3 py-2 text-sm font-bold text-ink shadow-block-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-pop-cyan/20 dark:border-night-400 dark:bg-night-50 dark:text-primary-100"
                  >
                    <QQIcon className="h-4 w-4" />
                    联系
                  </a>
                  <button onClick={handleLogout} className="btn-secondary !px-4 !py-2 !text-sm">
                    <LogOut className="h-4 w-4" />
                    退出
                  </button>
                </>
              ) : (
                <Link to="/login" className="btn-action !px-5 !py-2 !text-sm">
                  登录
                </Link>
              )}
            </div>

            <button onClick={toggleTheme} className="btn-icon" aria-label="切换主题">
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>

            <button
              className="btn-icon 2xl:hidden"
              onClick={() => {
                setMenuSwipeClosing(false);
                setMenuOpen(!menuOpen);
              }}
              aria-label="菜单"
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 touch-none bg-ink/40 sm:backdrop-blur-sm 2xl:hidden"
              onClick={closeMenu}
              onTouchMove={(event) => event.preventDefault()}
            />
            <motion.div
              ref={menuPanelRef}
              initial={{ x: '104%', scale: 0.98 }}
              animate={menuSwipeClosing ? false : { x: 0, scale: 1 }}
              exit={menuSwipeClosing ? undefined : { x: '104%', scale: 0.98 }}
              transition={{ type: 'spring', damping: 22, stiffness: 360, mass: 0.9 }}
              onTouchStart={handleMenuTouchStart}
              onTouchMove={handleMenuTouchMove}
              onTouchEnd={handleMenuTouchEnd}
              onTouchCancel={handleMenuTouchEnd}
              className="fixed bottom-4 right-4 top-4 z-50 flex w-80 max-w-[86vw] touch-pan-y flex-col overflow-hidden rounded-3xl border-3 border-ink bg-white shadow-block-lg will-change-transform contain-layout contain-paint dark:border-night-400 dark:bg-night-100 2xl:hidden"
            >
              <div className="flex items-center justify-between rounded-t-[1.35rem] border-b-3 border-ink bg-action p-5 dark:border-night-400">
                <div className="min-w-0">
                  <p className="font-display text-lg text-white">AniMap</p>
                  <div ref={menuHeaderMetaRef} className="mt-1 flex min-w-0 items-center gap-2">
                    {loggedIn && <p className="min-w-0 truncate text-xs text-white/80">{user?.username}</p>}
                    <a
                      ref={menuContactRef}
                      href={QQ_GROUP_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={closeMenu}
                      className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-white/70 bg-white/15 px-2.5 py-1 text-xs font-bold text-white transition-all duration-200 hover:bg-white/25"
                    >
                      <QQIcon className="h-3.5 w-3.5" />
                      联系我们
                    </a>
                  </div>
                </div>
                <button onClick={closeMenu} className="btn-icon" aria-label="关闭">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <nav className="flex-1 overflow-y-auto p-4">
                <div className="flex flex-col gap-2">
                  {navLinks.map((link, index) => {
                    const Icon = link.icon;
                    const active = isActive(link.to);
                    return (
                      <motion.div
                        key={link.to}
                        initial={{ opacity: 0, x: 28, scale: 0.96 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        transition={{ type: 'spring', damping: 20, stiffness: 420, delay: index * 0.035 }}
                      >
                        <Link to={link.to} onClick={closeMenu} className={active ? 'menu-item menu-item-active' : 'menu-item'}>
                          <Icon className="h-5 w-5" />
                          <span>{link.label}</span>
                        </Link>
                      </motion.div>
                    );
                  })}
                  <motion.div
                    initial={{ opacity: 0, x: 28, scale: 0.96 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    transition={{ type: 'spring', damping: 20, stiffness: 420, delay: navLinks.length * 0.035 }}
                  >
                    <button type="button" onClick={() => { closeMenu(); setAboutOpen(true); }} className="menu-item w-full">
                      <Info className="h-5 w-5" />
                      <span>关于本项目</span>
                    </button>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, x: 28, scale: 0.96 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    transition={{ type: 'spring', damping: 20, stiffness: 420, delay: (navLinks.length + 1) * 0.035 }}
                  >
                    <button type="button" onClick={togglePerfMode} className="menu-item w-full" aria-pressed={perfMode}>
                      <Zap className="h-5 w-5" />
                      <span className="flex-1 text-left">性能优化</span>
                      <span className={`relative inline-flex h-6 w-11 items-center rounded-full border-2 border-ink transition-colors ${perfMode ? 'bg-action' : 'bg-ink/15'}`}>
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${perfMode ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </span>
                    </button>
                  </motion.div>
                </div>
              </nav>

              <div className="border-t-3 border-ink p-4 dark:border-night-400">
                {loggedIn ? (
                  <button onClick={() => { closeMenu(); handleLogout(); }} className="btn-secondary w-full">
                    <LogOut className="h-4 w-4" />
                    退出登录
                  </button>
                ) : (
                  <Link to="/login" onClick={closeMenu} className="btn-action w-full">
                    登录 / 注册
                  </Link>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AboutProjectModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </>
  );
};

export default NavHeader;
