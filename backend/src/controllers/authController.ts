import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { body, validationResult } from 'express-validator';
import pool from '../database/db';
import { sendVerificationCode, sendAdminReviewRequest } from '../utils/emailService';
import { generateCode, canSendCode, getCooldownSeconds, storeCode, verifyCode, canSendFromIp, recordIpSend, isIpBlocked, getIpBlockRemainingSeconds, recordLoginFailure, clearLoginFailures } from '../utils/codeStore';
import { AuthRequest, invalidateUserCache } from '../middleware/auth';
import { signToken } from '../utils/jwt';

// 密码强度：至少 8 位，且必须包含字母和数字（同时允许特殊字符）
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)[\S]{8,128}$/;
const PASSWORD_MSG = '密码至少 8 位，且必须同时包含字母和数字';

export const registerValidation = [
  body('email').trim().isEmail().withMessage('请输入有效的邮箱地址').isLength({ max: 255 }),
  body('password').matches(PASSWORD_REGEX).withMessage(PASSWORD_MSG),
  body('userType').optional().isIn(['merchant', 'personal']).withMessage('用户类型无效'),
  body('username').trim().notEmpty().withMessage('请输入用户名').isLength({ max: 100 }).withMessage('用户名过长'),
  body('phone').optional({ values: 'falsy' }).isLength({ max: 30 }).withMessage('手机号过长'),
];

export const loginValidation = [
  body('email').trim().isEmail().withMessage('请输入有效的邮箱地址'),
  body('password').notEmpty().withMessage('请输入密码')
];

export const updateMerchantApprovalValidation = [
  body('approvalStatus').isIn(['approved', 'rejected']).withMessage('审核状态无效')
];

export const register = async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: errors.array()[0].msg,
      errors: errors.array()
    });
  }

  const { email, password, username, phone, userType, verificationCode } = req.body;
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedUsername = username.trim();
  const normalizedPhone = phone?.trim() || null;
  const normalizedUserType = userType === 'personal' ? 'personal' : 'merchant';
  const approvalStatus = normalizedUserType === 'merchant' ? 'pending' : 'approved';

  try {
    // 先检查邮箱是否已注册（避免消费验证码后才发现重复）
    const userCheck = await pool.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: '该邮箱已注册，请直接登录' });
    }

    // 验证邮箱验证码
    if (!verificationCode) {
      return res.status(400).json({ error: '请输入邮箱验证码' });
    }
    if (!verifyCode(normalizedEmail, verificationCode, 'register')) {
      return res.status(400).json({ error: '验证码错误或已过期' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const result = await pool.query(
      'INSERT INTO users (email, password, username, phone, role, approval_status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, username, role, approval_status, token_version, created_at',
      [normalizedEmail, hashedPassword, normalizedUsername, normalizedPhone, normalizedUserType, approvalStatus]
    );

    const user = result.rows[0];

    if (user.role === 'merchant') {
      // 通知管理员有新商户注册待审核（fire-and-forget）
      sendAdminReviewRequest({ type: '商户注册', submitterName: user.username, itemName: user.email });
      return res.status(201).json({
        message: '商户注册申请已提交，审核通过后即可登录',
        requiresApproval: true,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          role: user.role,
          approval_status: user.approval_status
        }
      });
    }

    // Generate JWT
    const token = signToken({ userId: user.id, role: user.role, tokenVersion: user.token_version ?? 0 });

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        approval_status: user.approval_status
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: '注册失败，请联系网站管理员' });
  }
};

export const login = async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: errors.array()[0].msg,
      errors: errors.array()
    });
  }

  const { email, password } = req.body;
  const normalizedEmail = email.trim().toLowerCase();
  // 使用 req.ip（依赖 app.set('trust proxy', 1)），避免 X-Forwarded-For 被攻击者伪造
  const clientIp = req.ip || 'unknown';

  // 检查 IP 是否被封锁
  if (isIpBlocked(clientIp)) {
    const remainingSeconds = getIpBlockRemainingSeconds(clientIp);
    return res.status(429).json({
      error: `登录失败次数过多，请在 ${Math.ceil(remainingSeconds / 60)} 分钟后重试`
    });
  }

  try {
    // Find user
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
    if (result.rows.length === 0) {
      recordLoginFailure(clientIp);
      return res.status(401).json({ error: '邮箱或密码错误' });
    }

    const user = result.rows[0];

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      recordLoginFailure(clientIp);
      return res.status(401).json({ error: '邮箱或密码错误' });
    }

    if (user.role === 'merchant' && user.approval_status !== 'approved') {
      const msg = user.approval_status === 'rejected'
        ? '账号审核未通过，已被拒绝，请联系管理员'
        : '商户账号正在审核中，请等待管理员审核通过';
      return res.status(403).json({ error: msg });
    }

    // 登录成功，清除失败记录
    clearLoginFailures(clientIp);

    // Generate JWT
    const token = signToken({ userId: user.id, role: user.role, tokenVersion: user.token_version ?? 0 });

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        approval_status: user.approval_status
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: '登录失败，请联系网站管理员' });
  }
};

export const getProfile = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: '未登录' });
    }

    const result = await pool.query(
      'SELECT id, email, username, phone, role, approval_status, created_at FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: '邮箱或验证码错误' });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getPendingMerchants = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, email, username, phone, role, approval_status, created_at
       FROM users
       WHERE role = 'merchant' AND approval_status = 'pending'
       ORDER BY created_at ASC`
    );

    res.json({ merchants: result.rows });
  } catch (error) {
    console.error('Get pending merchants error:', error);
    res.status(500).json({ error: '获取待审核商户失败，请联系网站管理员' });
  }
};

export const updateMerchantApproval = async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: errors.array()[0].msg,
      errors: errors.array()
    });
  }

  const { id } = req.params;
  const { approvalStatus } = req.body;

  try {
    // 拒绝时同步把 token_version+1，强制吊销被拒商户已签发的 token
    const sql = approvalStatus === 'rejected'
      ? `UPDATE users
         SET approval_status = $1, token_version = token_version + 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND role = 'merchant'
         RETURNING id, email, username, phone, role, approval_status, created_at, updated_at`
      : `UPDATE users
         SET approval_status = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND role = 'merchant'
         RETURNING id, email, username, phone, role, approval_status, created_at, updated_at`;
    const result = await pool.query(sql, [approvalStatus, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: '商户账号不存在' });
    }

    // 审核状态变更后立即失效缓存，避免被拒商户仍能用 30s 内的旧缓存访问
    invalidateUserCache(Number(id));

    res.json({
      message: approvalStatus === 'approved' ? '商户审核已通过' : '商户审核已拒绝',
      merchant: result.rows[0]
    });
  } catch (error) {
    console.error('Update merchant approval error:', error);
    res.status(500).json({ error: '更新商户审核状态失败，请联系网站管理员' });
  }
};

// ========== 验证码相关接口 ==========

export const sendCodeValidation = [
  body('email').trim().isEmail().withMessage('请输入有效的邮箱地址'),
  body('purpose').isIn(['register', 'login', 'reset']).withMessage('用途参数无效')
];

export const loginByCodeValidation = [
  body('email').trim().isEmail().withMessage('请输入有效的邮箱地址'),
  body('code').isLength({ min: 6, max: 6 }).isNumeric().withMessage('请输入6位验证码')
];

export const forgotPasswordValidation = [
  body('email').trim().isEmail().withMessage('请输入有效的邮箱地址'),
  body('code').isLength({ min: 6, max: 6 }).isNumeric().withMessage('请输入6位验证码'),
  body('newPassword').matches(PASSWORD_REGEX).withMessage(PASSWORD_MSG)
];

// 发送验证码（注册/登录/重置密码通用）
export const sendCode = async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: errors.array()[0].msg,
      errors: errors.array()
    });
  }

  const { email, purpose } = req.body as { email: string; purpose: 'register' | 'login' | 'reset' };
  const normalizedEmail = email.trim().toLowerCase();
  const clientIp = req.ip || 'unknown';

  try {
    // IP 全局频率限制（同一 IP 每分钟最多 5 次）
    if (!canSendFromIp(clientIp)) {
      return res.status(429).json({ error: '发送过于频繁，请稍后再试' });
    }

    // 单邮箱 60 秒防刷
    if (!canSendCode(normalizedEmail, purpose)) {
      const seconds = getCooldownSeconds(normalizedEmail, purpose);
      return res.status(429).json({ error: `请${seconds}秒后再试`, cooldown: seconds });
    }

    // 注册时检查邮箱是否已存在
    if (purpose === 'register') {
      const userCheck = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
      if (userCheck.rows.length > 0) {
        return res.status(400).json({ error: '该邮箱已注册，请直接登录' });
      }
    }

    // 登录/重置密码：不泄露邮箱是否已注册，统一返回发送成功
    // 但只对已注册邮箱实际发送邮件
    let shouldSend = true;
    if (purpose === 'login' || purpose === 'reset') {
      const userCheck = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
      if (userCheck.rows.length === 0) {
        shouldSend = false;
      }
    }

    const code = generateCode();
    if (shouldSend) {
      await sendVerificationCode(normalizedEmail, code);
      storeCode(normalizedEmail, code, purpose);
    }
    recordIpSend(clientIp);

    res.json({ message: '验证码已发送到您的邮箱' });
  } catch (error) {
    console.error('Send code error:', error);
    res.status(500).json({ error: '验证码发送失败，请稍后重试' });
  }
};

// 邮件验证码登录
export const loginByCode = async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: errors.array()[0].msg,
      errors: errors.array()
    });
  }

  const { email, code } = req.body;
  const normalizedEmail = email.trim().toLowerCase();
  const clientIp = req.ip || 'unknown';

  // 检查 IP 是否被封锁
  if (isIpBlocked(clientIp)) {
    const remainingSeconds = getIpBlockRemainingSeconds(clientIp);
    return res.status(429).json({
      error: `登录失败次数过多，请在 ${Math.ceil(remainingSeconds / 60)} 分钟后重试`
    });
  }

  try {
    // 验证验证码（必须是 login 用途）
    if (!verifyCode(normalizedEmail, code, 'login')) {
      recordLoginFailure(clientIp);
      return res.status(401).json({ error: '邮箱或验证码错误' });
    }

    // 先查找用户（避免消费验证码后才发现用户不存在）
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
    if (result.rows.length === 0) {
      recordLoginFailure(clientIp);
      return res.status(401).json({ error: '邮箱或验证码错误' });
    }

    const user = result.rows[0];

    if (user.role === 'merchant' && user.approval_status !== 'approved') {
      const msg = user.approval_status === 'rejected'
        ? '账号审核未通过，已被拒绝，请联系管理员'
        : '商户账号正在审核中，请等待管理员审核通过';
      return res.status(403).json({ error: msg });
    }

    // 登录成功，清除失败记录
    clearLoginFailures(clientIp);

    // 签发 JWT
    const token = signToken({ userId: user.id, role: user.role, tokenVersion: user.token_version ?? 0 });

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        approval_status: user.approval_status
      }
    });
  } catch (error) {
    console.error('Login by code error:', error);
    res.status(500).json({ error: '登录失败，请联系网站管理员' });
  }
};

// 忘记密码（验证码重置）
export const forgotPassword = async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: errors.array()[0].msg,
      errors: errors.array()
    });
  }

  const { email, code, newPassword } = req.body;
  const normalizedEmail = email.trim().toLowerCase();

  try {
    // 先查找用户（避免消费验证码后才发现用户不存在）
    const userCheck = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (userCheck.rows.length === 0) {
      return res.status(400).json({ error: '验证码错误或已过期' });
    }

    // 验证验证码（必须是 reset 用途）
    if (!verifyCode(normalizedEmail, code, 'reset')) {
      return res.status(400).json({ error: '验证码错误或已过期' });
    }

    // 更新密码 + 递增 token_version 强制吊销旧 token
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const result = await pool.query(
      `UPDATE users
       SET password = $1, token_version = token_version + 1, updated_at = CURRENT_TIMESTAMP
       WHERE email = $2 RETURNING id`,
      [hashedPassword, normalizedEmail]
    );
    if (result.rows[0]?.id) {
      invalidateUserCache(result.rows[0].id);
    }

    res.json({ message: '密码重置成功，请使用新密码登录' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: '密码重置失败，请联系网站管理员' });
  }
};
