import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Sparkles } from 'lucide-react';

interface AboutProjectModalProps {
  open: boolean;
  onClose: () => void;
}

const creditItems = [
  { name: 'Zaxpris', description: 'API供应 技术支持', href: 'https://b23.tv/8lBBneu' },
  { name: '红叶', description: '项目思路指导', href: 'https://b23.tv/Op3AbAR' },
];

const supportIcons = [
  { src: '/icons/about/chatgpt.svg', alt: 'ChatGPT', href: 'https://chatgpt.com/' },
  { src: '/icons/about/claude.svg', alt: 'Claude', href: 'https://claude.ai/' },
  { src: '/icons/about/codex.svg', alt: 'CodeX', href: 'https://openai.com/codex/' },
  { src: '/icons/about/github.svg', alt: 'GitHub', href: 'https://github.com/' },
];

const AboutProjectModal: React.FC<AboutProjectModalProps> = ({ open, onClose }) => {
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/55 p-4 sm:backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby="about-project-title"
            className="w-full max-w-md overflow-hidden rounded-2xl border-3 border-ink bg-white shadow-block-lg dark:border-night-400 dark:bg-night-100 dark:shadow-block-dark"
            initial={{ opacity: 0, y: 26, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 430, damping: 28, mass: 0.86 }}
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b-3 border-ink bg-action px-5 py-4 dark:border-night-400">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border-2 border-white/80 bg-white/15 text-white shadow-block-sm">
                  <Sparkles className="h-5 w-5" strokeWidth={2.5} />
                </span>
                <div>
                  <p className="text-xs font-bold text-white/75">关于本项目</p>
                  <h2 id="about-project-title" className="font-display text-xl text-white">AniMap</h2>
                </div>
              </div>
              <button type="button" onClick={onClose} className="btn-icon !border-white/80 !bg-white/15 !text-white" aria-label="关闭关于本项目">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5 p-5">
              <section>
                <p className="mb-3 text-sm font-bold text-ink-muted dark:text-primary-100/65">特别鸣谢</p>
                <div className="space-y-3">
                  {creditItems.map(item => (
                    <a
                      key={item.name}
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-xl border-2 border-ink/20 bg-primary-50/70 px-4 py-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-ink hover:bg-primary-100/80 hover:shadow-block-sm focus:outline-none focus:ring-4 focus:ring-action/30 dark:border-night-400 dark:bg-night-200/70 dark:hover:bg-night-50"
                    >
                      <div className="space-y-1">
                        <span className="text-gradient font-display text-xl font-bold leading-none">{item.name}</span>
                        <p className="credit-description-text text-sm leading-relaxed text-ink dark:text-primary-100">{item.description}</p>
                      </div>
                    </a>
                  ))}
                </div>
              </section>

              <section>
                <p className="mb-3 text-sm font-bold text-ink-muted dark:text-primary-100/65">支持与工具</p>
                <div className="grid grid-cols-4 gap-3">
                  {supportIcons.map(icon => (
                    <a
                      key={icon.alt}
                      href={icon.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-14 items-center justify-center rounded-xl border-2 border-ink/20 bg-white p-2 shadow-block-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-ink hover:bg-primary-50 focus:outline-none focus:ring-4 focus:ring-action/30 dark:border-night-400 dark:bg-night-50 dark:hover:bg-night-200"
                      aria-label={`打开 ${icon.alt} 官网`}
                    >
                      <img src={icon.src} alt={icon.alt} className={icon.alt === 'CodeX' ? 'max-h-10 max-w-[92%] object-contain' : 'max-h-8 max-w-full object-contain'} loading="lazy" />
                    </a>
                  ))}
                </div>
              </section>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AboutProjectModal;
