import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import fs from 'fs';
import path from 'path';
import pool from '../database/db';
import { sendAdminReviewRequest, sendReviewResult } from '../utils/emailService';
import { geocodeAddress } from '../utils/geocoding';
import { AuthRequest } from '../middleware/auth';

export const createEventValidation = [
  body('name').trim().notEmpty().withMessage('请输入活动名称'),
  body('start_time').isISO8601().withMessage('请输入有效的开始时间'),
  body('end_time').isISO8601().withMessage('请输入有效的结束时间'),
  body('display_until').optional({ values: 'falsy' }).isISO8601().withMessage('请输入有效的地图展示截止时间'),
  body('venue_name').trim().notEmpty().withMessage('请输入场馆名称'),
  body('address').trim().notEmpty().withMessage('请输入详细地址'),
  body('ticket_url').optional({ values: 'falsy' }).isURL({ require_protocol: true }).withMessage('购票链接需以 http:// 或 https:// 开头')
];

const PERSONAL_DISPLAY_DAYS = 7;
const MERCHANT_MAX_DISPLAY_DAYS = 90;

const UPLOAD_DIR = process.env.UPLOAD_DIR || 'public/uploads';

const removePoster = (posterUrl: string | null | undefined) => {
  if (!posterUrl) return;
  try {
    // posterUrl 形如 /uploads/xxx.jpg
    const filename = path.basename(posterUrl);
    const fullPath = path.join(UPLOAD_DIR, filename);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch (err) {
    console.warn('Failed to remove old poster:', err);
  }
};

const validateEventTimes = (start: string, end: string, displayUntil?: Date) => {
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
    throw new Error('活动时间格式无效');
  }
  if (e <= s) {
    throw new Error('活动结束时间必须晚于开始时间');
  }
  if (displayUntil && displayUntil < s) {
    throw new Error('地图展示截止时间不能早于活动开始时间');
  }
};

const getUserRole = async (userId: number): Promise<'merchant' | 'personal' | 'admin'> => {
  const result = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);

  if (result.rows.length === 0) {
    throw new Error('User not found');
  }

  return result.rows[0].role;
};

const resolveDisplayUntil = (userRole: 'merchant' | 'personal' | 'admin', displayUntilInput?: string): Date => {
  const now = new Date();

  if (userRole === 'personal') {
    return new Date(now.getTime() + PERSONAL_DISPLAY_DAYS * 24 * 60 * 60 * 1000);
  }

  if (!displayUntilInput) {
    throw new Error('请设置地图展示截止时间');
  }

  const displayUntil = new Date(displayUntilInput);
  if (Number.isNaN(displayUntil.getTime())) {
    throw new Error('地图展示截止时间格式无效');
  }

  if (displayUntil <= now) {
    throw new Error('地图展示截止时间必须晚于当前时间');
  }

  const maxDisplayUntil = new Date(now.getTime() + MERCHANT_MAX_DISPLAY_DAYS * 24 * 60 * 60 * 1000);
  if (displayUntil > maxDisplayUntil) {
    throw new Error('商户活动在地图上的展示时间最长为3个月');
  }

  return displayUntil;
};

export const createEvent = async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: errors.array()[0].msg,
      errors: errors.array()
    });
  }

  const { name, start_time, end_time, venue_name, address, ticket_price, description, display_until, latitude, longitude, ticket_url } = req.body;
  const userId = req.userId;

  if (!userId) {
    return res.status(401).json({ error: '请先登录后再发布活动' });
  }

  try {
    const userRole = await getUserRole(userId);
    const resolvedDisplayUntil = resolveDisplayUntil(userRole, display_until);
    validateEventTimes(start_time, end_time, resolvedDisplayUntil);

    // 如果前端传了经纬度就直接用，否则走地理编码
    let lat = latitude !== undefined ? parseFloat(latitude) : NaN;
    let lng = longitude !== undefined ? parseFloat(longitude) : NaN;
    if (isNaN(lat) || isNaN(lng)) {
      const geoResult = await geocodeAddress(address);
      lat = geoResult.latitude;
      lng = geoResult.longitude;
    }

    // Handle poster upload
    const posterUrl = req.file ? `/uploads/${req.file.filename}` : null;

    // Determine status: personal users' events are auto-approved, others need review
    const status = userRole === 'personal' ? 'approved' : 'pending';

    // Create event
    const result = await pool.query(
      `INSERT INTO events (user_id, name, poster_url, start_time, end_time, venue_name, address, latitude, longitude, ticket_price, description, display_until, status, ticket_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [userId, name, posterUrl, start_time, end_time, venue_name, address, lat, lng, ticket_price, description, resolvedDisplayUntil, status, ticket_url || null]
    );

    res.status(201).json({
      message: userRole === 'personal' ? '活动发布成功，已在地图上展示，展示时长为7天' : '活动发布成功，等待审核',
      event: result.rows[0]
    });

    // 商户/管理员发布活动需要审核时，通知管理员
    if (status === 'pending') {
      const userRes = await pool.query('SELECT username FROM users WHERE id=$1', [userId]);
      sendAdminReviewRequest({ type: '活动发布', submitterName: userRes.rows[0]?.username || '', itemName: name });
    }
  } catch (error) {
    console.error('Create event error:', error);
    if (error instanceof Error && error.message) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: '发布活动失败，请联系网站管理员' });
  }
};

export const getPendingEvents = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT e.*, u.username as merchant_name, u.email as merchant_email
       FROM events e
       JOIN users u ON e.user_id = u.id
       WHERE e.status = 'pending'
       ORDER BY e.created_at ASC`
    );

    res.json({ events: result.rows });
  } catch (error) {
    console.error('Get pending events error:', error);
    res.status(500).json({ error: '获取待审核活动失败' });
  }
};

export const getPublicEvents = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT e.*, u.username as merchant_name 
       FROM events e 
       JOIN users u ON e.user_id = u.id 
       WHERE e.status = 'approved' AND e.display_until >= NOW()
       ORDER BY e.start_time ASC`
    );

    res.json({ events: result.rows });
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
};

export const getMerchantEvents = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const result = await pool.query(
      'SELECT * FROM events WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );

    res.json({ events: result.rows });
  } catch (error) {
    console.error('Get merchant events error:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
};

export const getEventById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT e.*, u.username as merchant_name, u.email as merchant_email
       FROM events e
       JOIN users u ON e.user_id = u.id
       WHERE e.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const event = result.rows[0];

    // 仅活动所有者或管理员能看到商户邮箱，公开查询时隐藏
    const isOwner = req.userId && req.userId === event.user_id;
    const isAdmin = req.userRole === 'admin';
    if (!isOwner && !isAdmin) {
      delete event.merchant_email;
    }

    res.json({ event });
  } catch (error) {
    console.error('Get event error:', error);
    res.status(500).json({ error: 'Failed to fetch event' });
  }
};

export const updateEvent = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId;
  const { name, start_time, end_time, venue_name, address, ticket_price, description, display_until, latitude: reqLatitude, longitude: reqLongitude, ticket_url } = req.body;

  if (!userId) {
    return res.status(401).json({ error: '请先登录后再编辑活动' });
  }

  try {
    const userRole = await getUserRole(userId);

    // Check ownership - only the event creator can edit
    // Note: Admins can delete events but cannot edit them (by design)
    // This ensures content integrity - admins review/approve but don't modify merchant content
    const checkResult = await pool.query('SELECT * FROM events WHERE id = $1 AND user_id = $2', [id, userId]);
    if (checkResult.rows.length === 0) {
      return res.status(403).json({ error: '无权编辑该活动' });
    }

    const resolvedDisplayUntil = resolveDisplayUntil(userRole, display_until);
    validateEventTimes(start_time, end_time, resolvedDisplayUntil);

    let latitude = checkResult.rows[0].latitude;
    let longitude = checkResult.rows[0].longitude;

    // 如果前端传了经纬度就直接用，否则地址变了才走地理编码
    if (reqLatitude !== undefined && reqLongitude !== undefined) {
      latitude = parseFloat(reqLatitude);
      longitude = parseFloat(reqLongitude);
      if (isNaN(latitude) || isNaN(longitude)) {
        latitude = checkResult.rows[0].latitude;
        longitude = checkResult.rows[0].longitude;
      }
    } else if (address && address !== checkResult.rows[0].address) {
      const geoResult = await geocodeAddress(address);
      latitude = geoResult.latitude;
      longitude = geoResult.longitude;
    }

    const posterUrl = req.file ? `/uploads/${req.file.filename}` : checkResult.rows[0].poster_url;

    // 如果上传了新海报，删除旧海报文件
    if (req.file && checkResult.rows[0].poster_url) {
      removePoster(checkResult.rows[0].poster_url);
    }

    // Determine status: personal users keep 'approved', others reset to 'pending'
    const updatedStatus = userRole === 'personal' ? 'approved' : 'pending';

    const result = await pool.query(
      `UPDATE events 
        SET name = $1, poster_url = $2, start_time = $3, end_time = $4, venue_name = $5, 
            address = $6, latitude = $7, longitude = $8, ticket_price = $9, description = $10,
            display_until = $11, status = $12, ticket_url = $13, updated_at = CURRENT_TIMESTAMP
       WHERE id = $14 AND user_id = $15
       RETURNING *`,
      [name, posterUrl, start_time, end_time, venue_name, address, latitude, longitude, ticket_price, description, resolvedDisplayUntil, updatedStatus, ticket_url || null, id, userId]
    );

    res.json({
      message: userRole === 'personal' ? '活动更新成功，地图展示时长仍为7天' : '活动更新成功，等待重新审核',
      event: result.rows[0]
    });
  } catch (error) {
    console.error('Update event error:', error);
    if (error instanceof Error && error.message) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: '更新活动失败，请联系网站管理员' });
  }
};

export const deleteEvent = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId;
  const userRole = req.userRole;

  try {
    // 先检查活动是否存在
    const checkResult = await pool.query('SELECT user_id, poster_url FROM events WHERE id = $1', [id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: '活动不存在' });
    }

    // 管理员可删除任何活动；其他角色只能删除自己的
    if (userRole !== 'admin' && checkResult.rows[0].user_id !== userId) {
      return res.status(403).json({ error: '无权删除该活动' });
    }

    await pool.query('DELETE FROM events WHERE id = $1', [id]);
    removePoster(checkResult.rows[0].poster_url);

    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({ error: 'Failed to delete event' });
  }
};

export const updateEventStatus = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['pending', 'approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    const result = await pool.query(
      'UPDATE events SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    res.json({
      message: 'Event status updated successfully',
      event: result.rows[0]
    });

    // 通知活动发布者审核结果
    if (status === 'approved' || status === 'rejected') {
      const userRes = await pool.query(
        'SELECT u.email FROM users u JOIN events e ON e.user_id = u.id WHERE e.id=$1', [id]
      );
      if (userRes.rows[0]) {
        sendReviewResult(userRes.rows[0].email, {
          type: '活动', itemName: result.rows[0].name, approved: status === 'approved',
        });
      }
    }
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ error: 'Failed to update event status' });
  }
};
