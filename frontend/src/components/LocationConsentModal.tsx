import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MapPin, Navigation, X } from 'lucide-react';

interface LocationConsentModalProps {
  open: boolean;
  onAllow: () => void;
  onSkip: () => void;
}

const LocationConsentModal: React.FC<LocationConsentModalProps> = ({ open, onAllow, onSkip }) => {
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onSkip();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onSkip]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[75] flex items-center justify-center bg-ink/55 p-4 sm:backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onSkip}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby="location-consent-title"
            className="w-full max-w-sm overflow-hidden rounded-2xl border-3 border-ink bg-white shadow-block-lg dark:border-night-400 dark:bg-night-100 dark:shadow-block-dark"
            initial={{ opacity: 0, y: 26, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 430, damping: 28, mass: 0.86 }}
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b-3 border-ink bg-action px-5 py-4 dark:border-night-400">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border-2 border-white/80 bg-white/15 text-white shadow-block-sm">
                  <MapPin className="h-5 w-5" strokeWidth={2.5} />
                </span>
                <div>
                  <p className="text-xs font-bold text-white/75">位置授权</p>
                  <h2 id="location-consent-title" className="font-display text-xl text-white">获取你的位置</h2>
                </div>
              </div>
              <button type="button" onClick={onSkip} className="btn-icon !border-white/80 !bg-white/15 !text-white" aria-label="暂不授权">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-700 dark:bg-primary-500/20 dark:text-primary-300">
                  <Navigation className="h-4 w-4" />
                </span>
                <div className="space-y-2 text-sm text-ink dark:text-primary-100">
                  <p>
                    允许 <strong>AniMap</strong> 获取你的地理位置后，我们可以：
                  </p>
                  <ul className="space-y-1.5 text-ink-muted dark:text-primary-100/65">
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-action" />
                      在地图上定位到你当前所在城市
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-action" />
                      显示附近展会的距离，帮你找到最近的活动
                    </li>
                  </ul>
                  <p className="text-xs text-ink-muted/70 dark:text-primary-100/50">
                    你的位置信息仅用于本地距离计算，不会上传或存储到服务器。
                  </p>
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={onSkip}
                  className="flex-1 rounded-xl border-2 border-ink/30 px-4 py-3 text-sm font-bold text-ink-muted transition-all duration-200 hover:border-ink/50 hover:bg-primary-50 hover:text-ink focus:outline-none focus:ring-4 focus:ring-action/30 dark:border-night-400 dark:text-primary-100/70 dark:hover:bg-night-200 dark:hover:text-primary-100"
                >
                  暂不
                </button>
                <button
                  type="button"
                  onClick={onAllow}
                  autoFocus
                  className="btn-action flex-1 !py-3 !text-sm"
                >
                  允许
                </button>
              </div>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default LocationConsentModal;
