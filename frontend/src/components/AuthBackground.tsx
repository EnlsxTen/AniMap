import React, { useEffect, useState } from 'react';
import { settingsService } from '../services/settingsService';
import { getImageUrl } from '../utils/helpers';
import FloatingDecorations from './FloatingDecorations';

const AuthBackground: React.FC = () => {
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    settingsService.getAuthBg()
      .then(res => {
        if (alive && res.url) {
          // 背景图上有 80% 不透明度的遮罩层，手机端用 720px 的 medium 变体足够，
          // 避免 1920px original 在手机上多解码约 10MB 位图
          const isLargeScreen = typeof window !== 'undefined'
            && window.matchMedia('(min-width: 1024px)').matches;
          setBgUrl(getImageUrl(res.url, isLargeScreen ? 'original' : 'medium'));
          document.body.classList.add('auth-bg-active');
        }
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoaded(true);
      });

    return () => {
      alive = false;
      document.body.classList.remove('auth-bg-active');
    };
  }, []);

  if (!loaded) return null;

  if (!bgUrl) return <FloatingDecorations />;

  return (
    <div
      className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url(${bgUrl})` }}
    />
  );
};

export default AuthBackground;
