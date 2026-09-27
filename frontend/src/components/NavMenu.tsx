import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Navigation } from 'lucide-react';
interface NavMenuProps {
  lat: number;
  lng: number;
  name: string;
  open: boolean;
  onClose: () => void;
}

// 安全检测 iOS（兼容 SSR/测试环境）
const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

const NavMenu: React.FC<NavMenuProps> = ({ lat, lng, name, open, onClose }) => {
  const encodedName = encodeURIComponent(name);

  // Apple 地图在中国大陆底图使用高德数据，直接传 GCJ-02 坐标反而更准
  const appleOption = {
    label: 'Apple 地图',
    icon: '🍎',
    url: `https://maps.apple.com/?ll=${lat},${lng}&q=${encodedName}&dirflg=w`,
  };

  const options = [
    ...(isIOS ? [appleOption] : []),
    { label: '高德地图', icon: '📍', url: `https://uri.amap.com/navigation?to=${lng},${lat},${encodedName}&mode=walk&callnative=1` },
    { label: '百度地图', icon: '🗺️', url: `https://api.map.baidu.com/marker?location=${lat},${lng}&title=${encodedName}&content=${encodedName}&coord_type=gcj02&output=html` },
    { label: '腾讯地图', icon: '📌', url: `https://apis.map.qq.com/uri/v1/marker?marker=coord:${lat},${lng};title:${encodedName}&referer=animap` },
    ...(!isIOS ? [appleOption] : []),
  ];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`${lat},${lng}`);
      alert('坐标已复制：' + lat + ',' + lng);
    } catch {
      alert('坐标：' + lat + ',' + lng);
    }
    onClose();
  };

  const optionInitial = { opacity: 0, y: 54, scale: 0.92 };
  const optionAnimate = { opacity: 1, y: 0, scale: 1 };
  const getOptionTransition = (index: number) => ({
    type: 'spring' as const,
    damping: 16,
    stiffness: 350,
    mass: 0.92,
    delay: 0.08 + index * 0.055,
  });

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* 遮罩 */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
            className="fixed inset-0 z-[60] bg-ink/50 sm:backdrop-blur-sm"
            onClick={onClose}
          />

          {/* 底部抽屉 */}
          <motion.div
            initial={{ y: '104%', scale: 0.985 }} animate={{ y: 0, scale: 1 }} exit={{ y: '104%', scale: 0.985 }}
            transition={{ type: 'spring', damping: 21, stiffness: 360, mass: 0.92 }}
            className="fixed bottom-0 inset-x-0 z-[61] bg-white dark:bg-night-100 rounded-t-3xl border-t-3 border-ink dark:border-night-400 shadow-block-lg pb-safe"
          >
            {/* 拖拽条 */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-ink/20 dark:bg-night-400" />
            </div>

            {/* 标题 */}
            <div className="flex items-center justify-between px-5 py-3 border-b-2 border-ink/10 dark:border-night-400">
              <div className="flex items-center gap-2">
                <Navigation className="w-5 h-5 text-action" strokeWidth={2.5} />
                <span className="font-display text-base text-ink dark:text-primary-100">选择导航应用</span>
              </div>
              <button onClick={onClose} className="btn-icon !w-8 !h-8" aria-label="关闭">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 目的地 */}
            <div className="px-5 py-2.5 bg-primary-50 dark:bg-night-200 border-b-2 border-ink/10 dark:border-night-400">
              <p className="text-xs text-ink-muted dark:text-primary-100/60">目的地</p>
              <p className="text-sm font-medium text-ink dark:text-primary-100 truncate">{name}</p>
            </div>

            {/* 地图选项 */}
            <div className="p-3 space-y-2">
              {options.map((opt, index) => (
                <motion.a
                  key={opt.label}
                  href={opt.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={onClose}
                  initial={optionInitial}
                  animate={optionAnimate}
                  transition={getOptionTransition(index)}
                  className="flex items-center gap-3 p-3.5 rounded-xl border-2 border-ink/10 dark:border-night-400 hover:bg-primary-50 dark:hover:bg-night-200 hover:border-action transition-colors duration-200"
                >
                  <span className="text-2xl">{opt.icon}</span>
                  <span className="font-display text-base text-ink dark:text-primary-100">{opt.label}</span>
                </motion.a>
              ))}

              {/* 复制坐标（兜底） */}
              <motion.button
                onClick={handleCopy}
                initial={optionInitial}
                animate={optionAnimate}
                transition={getOptionTransition(options.length)}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl border-2 border-dashed border-ink/20 dark:border-night-400 hover:bg-primary-50 dark:hover:bg-night-200 transition-colors duration-200"
              >
                <span className="text-2xl">📋</span>
                <span className="font-display text-base text-ink-muted dark:text-primary-100/60">复制坐标</span>
              </motion.button>
            </div>

            {/* iOS 底部安全区 */}
            <div className="h-4" />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default NavMenu;
