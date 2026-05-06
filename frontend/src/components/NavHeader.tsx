import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Menu, X, ArrowLeft, Sparkles, LogOut,
  Home, Calendar, PlusCircle, ClipboardCheck, Settings, Sun, Moon, Heart,
} from 'lucide-react';
import { getStoredUser, isAuthenticated } from '../utils/helpers';
import { authService } from '../services/authService';
import { useTheme } from '../contexts/ThemeContext';

interface NavHeaderProps {
  title?: string;
  backTo?: string;
  transparent?: boolean;
}

const NavHeader: React.FC<NavHeaderProps> = ({ title, backTo, transparent = false }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const user = getStoredUser();
  const loggedIn = isAuthenticated();
  const { theme, toggleTheme } = useTheme();

  const handleLogout = () => {
    authService.logout();
    navigate('/login');
  };

  const isActive = (path: string) => location.pathname === path;

  const navLinks = [
    { to: '/',                    label: '首页',      icon: Home,           show: true },
    { to: '/merchant',            label: '活动中心',  icon: Calendar,       show: loggedIn },
    { to: '/merchant/create',     label: '发布活动',  icon: PlusCircle,     show: loggedIn },
    { to: '/favorites',           label: '我的收藏',  icon: Heart,          show: loggedIn },
    { to: '/admin/reviews',       label: '审核后台',  icon: ClipboardCheck, show: user?.role === 'admin' },
    { to: '/admin/settings',      label: '站点设置',  icon: Settings,       show: user?.role === 'admin' },
  ].filter(l => l.show);

  return (
    <>
      <header className={transparent ? 'absolute inset-x-0 top-0 z-30 px-4 py-3' : 'header-block px-4 py-3'}>
        <div className="container mx-auto flex items-center gap-3">
          {/* 左：返回 + Logo */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {backTo && (
              <button onClick={() => navigate(backTo)} className="btn-icon" aria-label="返回">
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <Link to="/" className="flex items-center gap-2.5 group">
              <div className="w-10 h-10 rounded-xl bg-action border-3 border-ink dark:border-night-400 flex items-center justify-center shadow-block-sm group-hover:-translate-y-0.5 group-hover:shadow-block transition-all duration-200">
                <Sparkles className="w-5 h-5 text-white" strokeWidth={2.5} />
              </div>
              <span className="font-display text-xl tracking-wide text-ink dark:text-primary-100">
                {title || 'AniMap'}
              </span>
            </Link>
          </div>

          {/* 中间撑开 */}
          <div className="flex-1" />

          {/* 右：导航链接 + 主题 + 用户 + 汉堡（全部右对齐紧贴在一起） */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* 桌面端导航链接 */}
            <nav className="hidden lg:flex items-center gap-1">
              {navLinks.map(link => {
                const Icon = link.icon;
                const active = isActive(link.to);
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    className={
                      active
                        ? 'flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-action text-white font-medium text-sm border-2 border-ink dark:border-night-400 transition-all duration-200'
                        : 'flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-ink dark:text-primary-100 hover:bg-primary-100 dark:hover:bg-night-50 font-medium text-sm transition-all duration-200'
                    }
                  >
                    <Icon className="w-4 h-4" />
                    {link.label}
                  </Link>
                );
              })}
            </nav>

            {/* 桌面端：分隔 + 用户/登录 */}
            <div className="hidden lg:flex items-center gap-2 ml-1 pl-2 border-l-2 border-ink/15 dark:border-night-400">
              {loggedIn ? (
                <>
                  <span className="text-sm text-ink-muted dark:text-primary-100/60 px-1">
                    {user?.username}
                  </span>
                  <button onClick={handleLogout} className="btn-secondary !py-2 !px-4 !text-sm">
                    <LogOut className="w-4 h-4" />
                    退出
                  </button>
                </>
              ) : (
                <Link to="/login" className="btn-action !py-2 !px-5 !text-sm">
                  登录
                </Link>
              )}
            </div>

            {/* 主题切换 */}
            <button onClick={toggleTheme} className="btn-icon" aria-label="切换主题">
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            {/* 移动端汉堡 */}
            <button
              className="lg:hidden btn-icon"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="菜单"
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* 移动端菜单 */}
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-sm lg:hidden"
              onClick={() => setMenuOpen(false)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 280 }}
              className="fixed top-0 right-0 bottom-0 z-50 w-80 bg-white dark:bg-night-100 border-l-3 border-ink dark:border-night-400 lg:hidden flex flex-col"
            >
              {/* 顶部 */}
              <div className="flex items-center justify-between p-5 border-b-3 border-ink dark:border-night-400 bg-action">
                <div>
                  <p className="font-display text-white text-lg">AniMap</p>
                  {loggedIn && <p className="text-white/80 text-xs mt-0.5">{user?.username}</p>}
                </div>
                <button onClick={() => setMenuOpen(false)} className="btn-icon" aria-label="关闭">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* 菜单项 */}
              <nav className="flex-1 overflow-y-auto p-4">
                <div className="flex flex-col gap-2">
                  {navLinks.map((link, i) => {
                    const Icon = link.icon;
                    const active = isActive(link.to);
                    return (
                      <motion.div
                        key={link.to}
                        initial={{ opacity: 0, x: 24 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04 }}
                      >
                        <Link
                          to={link.to}
                          onClick={() => setMenuOpen(false)}
                          className={active ? 'menu-item menu-item-active' : 'menu-item'}
                        >
                          <Icon className="w-5 h-5" />
                          <span>{link.label}</span>
                        </Link>
                      </motion.div>
                    );
                  })}
                </div>
              </nav>

              {/* 底部 */}
              <div className="p-4 border-t-3 border-ink dark:border-night-400">
                {loggedIn ? (
                  <button
                    onClick={() => { setMenuOpen(false); handleLogout(); }}
                    className="btn-secondary w-full"
                  >
                    <LogOut className="w-4 h-4" />
                    退出登录
                  </button>
                ) : (
                  <Link to="/login" onClick={() => setMenuOpen(false)} className="btn-action w-full">
                    登录 / 注册
                  </Link>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default NavHeader;
