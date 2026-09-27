import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp } from 'lucide-react';

const SCROLL_THRESHOLD = 300;

const findScrollContainers = (): HTMLElement[] => {
  const result: HTMLElement[] = [];
  document.querySelectorAll('[class*="overflow-y-auto"], [class*="overflow-y-scroll"], .animap-home-scrollable').forEach(el => {
    if (el instanceof HTMLElement) result.push(el);
  });
  return result;
};

const getMaxScrollY = (): number => {
  if (document.body.getAttribute('data-sidebar-dragging') === 'true') return 0;
  let max = window.scrollY;
  const containers = findScrollContainers();
  for (let i = 0; i < containers.length; i++) {
    const c = containers[i];
    const rect = c.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0 || rect.right < 0 || rect.bottom < 0) continue;
    max = Math.max(max, c.scrollTop);
  }
  return max;
};

// 只在按钮出现时计算一次水平位置，相对于当前滚动容器右侧边缘
const computeButtonRight = (): string => {
  const containers = findScrollContainers();
  for (let i = 0; i < containers.length; i++) {
    const rect = containers[i].getBoundingClientRect();
    if (rect.width > 0 && containers[i].scrollHeight > containers[i].clientHeight + 10) {
      // viewport 右边缘到容器右边缘的距离 + 容器内的间距
      const fromViewportRight = window.innerWidth - rect.right;
      return `${fromViewportRight + 12}px`;
    }
  }
  // fallback: 视口右侧
  return 'max(20px, calc(1.25rem + env(safe-area-inset-right, 0px)))';
};

const ScrollToTop: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const btnRightRef = useRef('20px');

  useEffect(() => { setPortalRoot(document.body); }, []);

  useEffect(() => {
    let ticking = false;

    const check = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const isVisible = getMaxScrollY() > SCROLL_THRESHOLD;
          // 按钮刚出现时，锁定位置（不跟随滚动更新）
          if (isVisible && !visible) {
            btnRightRef.current = computeButtonRight();
          }
          setVisible(isVisible);
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', check, { passive: true });
    document.addEventListener('scroll', check, { passive: true, capture: true });

    // 常规显隐由 scroll 事件驱动；这个低频兜底轮询只用于捕捉"内容变化但没滚动"的场景
    // （如筛选后列表变短）。轮询内部有 querySelectorAll + getBoundingClientRect（强制布局），
    // 频率不能高，避免在地图拖动/列表滚动时抢占主线程。
    const interval = setInterval(check, 1500);

    return () => {
      window.removeEventListener('scroll', check);
      document.removeEventListener('scroll', check, { capture: true });
      clearInterval(interval);
    };
  }, [visible]);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const containers = findScrollContainers();
    for (let i = 0; i < containers.length; i++) {
      containers[i].scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const button = (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          onClick={scrollToTop}
          aria-label="回到顶部"
          className="fixed z-[9999] flex h-11 w-11 items-center justify-center rounded-2xl border-3 border-ink bg-action text-white shadow-block-lg transition-colors duration-200 hover:bg-action/90 focus:outline-none focus:ring-4 focus:ring-action/30 dark:border-night-400 dark:shadow-block-dark"
          style={{
            bottom: 'max(24px, calc(1.5rem + env(safe-area-inset-bottom, 0px)))',
            right: btnRightRef.current,
          }}
          initial={{ opacity: 0, y: 12, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.8 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30, mass: 0.7 }}
        >
          <ArrowUp className="h-5 w-5" strokeWidth={2.5} />
        </motion.button>
      )}
    </AnimatePresence>
  );

  return portalRoot ? createPortal(button, portalRoot) : null;
};

export default ScrollToTop;
