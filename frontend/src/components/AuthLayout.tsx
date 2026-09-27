import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, ArrowLeft } from 'lucide-react';
import { settingsService } from '../services/settingsService';
import { getImageUrl } from '../utils/helpers';
import { useTheme } from '../contexts/ThemeContext';
import FloatingDecorations from './FloatingDecorations';
import Footer from './Footer';

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  bottom?: React.ReactNode;
}

/**
 * 认证页公共布局：左侧装饰 + 右侧表单卡片
 */
const AuthLayout: React.FC<AuthLayoutProps> = ({ title, subtitle, children, bottom }) => {
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    settingsService.getAuthBg().then(res => {
      if (res.url) setBgUrl(getImageUrl(res.url));
    }).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen relative flex flex-col bg-primary-50 dark:bg-night-200">
      {/* 背景图（如果管理员上传） */}
      {bgUrl && (
        <>
          <div
            className="fixed inset-0 bg-cover bg-center bg-no-repeat -z-10"
            style={{ backgroundImage: `url(${bgUrl})` }}
          />
          <div className="fixed inset-0 bg-primary-50/80 dark:bg-night-200/85 sm:backdrop-blur-sm -z-10" />
        </>
      )}

      {/* 几何装饰 */}
      {!bgUrl && <FloatingDecorations />}

      {/* 顶栏：返回首页 + 主题切换 */}
      <div className="relative z-20 px-4 py-4 flex items-center justify-between">
        <Link to="/" className="btn-icon" aria-label="返回首页">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <button onClick={toggleTheme} className="btn-icon" aria-label="切换主题">
          <span className="text-lg">{theme === 'dark' ? '☀' : '☾'}</span>
        </button>
      </div>

      {/* 内容 */}
      <div className="relative z-10 flex-1 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 28, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 430, damping: 26, mass: 0.82 }}
          className="w-full max-w-md card-flat shadow-block-lg p-7 sm:p-9"
        >
          {/* Logo */}
          <div className="text-center mb-7">
            <Link to="/" className="inline-block mb-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-action border-3 border-ink dark:border-night-400 shadow-block-sm transition-transform duration-300 hover:-translate-y-1 hover:scale-105 active:scale-95">
                <Sparkles className="w-8 h-8 text-white" strokeWidth={2.5} />
              </div>
            </Link>
            <h1 className="font-display text-3xl text-ink dark:text-primary-100 tracking-wide">
              AniMap
            </h1>
            {subtitle && (
              <p className="mt-2 text-sm text-ink-muted dark:text-primary-100/60">{subtitle}</p>
            )}
            <div className="mt-3 inline-block px-4 py-1 bg-pop-yellow border-2 border-ink dark:border-night-400 rounded-full">
              <span className="font-display text-sm text-ink">{title}</span>
            </div>
          </div>

          {children}

          {bottom && (
            <div className="mt-6 pt-5 border-t-2 border-dashed border-ink/20 dark:border-night-400 text-center text-sm">
              {bottom}
            </div>
          )}
        </motion.div>
      </div>

      <div className="relative z-10">
        <Footer />
      </div>
    </div>
  );
};

export default AuthLayout;
