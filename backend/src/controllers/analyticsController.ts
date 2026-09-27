import { Request, Response } from 'express';
import pool from '../database/db';
import { AuthRequest } from '../middleware/auth';

const MAX_DURATION_SECONDS = 30 * 60;

const getClientIp = (req: Request): string => {
  return req.ip || req.socket.remoteAddress || 'unknown';
};

const getIpLocation = (req: Request): string | null => {
  const city = req.headers['cf-ipcity'];
  const region = req.headers['cf-region'];
  const country = req.headers['cf-ipcountry'];
  const parts = [country, region, city]
    .map(value => (Array.isArray(value) ? value[0] : value))
    .filter((value): value is string => Boolean(value && value !== 'XX'));
  return parts.length > 0 ? parts.join(' / ') : null;
};

const getDeviceType = (userAgent: string): string => {
  if (/ipad|tablet/i.test(userAgent)) return 'tablet';
  if (/mobile|iphone|android|phone/i.test(userAgent)) return 'mobile';
  return 'desktop';
};

export const recordAnalyticsHeartbeat = async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const duration = Number(req.body?.durationSeconds);
  if (!Number.isFinite(duration) || duration <= 0) {
    return res.status(400).json({ error: '停留时间无效' });
  }

  const durationSeconds = Math.min(Math.round(duration), MAX_DURATION_SECONDS);
  const pagePath = typeof req.body?.pagePath === 'string'
    ? req.body.pagePath.slice(0, 500)
    : null;
  const sessionId = typeof req.body?.sessionId === 'string'
    ? req.body.sessionId.slice(0, 80)
    : null;
  const userAgent = (req.headers['user-agent'] || '').slice(0, 500);
  const ipAddress = getClientIp(req).slice(0, 64);
  const ipLocation = getIpLocation(req);
  const deviceType = getDeviceType(userAgent);

  try {
    await pool.query(
      `INSERT INTO user_analytics (
         user_id,
         total_duration_seconds,
         visit_count,
         last_seen_at,
         last_ip,
         last_ip_location,
         last_user_agent,
         last_device_type,
         last_page_path,
         last_session_id,
         updated_at
       )
       VALUES ($1, $2, 1, CURRENT_TIMESTAMP, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id) DO UPDATE SET
         total_duration_seconds = user_analytics.total_duration_seconds + EXCLUDED.total_duration_seconds,
         visit_count = user_analytics.visit_count + CASE
           WHEN EXCLUDED.last_session_id IS NOT NULL
            AND user_analytics.last_session_id IS DISTINCT FROM EXCLUDED.last_session_id
           THEN 1
           ELSE 0
         END,
         last_seen_at = CURRENT_TIMESTAMP,
         last_ip = EXCLUDED.last_ip,
         last_ip_location = EXCLUDED.last_ip_location,
         last_user_agent = EXCLUDED.last_user_agent,
         last_device_type = EXCLUDED.last_device_type,
         last_page_path = EXCLUDED.last_page_path,
         last_session_id = COALESCE(EXCLUDED.last_session_id, user_analytics.last_session_id),
         updated_at = CURRENT_TIMESTAMP`,
      [userId, durationSeconds, ipAddress, ipLocation, userAgent, deviceType, pagePath, sessionId]
    );

    res.status(204).send();
  } catch (error) {
    console.error('Record analytics heartbeat error:', error);
    res.status(500).json({ error: '统计信息保存失败' });
  }
};
