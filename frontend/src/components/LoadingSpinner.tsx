import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
}

/**
 * 块状几何风格 Loader：三个色块依次跳动
 */
const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ size = 'md', text }) => {
  const blockSize = size === 'sm' ? 'w-3 h-3' : size === 'md' ? 'w-4 h-4' : 'w-5 h-5';
  const textSize = size === 'sm' ? 'text-sm' : size === 'md' ? 'text-base' : 'text-lg';

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <div className="flex items-center gap-2">
        {[
          { color: 'bg-primary-500', delay: '0ms' },
          { color: 'bg-action', delay: '150ms' },
          { color: 'bg-pop-purple', delay: '300ms' },
        ].map((b, i) => (
          <span
            key={i}
            className={`${blockSize} ${b.color} rounded-md border-2 border-ink dark:border-night-400 animate-bounce-soft`}
            style={{ animationDelay: b.delay }}
          />
        ))}
      </div>
      {text && (
        <p className={`${textSize} font-display text-ink dark:text-primary-200 tracking-wide`}>
          {text}
        </p>
      )}
    </div>
  );
};

export default LoadingSpinner;
