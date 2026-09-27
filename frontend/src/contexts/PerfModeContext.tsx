import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

interface PerfModeContextValue {
  perfMode: boolean;        // true = 性能优化开启（删减动画）
  togglePerfMode: () => void;
  setPerfMode: (on: boolean) => void;
}

const PerfModeContext = createContext<PerfModeContextValue | undefined>(undefined);

const STORAGE_KEY = 'animap_perf_mode';

const getInitialPerfMode = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
};

export const PerfModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [perfMode, setPerfModeState] = useState<boolean>(getInitialPerfMode);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, perfMode ? 'on' : 'off');
    } catch {}
    // 同时在 <html> 上挂 class，方便 CSS 侧也能感知（如需删减 CSS 动画）
    const root = document.documentElement;
    if (perfMode) root.classList.add('perf-mode');
    else root.classList.remove('perf-mode');
  }, [perfMode]);

  const togglePerfMode = useCallback(() => setPerfModeState(prev => !prev), []);
  const setPerfMode = useCallback((on: boolean) => setPerfModeState(on), []);

  return (
    <PerfModeContext.Provider value={{ perfMode, togglePerfMode, setPerfMode }}>
      {children}
    </PerfModeContext.Provider>
  );
};

export const usePerfMode = (): PerfModeContextValue => {
  const ctx = useContext(PerfModeContext);
  if (!ctx) throw new Error('usePerfMode must be used within PerfModeProvider');
  return ctx;
};
