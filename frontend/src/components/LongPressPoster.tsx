import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

interface LongPressPosterProps {
  src: string;
  fullSrc: string;
  alt: string;
  className?: string;
  children?: React.ReactNode;
  threshold?: number;
  onClick?: () => void;
}

// ==========================================================================
// 原图预加载 LRU（模块级，跨所有 LongPressPoster 实例共享）
// iOS Safari 会为加载过的图片保留解码位图缓存（一张 1920px 原图解码后约 10-15MB），
// 列表里几十次按压累积可达数百 MB，直接触发 Safari 内存回收并强制刷新页面。
// 因此：1) 全局最多同时持有 FULL_PRELOAD_LIMIT 张原图；2) 淘汰时显式断开 src
// 让 WebKit 回收位图。预览弹层里正在显示的那张不受影响（由 DOM 元素自身持有）。
// ==========================================================================
const FULL_PRELOAD_LIMIT = 3;
type FullPreloadEntry = { url: string; img: HTMLImageElement };
const fullPreloadLru: FullPreloadEntry[] = [];

const releaseFullPreload = (entry: FullPreloadEntry) => {
  entry.img.onload = null;
  entry.img.onerror = null;
  entry.img.removeAttribute('src');
};

const acquireFullPreload = (url: string): HTMLImageElement => {
  const existingIndex = fullPreloadLru.findIndex(e => e.url === url);
  if (existingIndex >= 0) {
    const [entry] = fullPreloadLru.splice(existingIndex, 1);
    fullPreloadLru.push(entry); // 触碰即移到队尾（最新）
    return entry.img;
  }
  while (fullPreloadLru.length >= FULL_PRELOAD_LIMIT) {
    const evicted = fullPreloadLru.shift();
    if (evicted) releaseFullPreload(evicted);
  }
  const img = new Image();
  img.decoding = 'async';
  fullPreloadLru.push({ url, img });
  return img;
};

const LongPressPoster: React.FC<LongPressPosterProps> = ({
  src, fullSrc, alt, className, children, threshold = 500, onClick,
}) => {
  const HINT_KEY = 'animap_longpress_hint_done';
  const [preview, setPreview] = useState(false);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [hintVisible, setHintVisible] = useState(true);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const imgElRef = useRef<HTMLImageElement | null>(null);
  const retryCountRef = useRef(0);
  // CDN 回源慢时降级：preview.webp 失败自动换 thumb.webp
  const [displaySrc, setDisplaySrc] = useState(src);

  // 统一加载失败处理：preview→thumb 降级；thumb 失败自动重试2次(cache-buster)；超限才显示重试框
  const handleLoadFailure = useCallback((curSrc: string) => {
    if (curSrc.includes('.preview.webp')) {
      setImgLoaded(false);
      setDisplaySrc(curSrc.replace('.preview.webp', '.thumb.webp'));
      return;
    }
    if (retryCountRef.current < 2) {
      retryCountRef.current += 1;
      const b = curSrc.split('&pr=')[0].split('?pr=')[0];
      const sep = b.includes('?') ? '&' : '?';
      setImgLoaded(false);
      setDisplaySrc(`${b}${sep}pr=${Date.now()}`);
      return;
    }
    setImgError(true);
  }, []);

  useEffect(() => { setDisplaySrc(src); setImgLoaded(false); setImgError(false); retryCountRef.current = 0; }, [src]);
  // displaySrc 变化后只做"成功补检"：命中缓存时 onLoad 可能在监听器绑定前已触发，主动补 loaded。
  // 失败一律交给 onError 事件驱动（用 effect 轮询 complete 判失败会读到过时状态、误触发重试，已弃用）。
  useEffect(() => {
    const el = imgElRef.current;
    if (el && el.complete && el.naturalWidth > 0) { setImgLoaded(true); setImgError(false); }
  }, [displaySrc]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 缓存竞态：onLoad/onError 可能在 React 绑定监听器前已触发。ref 回调挂载时主动补检 complete 状态。
  const handleImgRef = useCallback((el: HTMLImageElement | null) => {
    imgElRef.current = el;
    if (el && el.complete && el.naturalWidth > 0) { setImgLoaded(true); setImgError(false); }
  }, []);
  const triggeredRef = useRef(false);
  const movedRef = useRef(false);
  const blockNextClickRef = useRef(false);
  const isTouchRef = useRef(false);

  useEffect(() => { setPortalRoot(document.body); }, []);

  // 按需预加载原图：延迟 FULL_PRELOAD_DELAY_MS 后才触发——普通点击（按压 <130ms 松开）
  // 完全不会下载原图；长按（threshold=500ms）仍有约 370ms 提前量，预览打开体验不变
  const fullPreloadedRef = useRef(false);
  const fullPreloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelFullPreload = useCallback(() => {
    if (fullPreloadTimerRef.current !== null) {
      clearTimeout(fullPreloadTimerRef.current);
      fullPreloadTimerRef.current = null;
      fullPreloadedRef.current = false; // 取消后允许下次按压重新触发
    }
  }, []);
  const ensureFullPreloaded = useCallback(() => {
    if (!fullSrc || fullPreloadedRef.current) return;
    fullPreloadedRef.current = true;
    fullPreloadTimerRef.current = setTimeout(() => {
      fullPreloadTimerRef.current = null;
      let retried = false;
      const start = (url: string) => {
        const img = acquireFullPreload(url);
        img.onerror = () => {
          if (!retried) {
            retried = true;
            const base = url.split('&pr=')[0].split('?pr=')[0];
            const sep = base.includes('?') ? '&' : '?';
            start(`${base}${sep}pr=${Date.now()}`);
          }
        };
        img.src = url;
      };
      start(fullSrc);
    }, 130);
  }, [fullSrc]);
  // src 变化（列表复用同一组件渲染不同活动）时重置预加载标记
  useEffect(() => { fullPreloadedRef.current = false; cancelFullPreload(); }, [fullSrc, cancelFullPreload]);
  // 卸载时取消仍在等待的预加载定时器
  useEffect(() => cancelFullPreload, [cancelFullPreload]);
  useEffect(() => {
    try { if (localStorage.getItem(HINT_KEY)) setHintVisible(false); } catch {}
  }, []);

  const dismissHint = useCallback(() => {
    setHintVisible(false);
    try { localStorage.setItem(HINT_KEY, '1'); } catch {}
  }, []);

  // 预览打开时监听全局 pointerup → 松手即关
  useEffect(() => {
    if (!preview) return;
    const close = () => setPreview(false);
    document.addEventListener('pointerup', close, { once: true });
    document.addEventListener('touchend', close, { once: true });
    return () => {
      document.removeEventListener('pointerup', close);
      document.removeEventListener('touchend', close);
    };
  }, [preview]);

  const clear = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    isTouchRef.current = e.pointerType === 'touch';
    ensureFullPreloaded(); // 按下即开始拉原图，长按 threshold 内通常已就绪
    setTooltipPos(null); // 按下时隐藏提示
    triggeredRef.current = false;
    movedRef.current = false;
    blockNextClickRef.current = false;
    timerRef.current = setTimeout(() => {
      triggeredRef.current = true;
      blockNextClickRef.current = true;
      dismissHint();
      setPreview(true);
      if (navigator.vibrate) navigator.vibrate(15);
    }, threshold);
  }, [threshold, ensureFullPreloaded]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (timerRef.current && Math.abs(e.movementX) + Math.abs(e.movementY) > 10) {
      clear();
      movedRef.current = true;
    }
  }, [clear]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    clear();
    if (triggeredRef.current) {
      e.preventDefault();
      e.stopPropagation();
    } else {
      // 未达长按阈值就松手：取消尚未发出的原图请求（普通点击不再下载原图）
      cancelFullPreload();
    }
  }, [clear, cancelFullPreload]);

  const onPointerLeave = useCallback(() => {
    clear();
    cancelFullPreload();
  }, [clear, cancelFullPreload]);

  // 核心：消费被阻止的 click，在 capture 阶段拦截
  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (blockNextClickRef.current) {
      blockNextClickRef.current = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (triggeredRef.current) {
      e.preventDefault();
      e.stopPropagation();
    } else if (!movedRef.current && onClick) {
      e.stopPropagation();
      onClick();
    }
  }, [onClick]);

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  const updateTooltipPos = useCallback((e: React.MouseEvent) => {
    if (isTouchRef.current) return;
    setTooltipPos({ x: e.clientX + 14, y: e.clientY - 36 });
  }, []);

  const onMouseEnter = useCallback((e: React.MouseEvent) => {
    updateTooltipPos(e);
  }, [updateTooltipPos]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    updateTooltipPos(e);
  }, [updateTooltipPos]);

  const onMouseLeave = useCallback(() => {
    setTooltipPos(null);
  }, []);

  return (
    <>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
        onPointerCancel={() => { clear(); cancelFullPreload(); }}
        onClickCapture={onClickCapture}
        onContextMenu={onContextMenu}
        onMouseEnter={onMouseEnter}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        className={`relative ${className || ''}`}
        style={{
          touchAction: 'manipulation',
          WebkitTouchCallout: 'none',
          WebkitUserSelect: 'none',
          userSelect: 'none',
        }}
      >
        {/* 脉冲提示小圆点（缩略图模式） */}
        {!children && hintVisible && (
          <span className="absolute top-1 right-1 pointer-events-none z-10">
            <span className="block h-[10px] w-[10px] rounded-full bg-action shadow-[0_0_10px_#F97316]" />
            <span className="absolute inset-0 h-[10px] w-[10px] rounded-full bg-action/40 animate-ping" />
          </span>
        )}

        {children || (
          <>
            {!imgLoaded && !imgError && (
              <div className="w-full h-full img-loading-shimmer rounded-lg flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-ink/20 border-t-action rounded-full animate-spin" />
              </div>
            )}
            {imgError && (
              <div className="w-full h-full bg-ink/5 dark:bg-night-50 flex items-center justify-center gap-1.5 cursor-pointer" onClick={() => { retryCountRef.current = 0; const base = displaySrc.split('&pr=')[0].split('?pr=')[0]; const sep = base.includes('?') ? '&' : '?'; setImgError(false); setImgLoaded(false); setDisplaySrc(`${base}${sep}pr=${Date.now()}`); }}>
                <span className="w-4 h-4 border-2 border-ink/20 border-t-action rounded-full animate-spin" />
                <span className="text-[10px] text-ink-muted/50">重试</span>
              </div>
            )}
            <img
              ref={handleImgRef}
              src={displaySrc}
              alt={alt}
              loading="lazy"
              decoding="async"
              draggable={false}
              onLoad={() => { setImgLoaded(true); setImgError(false); }}
              onError={() => handleLoadFailure(displaySrc)}
              className="w-full h-full object-cover"
              // 用 opacity 而非 display:none 控制可见性：display:none + loading=lazy 会让浏览器判定图片不可见而推迟/不加载，导致永久转圈
              style={{ WebkitTouchCallout: 'none', pointerEvents: 'none', opacity: imgLoaded ? 1 : 0, position: imgLoaded ? 'static' : 'absolute', inset: 0 }}
            />
          </>
        )}

        {/* 详情海报渐变区域提示文字（children 模式） */}
        {children && hintVisible && (
          <span className="absolute bottom-10 left-1/2 -translate-x-1/2 text-[10px] text-white/35 font-bold tracking-wider pointer-events-none z-10 select-none">
            长按预览完整海报
          </span>
        )}
      </div>

      {/* 鼠标悬浮提示 */}
      {portalRoot && tooltipPos && !preview && createPortal(
        <div
          className="fixed z-[230] pointer-events-none px-2.5 py-1.5 rounded-xl bg-ink/85 text-white text-xs font-bold shadow-lg backdrop-blur-sm whitespace-nowrap"
          style={{ left: tooltipPos.x, top: tooltipPos.y }}
        >
          长按预览完整海报
        </div>,
        portalRoot
      )}

      {portalRoot && createPortal(
        <AnimatePresence>
          {preview && (
            <motion.div
              className="fixed inset-0 z-[220] flex items-center justify-center bg-ink/92 sm:backdrop-blur-md p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <button
                type="button"
                onClick={() => setPreview(false)}
                className="absolute top-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-xl border-2 border-white/30 bg-white/15 text-white backdrop-blur-sm transition-colors hover:bg-white/25 focus:outline-none focus:ring-4 focus:ring-action/40"
                aria-label="关闭海报预览"
              >
                <X className="h-5 w-5" strokeWidth={2.5} />
              </button>
              <motion.img
                src={fullSrc}
                alt={alt}
                className="max-h-[88vh] max-w-[92vw] rounded-2xl border-3 border-white/20 shadow-2xl object-contain select-none"
                style={{ pointerEvents: 'none' }}
                decoding="async"
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.85, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 450, damping: 28 }}
                draggable={false}
              />
            </motion.div>
          )}
        </AnimatePresence>,
        portalRoot
      )}
    </>
  );
};

export default LongPressPoster;
