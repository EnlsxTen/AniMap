import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useState } from 'react';
import { flushSync } from 'react-dom';

type Theme = 'light' | 'dark';
type ThemeMode = Theme | 'auto';

interface ThemeContextValue {
  theme: Theme;
  mode: ThemeMode;
  toggleTheme: (event?: React.MouseEvent<HTMLElement>) => void;
  setTheme: (theme: Theme) => void;
  setMode: (mode: ThemeMode) => void;
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void | Promise<void>) => {
    ready: Promise<void>;
    finished: Promise<void>;
    skipTransition: () => void;
  };
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
const THEME_SPREAD_DURATION = 480;

// 正在进行中的主题视图过渡（settled 后置回 null）。
// 供 AMap 等无法被快照正确定格的异步重绘组件感知"过渡中"，把换肤推迟到动画结束后。
let activeThemeViewTransition: Promise<void> | null = null;
export const getThemeViewTransition = (): Promise<void> | null => activeThemeViewTransition;

const getTimeBasedTheme = (date = new Date()): Theme => {
  const hour = date.getHours();
  return hour >= 18 || hour < 6 ? 'dark' : 'light';
};

const getInitialMode = (): ThemeMode => {
  if (typeof window === 'undefined') return 'light';
  try {
    const mode = localStorage.getItem('themeMode');
    if (mode === 'auto' || mode === 'light' || mode === 'dark') return mode;

    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') return saved;

    return 'auto';
  } catch {
    return 'light';
  }
};

const resolveTheme = (mode: ThemeMode): Theme => (mode === 'auto' ? getTimeBasedTheme() : mode);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setModeState] = useState<ThemeMode>(getInitialMode);
  const [theme, setThemeState] = useState<Theme>(() => resolveTheme(getInitialMode()));

  useEffect(() => {
    const updateResolvedTheme = () => setThemeState(resolveTheme(mode));
    updateResolvedTheme();

    if (mode !== 'auto') return;

    const interval = window.setInterval(updateResolvedTheme, 60 * 1000);
    return () => window.clearInterval(interval);
  }, [mode]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    try {
      localStorage.setItem('themeMode', mode);
      localStorage.setItem('theme', theme);
    } catch {}

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#11141E' : '#059669');
  }, [mode, theme]);

  const toggleTheme = useCallback((event?: React.MouseEvent<HTMLElement>) => {
    const currentTheme = mode === 'auto' ? getTimeBasedTheme() : mode;
    const nextTheme: Theme = currentTheme === 'dark' ? 'light' : 'dark';
    const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

    if (prefersReducedMotion || typeof document === 'undefined') {
      setModeState(nextTheme);
      return;
    }

    const spreadOrigin = event
      ? (() => {
          const rect = event.currentTarget.getBoundingClientRect();
          const hasPointerPosition = event.detail > 0;
          const x = hasPointerPosition ? event.clientX : rect.left + rect.width / 2;
          const y = hasPointerPosition ? event.clientY : rect.top + rect.height / 2;

          return {
            x,
            y,
            radius: Math.hypot(
              Math.max(x, window.innerWidth - x),
              Math.max(y, window.innerHeight - y),
            ) + 28,
          };
        })()
      : null;
    const applyTheme = () => flushSync(() => setModeState(nextTheme));
    const transitionDocument = document as ViewTransitionDocument;

    if (!spreadOrigin || !transitionDocument.startViewTransition) {
      applyTheme();
      return;
    }

    // 过渡期间冻结全站 CSS transition：让"新快照"直接定格最终色，
    // 否则快照会拍到刚开始的 0.2~0.3s 颜色过渡，扩散揭底时颜色跳变（手机上明显闪烁）
    document.documentElement.classList.add('theme-view-transitioning');
    try {
      const transition = transitionDocument.startViewTransition(applyTheme);
      const removeFreeze = () => {
        document.documentElement.classList.remove('theme-view-transitioning');
        if (activeThemeViewTransition === finished) activeThemeViewTransition = null;
      };
      const finished = transition.finished.then(
        () => {},
        () => {},
      );
      activeThemeViewTransition = finished;
      finished.then(removeFreeze);
      // 保底解冻：页面被遮挡/切后台时浏览器会暂停渲染更新，过渡可能长时间停在
      // "等待回调"阶段，冻结类若一直滞留会杀掉全站动画。超时后强制解冻；
      // 此时视觉上等价于无 VT 的普通渐变切换，不会产生闪烁。
      window.setTimeout(removeFreeze, THEME_SPREAD_DURATION + 700);
      void transition.ready
        .then(() => {
          document.documentElement.animate(
            {
              clipPath: [
                `circle(0px at ${spreadOrigin.x}px ${spreadOrigin.y}px)`,
                `circle(${spreadOrigin.radius}px at ${spreadOrigin.x}px ${spreadOrigin.y}px)`,
              ],
            },
            {
              duration: THEME_SPREAD_DURATION,
              easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
              fill: 'both',
              pseudoElement: '::view-transition-new(root)',
            },
          );
        })
        .catch(() => {
          transition.skipTransition();
        });
    } catch {
      // startViewTransition 同步抛错：解冻并退回普通切换
      document.documentElement.classList.remove('theme-view-transitioning');
      applyTheme();
    }
  }, [mode]);

  const setTheme = useCallback((nextTheme: Theme) => setModeState(nextTheme), []);
  const setMode = useCallback((nextMode: ThemeMode) => setModeState(nextMode), []);

  return (
    <ThemeContext.Provider value={{ theme, mode, toggleTheme, setTheme, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};
