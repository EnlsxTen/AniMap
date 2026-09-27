import React, { useMemo } from 'react';

/**
 * 几何色块装饰层（Vibrant Block 风格）
 * 大色块缓慢漂浮，构造活力感
 */
const FloatingDecorations: React.FC = () => {
  const blocks = useMemo(() => [
    { type: 'square', size: 90,  top: 8,  left: 6,   color: 'bg-primary-300', rotate: -8,  duration: 7,  delay: 0   },
    { type: 'circle', size: 130, top: 60, left: 4,   color: 'bg-action',      rotate: 0,   duration: 9,  delay: 1.5 },
    { type: 'square', size: 70,  top: 20, left: 88,  color: 'bg-pop-yellow',  rotate: 18,  duration: 8,  delay: 0.8 },
    { type: 'circle', size: 100, top: 70, left: 82,  color: 'bg-pop-purple',  rotate: 0,   duration: 10, delay: 2   },
    { type: 'square', size: 50,  top: 42, left: 12,  color: 'bg-pop-cyan',    rotate: 30,  duration: 6,  delay: 1   },
    { type: 'square', size: 60,  top: 86, left: 50,  color: 'bg-pop-pink',    rotate: -15, duration: 9,  delay: 2.5 },
  ], []);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
      {/* 网格底纹 */}
      <div className="absolute inset-0 bg-grid opacity-50" />

      {/* 几何色块 */}
      {blocks.map((b, i) => (
        <div
          key={i}
          className={`absolute ${b.color} border-3 border-ink dark:border-night-400 ${
            b.type === 'circle' ? 'rounded-full' : 'rounded-2xl'
          } animate-float-slow opacity-70 dark:opacity-30`}
          style={{
            width:  b.size,
            height: b.size,
            top:    `${b.top}%`,
            left:   `${b.left}%`,
            transform: `rotate(${b.rotate}deg)`,
            animationDuration: `${b.duration}s`,
            animationDelay:    `${b.delay}s`,
          }}
        />
      ))}
    </div>
  );
};

export default FloatingDecorations;
