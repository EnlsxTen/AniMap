import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Home, Calendar, Compass } from 'lucide-react';
import FloatingDecorations from '../components/FloatingDecorations';

const NotFound: React.FC = () => {
  return (
    <div className="min-h-screen bg-primary-50 dark:bg-night-200 relative overflow-hidden flex items-center justify-center p-4">
      <FloatingDecorations />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 text-center max-w-lg w-full"
      >
        <div className="card-block p-8 sm:p-12">
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.15, type: 'spring', stiffness: 220 }}
            className="inline-flex items-center justify-center w-24 h-24 rounded-2xl bg-action border-3 border-ink dark:border-night-400 shadow-block-lg mb-6"
          >
            <Compass className="w-12 h-12 text-white" strokeWidth={2.5} />
          </motion.div>

          <h1 className="font-display text-7xl sm:text-8xl text-gradient mb-3 tracking-wider">404</h1>
          <p className="font-display text-2xl text-ink dark:text-primary-100 mb-2">页面走丢了</p>
          <p className="text-sm text-ink-muted dark:text-primary-100/60 mb-8">
            您访问的页面不存在或已被移除
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/" className="btn-action">
              <Home className="w-5 h-5" />
              返回首页
            </Link>
            <Link to="/merchant" className="btn-secondary">
              <Calendar className="w-5 h-5" />
              活动中心
            </Link>
          </div>

          <p className="text-xs text-ink-muted dark:text-primary-100/60 mt-8">
            如果您认为这是一个错误，请联系网站管理员
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default NotFound;
