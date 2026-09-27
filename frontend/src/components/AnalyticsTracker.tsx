import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { analyticsService } from '../services/analyticsService';
import { isAuthenticated } from '../utils/helpers';

const HEARTBEAT_INTERVAL_MS = 60 * 1000;
const MIN_REPORT_SECONDS = 8;

const AnalyticsTracker: React.FC = () => {
  const location = useLocation();
  const activeStartedAtRef = useRef(Date.now());
  const lastPathRef = useRef(location.pathname + location.search);
  const sessionIdRef = useRef(
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  );

  useEffect(() => {
    lastPathRef.current = location.pathname + location.search;
  }, [location.pathname, location.search]);

  useEffect(() => {
    const report = () => {
      if (!isAuthenticated()) {
        activeStartedAtRef.current = Date.now();
        return;
      }

      const now = Date.now();
      const durationSeconds = Math.floor((now - activeStartedAtRef.current) / 1000);
      activeStartedAtRef.current = now;

      if (durationSeconds < MIN_REPORT_SECONDS) return;
      analyticsService.heartbeat(durationSeconds, lastPathRef.current, sessionIdRef.current).catch(() => {
        // 统计失败不影响用户正常浏览。
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') report();
      if (document.visibilityState === 'visible') activeStartedAtRef.current = Date.now();
    };

    const intervalId = window.setInterval(report, HEARTBEAT_INTERVAL_MS);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', report);

    return () => {
      report();
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', report);
    };
  }, []);

  return null;
};

export default AnalyticsTracker;
