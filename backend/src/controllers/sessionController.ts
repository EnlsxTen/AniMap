import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import pool from '../database/db';
import { AuthRequest } from '../middleware/auth';
import {
  sendSessionFull, sendSessionNewRegistration, sendRegistrationConfirm,
} from '../utils/emailService';

export const createSessionValidation = [
  body('game_name').trim().notEmpty().withMessage('请输入游戏名称'),
  body('start_time').isISO8601().withMessage('请输入有效的开始时间'),
  body('end_time').isISO8601().withMessage('请输入有效的结束时间'),
  body('total_seats').isInt({ min: 1, max: 50 }).withMessage('座位数需在 1-50 之间'),
];

// 格式化时间用于邮件
const fmtTime = (t: string) => new Date(t).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

// ==========================================================================
// 公开组局列表
// ==========================================================================
export const getPublicSessions = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT s.*, u.username as host_name,
              v.name as venue_name, v.address as venue_address
       FROM sessions s
       JOIN users u ON s.user_id = u.id
       LEFT JOIN venues v ON s.venue_id = v.id
       WHERE s.status IN ('open','full') AND s.start_time > NOW()
       ORDER BY s.start_time ASC`
    );
    res.json({ sessions: result.rows });
  } catch (err) {
    console.error('getPublicSessions error:', err);
    res.status(500).json({ error: '获取组局列表失败' });
  }
};

// ==========================================================================
// 某店铺的组局列表
// ==========================================================================
export const getVenueSessions = async (req: Request, res: Response) => {
  try {
    const { venueId } = req.params;
    const result = await pool.query(
      `SELECT s.*, u.username as host_name
       FROM sessions s JOIN users u ON s.user_id = u.id
       WHERE s.venue_id = $1 AND s.status IN ('open','full') AND s.start_time > NOW()
       ORDER BY s.start_time ASC`,
      [venueId]
    );
    res.json({ sessions: result.rows });
  } catch (err) {
    console.error('getVenueSessions error:', err);
    res.status(500).json({ error: '获取店铺组局失败' });
  }
};

// ==========================================================================
// 我的组局
// ==========================================================================
export const getMySessions = async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT s.*, v.name as venue_name FROM sessions s
       LEFT JOIN venues v ON s.venue_id = v.id
       WHERE s.user_id = $1 ORDER BY s.created_at DESC`,
      [req.userId]
    );
    res.json({ sessions: result.rows });
  } catch (err) {
    console.error('getMySessions error:', err);
    res.status(500).json({ error: '获取我的组局失败' });
  }
};

// ==========================================================================
// 组局详情
// ==========================================================================
export const getSessionById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT s.*, u.username as host_name, u.email as host_email,
              v.name as venue_name, v.address as venue_address
       FROM sessions s JOIN users u ON s.user_id = u.id
       LEFT JOIN venues v ON s.venue_id = v.id
       WHERE s.id = $1`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: '组局不存在' });

    const session = result.rows[0];
    const isOwner = req.userId && Number(req.userId) === Number(session.user_id);
    const isAdmin = req.userRole === 'admin';
    if (!isOwner && !isAdmin) delete session.host_email;

    // 当前用户是否已报名
    let registered = false;
    if (req.userId) {
      const reg = await pool.query(
        'SELECT id FROM session_registrations WHERE session_id=$1 AND user_id=$2',
        [id, req.userId]
      );
      registered = reg.rows.length > 0;
    }

    res.json({ session, registered });
  } catch (err) {
    console.error('getSessionById error:', err);
    res.status(500).json({ error: '获取组局详情失败' });
  }
};

// ==========================================================================
// 创建组局
// ==========================================================================
export const createSession = async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const userId = req.userId!;
  const { game_name, game_type, start_time, end_time, total_seats, difficulty,
          description, price_per_person, venue_id, address, latitude, longitude } = req.body;

  if (new Date(end_time) <= new Date(start_time)) {
    return res.status(400).json({ error: '结束时间必须晚于开始时间' });
  }

  try {
    // 商户必须关联已审核的店铺
    const userRes = await pool.query('SELECT role FROM users WHERE id=$1', [userId]);
    const role = userRes.rows[0]?.role;

    let resolvedVenueId = venue_id || null;
    let resolvedAddress = address;
    let resolvedLat = latitude ? parseFloat(latitude) : null;
    let resolvedLng = longitude ? parseFloat(longitude) : null;

    if (resolvedVenueId) {
      const venueRes = await pool.query(
        'SELECT id, address, latitude, longitude FROM venues WHERE id=$1 AND status=$2',
        [resolvedVenueId, 'approved']
      );
      if (venueRes.rows.length === 0) {
        return res.status(400).json({ error: '关联的店铺不存在或未审核通过' });
      }
      // 有店铺时从店铺继承坐标
      resolvedAddress = venueRes.rows[0].address;
      resolvedLat = venueRes.rows[0].latitude;
      resolvedLng = venueRes.rows[0].longitude;
    } else if (role === 'merchant') {
      return res.status(400).json({ error: '商户发布组局必须关联已审核的店铺' });
    }

    if (!resolvedLat || !resolvedLng) {
      return res.status(400).json({ error: '请选择活动地点' });
    }

    const result = await pool.query(
      `INSERT INTO sessions (user_id, venue_id, game_name, game_type, start_time, end_time,
        total_seats, difficulty, description, price_per_person, address, latitude, longitude, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'open') RETURNING *`,
      [userId, resolvedVenueId, game_name, game_type || 'boardgame', start_time, end_time,
       total_seats, difficulty || 'beginner', description || null, price_per_person || null,
       resolvedAddress, resolvedLat, resolvedLng]
    );

    res.status(201).json({ message: '组局发布成功', session: result.rows[0] });
  } catch (err) {
    console.error('createSession error:', err);
    res.status(500).json({ error: '发布组局失败' });
  }
};

// ==========================================================================
// 更新组局
// ==========================================================================
export const updateSession = async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const { id } = req.params;
  const userId = req.userId!;
  const { game_name, game_type, start_time, end_time, total_seats, difficulty,
          description, price_per_person } = req.body;

  try {
    const check = await pool.query('SELECT * FROM sessions WHERE id=$1', [id]);
    if (check.rows.length === 0) return res.status(404).json({ error: '组局不存在' });
    if (Number(check.rows[0].user_id) !== Number(userId) && req.userRole !== 'admin') {
      return res.status(403).json({ error: '无权编辑该组局' });
    }
    if (new Date(end_time) <= new Date(start_time)) {
      return res.status(400).json({ error: '结束时间必须晚于开始时间' });
    }
    // 不能把总座位数改得比已报名数少
    const seats = parseInt(total_seats, 10);
    if (isNaN(seats) || seats < 1) {
      return res.status(400).json({ error: '座位数必须是大于0的整数' });
    }
    if (seats < check.rows[0].booked_seats) {
      return res.status(400).json({ error: `总座位数不能少于已报名人数 (${check.rows[0].booked_seats})` });
    }

    const result = await pool.query(
      `UPDATE sessions SET game_name=$1, game_type=$2, start_time=$3, end_time=$4,
        total_seats=$5, difficulty=$6, description=$7, price_per_person=$8
       WHERE id=$9 RETURNING *`,
      [game_name, game_type, start_time, end_time, total_seats, difficulty,
       description || null, price_per_person || null, id]
    );
    res.json({ message: '组局已更新', session: result.rows[0] });
  } catch (err) {
    console.error('updateSession error:', err);
    res.status(500).json({ error: '更新组局失败' });
  }
};

// ==========================================================================
// 删除组局
// ==========================================================================
export const deleteSession = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  try {
    const check = await pool.query('SELECT user_id FROM sessions WHERE id=$1', [id]);
    if (check.rows.length === 0) return res.status(404).json({ error: '组局不存在' });
    if (Number(check.rows[0].user_id) !== Number(req.userId) && req.userRole !== 'admin') {
      return res.status(403).json({ error: '无权删除该组局' });
    }
    await pool.query('DELETE FROM sessions WHERE id=$1', [id]);
    res.json({ message: '组局已删除' });
  } catch (err) {
    console.error('deleteSession error:', err);
    res.status(500).json({ error: '删除组局失败' });
  }
};

// ==========================================================================
// 报名（先到先得，报名即确认）
// ==========================================================================
export const registerSession = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId!;
  const note = req.body.note || null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sessionRes = await client.query(
      `SELECT s.*, u.email as host_email, u.username as host_name,
              v.name as venue_name
       FROM sessions s JOIN users u ON s.user_id = u.id
       LEFT JOIN venues v ON s.venue_id = v.id
       WHERE s.id=$1 FOR UPDATE`,
      [id]
    );
    if (sessionRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: '组局不存在' });
    }

    const session = sessionRes.rows[0];
    if (session.status !== 'open') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: session.status === 'full' ? '该组局已满员' : '该组局已取消' });
    }
    if (session.user_id === userId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: '不能报名自己发布的组局' });
    }

    // 检查是否已报名
    const existing = await client.query(
      'SELECT id FROM session_registrations WHERE session_id=$1 AND user_id=$2',
      [id, userId]
    );
    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: '你已经报名了这个组局' });
    }

    // 插入报名记录
    await client.query(
      'INSERT INTO session_registrations (session_id, user_id, note) VALUES ($1,$2,$3)',
      [id, userId, note]
    );

    const newBooked = session.booked_seats + 1;
    const isFull = newBooked >= session.total_seats;

    await client.query(
      `UPDATE sessions SET booked_seats=$1, status=$2 WHERE id=$3`,
      [newBooked, isFull ? 'full' : 'open', id]
    );

    await client.query('COMMIT');

    // 获取报名用户信息用于邮件
    const userRes = await pool.query('SELECT email, username FROM users WHERE id=$1', [userId]);
    const user = userRes.rows[0];

    // 邮件通知（fire-and-forget，加空值保护）
    if (user) {
      sendRegistrationConfirm(user.email, {
        gameName: session.game_name,
        startTime: fmtTime(session.start_time),
        endTime: fmtTime(session.end_time),
        address: session.address || session.venue_address || '',
        venueName: session.venue_name,
      });
    }

    if (isFull && session.host_email) {
      sendSessionFull(session.host_email, {
        gameName: session.game_name,
        startTime: fmtTime(session.start_time),
        address: session.address || session.venue_address || '',
        totalSeats: session.total_seats,
      });
    } else if (session.host_email && user) {
      sendSessionNewRegistration(session.host_email, {
        gameName: session.game_name,
        startTime: fmtTime(session.start_time),
        registrantName: user.username,
        bookedSeats: newBooked,
        totalSeats: session.total_seats,
      });
    }

    res.status(201).json({ message: '报名成功', booked_seats: newBooked, is_full: isFull });
  } catch (err: any) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(400).json({ error: '你已经报名了这个组局' });
    console.error('registerSession error:', err);
    res.status(500).json({ error: '报名失败' });
  } finally {
    client.release();
  }
};

// ==========================================================================
// 取消报名
// ==========================================================================
export const cancelRegistration = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId!;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sessionRes = await client.query(
      'SELECT booked_seats, status FROM sessions WHERE id=$1 FOR UPDATE', [id]
    );
    if (sessionRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: '组局不存在' });
    }

    const del = await client.query(
      'DELETE FROM session_registrations WHERE session_id=$1 AND user_id=$2 RETURNING id',
      [id, userId]
    );
    if (del.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: '你未报名该组局' });
    }

    const newBooked = Math.max(0, sessionRes.rows[0].booked_seats - 1);
    // 只有当前是 full 时才改回 open，cancelled 等其他状态保持不变
    const currentStatus = sessionRes.rows[0].status;
    const newStatus = currentStatus === 'full' ? 'open' : currentStatus;
    await client.query(
      'UPDATE sessions SET booked_seats=$1, status=$2 WHERE id=$3',
      [newBooked, newStatus, id]
    );

    await client.query('COMMIT');
    res.json({ message: '已取消报名' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('cancelRegistration error:', err);
    res.status(500).json({ error: '取消报名失败' });
  } finally {
    client.release();
  }
};

// ==========================================================================
// 查看报名列表（发布者/管理员）
// ==========================================================================
export const getRegistrations = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  try {
    const check = await pool.query('SELECT user_id FROM sessions WHERE id=$1', [id]);
    if (check.rows.length === 0) return res.status(404).json({ error: '组局不存在' });
    if (check.rows[0].user_id !== req.userId && req.userRole !== 'admin') {
      return res.status(403).json({ error: '无权查看报名列表' });
    }
    const result = await pool.query(
      `SELECT r.*, u.username, u.email FROM session_registrations r
       JOIN users u ON r.user_id = u.id
       WHERE r.session_id=$1 ORDER BY r.created_at ASC`,
      [id]
    );
    res.json({ registrations: result.rows });
  } catch (err) {
    console.error('getRegistrations error:', err);
    res.status(500).json({ error: '获取报名列表失败' });
  }
};
