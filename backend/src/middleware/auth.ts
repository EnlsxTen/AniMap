import { Request, Response, NextFunction } from 'express';
import pool from '../database/db';
import { verifyToken } from '../utils/jwt';

export interface AuthRequest extends Request {
  userId?: number;
  userRole?: string;
  userApprovalStatus?: string;
}

// 简易内存缓存，减少每次请求的 DB 查询压力
interface UserCacheEntry {
  id: number;
  role: string;
  approval_status: string;
  token_version: number;
  expiresAt: number;
}
const userCache = new Map<number, UserCacheEntry>();
const USER_CACHE_TTL_MS = 30 * 1000;

const fetchUser = async (userId: number) => {
  const now = Date.now();
  const cached = userCache.get(userId);
  if (cached && cached.expiresAt > now) {
    return cached;
  }
  const result = await pool.query(
    'SELECT id, role, approval_status, token_version FROM users WHERE id = $1',
    [userId]
  );
  if (result.rows.length === 0) return null;
  const entry: UserCacheEntry = {
    id: result.rows[0].id,
    role: result.rows[0].role,
    approval_status: result.rows[0].approval_status,
    token_version: result.rows[0].token_version ?? 0,
    expiresAt: now + USER_CACHE_TTL_MS,
  };
  userCache.set(userId, entry);
  return entry;
};

export const invalidateUserCache = (userId: number) => {
  userCache.delete(userId);
};

const approvalStatusMessage = (status: string): string => {
  if (status === 'pending') return '账号正在审核中，请等待管理员审核通过';
  if (status === 'rejected') return '账号审核未通过，已被拒绝，请联系管理员';
  return '账号状态异常，无法访问';
};

export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // 第一步：JWT 解析（失败 => 401）
  let decoded: { userId: number; role?: string; tokenVersion?: number };
  try {
    decoded = verifyToken<{ userId: number; role?: string; tokenVersion?: number }>(token);
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // 第二步：DB 查询（失败 => 500，避免把 DB 故障误当鉴权失败）
  try {
    const user = await fetchUser(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: '用户不存在或已被删除' });
    }

    // tokenVersion 不匹配 => token 已被吊销（密码修改、账号被拒等场景）
    const expectedVersion = user.token_version ?? 0;
    const tokenVersion = decoded.tokenVersion ?? 0;
    if (tokenVersion !== expectedVersion) {
      return res.status(401).json({ error: '登录已失效，请重新登录' });
    }

    if (user.role === 'merchant' && user.approval_status !== 'approved') {
      return res.status(403).json({ error: approvalStatusMessage(user.approval_status) });
    }

    req.userId = user.id;
    req.userRole = user.role;
    req.userApprovalStatus = user.approval_status;
    next();
  } catch (error) {
    console.error('Auth DB error:', error);
    return res.status(500).json({ error: '服务器繁忙，请稍后重试' });
  }
};

export const requireRole = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.userRole || !roles.includes(req.userRole)) {
      return res.status(403).json({ error: '无权限访问该功能' });
    }

    next();
  };
};

// 可选认证：带 token 则解析并注入 userId/role；未带 token 或解析失败均放行
export const optionalAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return next();

  let decoded: { userId: number; role?: string; tokenVersion?: number };
  try {
    decoded = verifyToken<{ userId: number; role?: string; tokenVersion?: number }>(token);
  } catch {
    return next();
  }

  try {
    const user = await fetchUser(decoded.userId);
    // tokenVersion 不匹配也视作未登录，不抛错继续放行
    const tokenVersion = decoded.tokenVersion ?? 0;
    if (user && tokenVersion === (user.token_version ?? 0)) {
      req.userId = user.id;
      req.userRole = user.role;
      req.userApprovalStatus = user.approval_status;
    }
  } catch (error) {
    console.error('OptionalAuth DB error:', error);
  }
  next();
};
