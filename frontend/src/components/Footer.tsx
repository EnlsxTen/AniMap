import React from 'react';

const ICP_NUMBER = '';
const POLICE_NUMBER = '';
const POLICE_LINK = '';

const Footer: React.FC = () => {
  const hasIcp = ICP_NUMBER.length > 0;
  const hasPolice = POLICE_NUMBER.length > 0;
  if (!hasIcp && !hasPolice) return null;

  return (
    <footer className="w-full py-4 px-4 text-center text-xs text-ink-muted dark:text-primary-100/60 border-t-3 border-ink dark:border-night-400 bg-white/70 dark:bg-night-100/70 sm:backdrop-blur-sm">
      <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-6">
        {hasIcp && (
          <a
            href="https://beian.miit.gov.cn/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-action transition-colors"
          >
            {ICP_NUMBER}
          </a>
        )}
        {hasPolice && (
          <a
            href={POLICE_LINK || 'http://www.beian.gov.cn/'}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-action transition-colors"
          >
            {POLICE_NUMBER}
          </a>
        )}
      </div>
    </footer>
  );
};

export default Footer;
