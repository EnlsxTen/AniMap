import { Response } from 'express';
import pool from '../database/db';
import { AuthRequest } from '../middleware/auth';
import { invalidatePublicEventsCache } from '../utils/cache';

const VALID_TYPES = ['event', 'venue', 'session'] as const;
type ItemType = typeof VALID_TYPES[number];

const publicTargetExists = async (itemType: ItemType, itemId: number) => {
  if (itemType === 'event') {
    const result = await pool.query(
      "SELECT id FROM events WHERE id=$1 AND status='approved' AND display_until >= NOW()",
      [itemId]
    );
    return result.rows.length > 0;
  }

  if (itemType === 'venue') {
    const result = await pool.query(
      "SELECT id FROM venues WHERE id=$1 AND status='approved'",
      [itemId]
    );
    return result.rows.length > 0;
  }

  const result = await pool.query(
    "SELECT id FROM sessions WHERE id=$1 AND status IN ('open','full') AND start_time > NOW()",
    [itemId]
  );
  return result.rows.length > 0;
};

export const toggleFavorite = async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { item_type, item_id } = req.body;

  if (!VALID_TYPES.includes(item_type) || !Number.isInteger(Number(item_id)) || Number(item_id) <= 0) {
    return res.status(400).json({ error: 'Invalid favorite target' });
  }

  try {
    const itemId = Number(item_id);

    const existing = await pool.query(
      'SELECT id FROM favorites WHERE user_id=$1 AND item_type=$2 AND item_id=$3',
      [userId, item_type, itemId]
    );

    if (existing.rows.length > 0) {
      // 取消收藏：不需要检查目标是否仍在公开展示
      await pool.query('DELETE FROM favorites WHERE id=$1', [existing.rows[0].id]);
      invalidatePublicEventsCache();
      return res.json({ favorited: false });
    }

    // 新增收藏：仅在添加时验证目标是否存在且可用
    if (!(await publicTargetExists(item_type, itemId))) {
      return res.status(404).json({ error: 'Favorite target not found or unavailable' });
    }

    await pool.query(
      'INSERT INTO favorites (user_id, item_type, item_id) VALUES ($1,$2,$3)',
      [userId, item_type, itemId]
    );
    invalidatePublicEventsCache();
    res.status(201).json({ favorited: true });
  } catch (err) {
    console.error('toggleFavorite error:', err);
    res.status(500).json({ error: 'Favorite operation failed' });
  }
};

export const getMyFavorites = async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  try {
    const result = await pool.query(
      `SELECT f.id, f.item_type, f.item_id, f.created_at, f.reminder_enabled FROM favorites f
       WHERE f.user_id=$1 ORDER BY f.created_at DESC`,
      [userId]
    );

    const eventIds = result.rows.filter(r => r.item_type === 'event').map(r => Number(r.item_id));
    const venueIds = result.rows.filter(r => r.item_type === 'venue').map(r => Number(r.item_id));
    const sessionIds = result.rows.filter(r => r.item_type === 'session').map(r => Number(r.item_id));

    const [events, venues, sessions] = await Promise.all([
      eventIds.length > 0
        ? pool.query('SELECT id, name, start_time, venue_name, address, poster_url, status FROM events WHERE id = ANY($1::int[])', [eventIds])
        : { rows: [] },
      venueIds.length > 0
        ? pool.query('SELECT id, name, address, cover_url, business_hours FROM venues WHERE id = ANY($1::int[])', [venueIds])
        : { rows: [] },
      sessionIds.length > 0
        ? pool.query('SELECT s.id, s.game_name, s.start_time, s.end_time, s.total_seats, s.booked_seats, s.status, v.name as venue_name, s.address FROM sessions s LEFT JOIN venues v ON s.venue_id=v.id WHERE s.id = ANY($1::int[])', [sessionIds])
        : { rows: [] },
    ]);

    const eventMap = Object.fromEntries(events.rows.map(e => [e.id, e]));
    const venueMap = Object.fromEntries(venues.rows.map(v => [v.id, v]));
    const sessionMap = Object.fromEntries(sessions.rows.map(s => [s.id, s]));

    const favorites = result.rows.map(f => ({
      ...f,
      detail: f.item_type === 'event' ? eventMap[Number(f.item_id)]
             : f.item_type === 'venue' ? venueMap[Number(f.item_id)]
             : sessionMap[Number(f.item_id)],
    })).filter(f => f.detail);

    res.json({ favorites });
  } catch (err) {
    console.error('getMyFavorites error:', err);
    res.status(500).json({ error: 'Failed to fetch favorites' });
  }
};

export const setReminderEnabled = async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const id = Number(req.params.id);
  const { enabled } = req.body;
  if (!Number.isInteger(id) || id <= 0 || typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'Invalid parameters' });
  }
  try {
    const result = await pool.query(
      'UPDATE favorites SET reminder_enabled=$1 WHERE id=$2 AND user_id=$3 RETURNING id',
      [enabled, id, userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Favorite not found' });
    res.json({ reminder_enabled: enabled });
  } catch (err) {
    console.error('setReminderEnabled error:', err);
    res.status(500).json({ error: 'Operation failed' });
  }
};

export const getMyFavoriteKeys = async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  try {
    const result = await pool.query(
      'SELECT item_type, item_id FROM favorites WHERE user_id=$1',
      [userId]
    );
    res.json({ keys: result.rows.map(r => `${r.item_type}-${r.item_id}`) });
  } catch (err) {
    console.error('getMyFavoriteKeys error:', err);
    res.status(500).json({ error: 'Query failed' });
  }
};
