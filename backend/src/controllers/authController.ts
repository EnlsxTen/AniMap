import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { body, validationResult } from 'express-validator';
import pool from '../database/db';
import { sendVerificationCode, sendAdminReviewRequest } from '../utils/emailService';
import { generateCode, canSendCode, getCooldownSeconds, storeCode, verifyCode, canSendFromIp, recordIpSend, isIpBlocked, getIpBlockRemainingSeconds, recordLoginFailure, clearLoginFailures } from '../utils/codeStore';
import { AuthRequest, invalidateUserCache } from '../middleware/auth';
import { signToken } from '../utils/jwt';
import { removeImageSet } from '../utils/imageVariants';

// 密码强度：至少 8 位，且必须包含字母和数字（同时允许特殊字符）
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)[\S]{8,128}$/;
const PASSWORD_MSG = '密码至少 8 位，且必须同时包含字母和数字';

const toSafeUser = (user: any) => ({
  id: user.id,
  email: user.email,
  username: user.username,
  phone: user.phone,
  role: user.role,
  approval_status: user.approval_status,
  avatar_url: user.avatar_url,
  created_at: user.created_at,
  updated_at: user.updated_at,
});

const toAdminUser = (user: any) => ({
  ...toSafeUser(user),
  analytics: {
    total_duration_seconds: Number(user.total_duration_seconds || 0),
    visit_count: Number(user.visit_count || 0),
    last_seen_at: user.last_seen_at || null,
    last_ip: user.last_ip || null,
    last_ip_location: user.last_ip_location || null,
    last_device_type: user.last_device_type || null,
    last_page_path: user.last_page_path || null,
  },
});

const removeUploadedFile = (url?: string | null) => {
  removeImageSet(url);
};

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

export const changePasswordValidation = [
  body('currentPassword').notEmpty().withMessage('请输入当前密码'),
  body('newPassword').matches(PASSWORD_REGEX).withMessage(PASSWORD_MSG),
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
      'INSERT INTO users (email, password, username, phone, role, approval_status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, username, phone, role, approval_status, avatar_url, token_version, created_at',
      [normalizedEmail, hashedPassword, normalizedUsername, normalizedPhone, normalizedUserType, approvalStatus]
    );

    const user = result.rows[0];

    if (user.role === 'merchant') {
      // 通知管理员有新商户注册待审核（fire-and-forget）
      sendAdminReviewRequest({ type: '商户注册', submitterName: user.username, itemName: user.email });
      return res.status(201).json({
        message: '商户注册申请已提交，审核通过后即可登录',
        requiresApproval: true,
        user: toSafeUser(user)
      });
    }

    // Generate JWT
    const token = signToken({ userId: user.id, role: user.role, tokenVersion: user.token_version ?? 0 });

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: toSafeUser(user)
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
      user: toSafeUser(user)
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
      'SELECT id, email, username, phone, role, approval_status, avatar_url, created_at FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: '邮箱或验证码错误' });
    }

    res.json({ user: toSafeUser(result.rows[0]) });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getAdminUsers = async (_req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT
         u.id,
         u.email,
         u.username,
         u.phone,
         u.role,
         u.approval_status,
         u.avatar_url,
         u.created_at,
         u.updated_at,
         ua.total_duration_seconds,
         ua.visit_count,
         ua.last_seen_at,
         ua.last_ip,
         ua.last_ip_location,
         ua.last_device_type,
         ua.last_page_path
       FROM users u
       LEFT JOIN user_analytics ua ON ua.user_id = u.id
       ORDER BY u.created_at DESC
       LIMIT 500`
    );

    res.json({ users: result.rows.map(toAdminUser) });
  } catch (error) {
    console.error('Get admin users error:', error);
    res.status(500).json({ error: '获取用户列表失败' });
  }
};

export const changePassword = async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: errors.array()[0].msg,
      errors: errors.array()
    });
  }

  const userId = req.userId;
  const { currentPassword, newPassword } = req.body;

  if (!userId) {
    return res.status(401).json({ error: '未登录' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: '用户不存在或已被删除' });
    }

    const user = result.rows[0];
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    if (!isValidPassword) {
      return res.status(400).json({ error: '当前密码不正确' });
    }

    const samePassword = await bcrypt.compare(newPassword, user.password);
    if (samePassword) {
      return res.status(400).json({ error: '新密码不能和当前密码相同' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const updateResult = await pool.query(
      `UPDATE users
       SET password = $1, token_version = token_version + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, email, username, phone, role, approval_status, avatar_url, token_version, created_at`,
      [hashedPassword, userId]
    );

    const updatedUser = updateResult.rows[0];
    invalidateUserCache(userId);
    const token = signToken({
      userId: updatedUser.id,
      role: updatedUser.role,
      tokenVersion: updatedUser.token_version ?? 0
    });

    res.json({
      message: '密码已更新',
      token,
      user: toSafeUser(updatedUser)
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: '密码修改失败，请稍后重试' });
  }
};

export const updateAvatar = async (req: AuthRequest, res: Response) => {
  const userId = req.userId;

  if (!userId) {
    if (req.file) removeUploadedFile(`/uploads/${req.file.filename}`);
    return res.status(401).json({ error: '未登录' });
  }

  if (!req.file) {
    return res.status(400).json({ error: '请选择要上传的头像图片' });
  }

  const avatarUrl = `/uploads/${req.file.filename}`;

  try {
    const oldResult = await pool.query('SELECT avatar_url FROM users WHERE id = $1', [userId]);
    if (oldResult.rows.length === 0) {
      removeUploadedFile(avatarUrl);
      return res.status(401).json({ error: '用户不存在或已被删除' });
    }

    const oldAvatarUrl = oldResult.rows[0].avatar_url;
    const updateResult = await pool.query(
      `UPDATE users
       SET avatar_url = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, email, username, phone, role, approval_status, avatar_url, created_at`,
      [avatarUrl, userId]
    );

    if (oldAvatarUrl && oldAvatarUrl !== avatarUrl) {
      removeUploadedFile(oldAvatarUrl);
    }

    res.json({
      message: '头像已更新',
      user: toSafeUser(updateResult.rows[0])
    });
  } catch (error) {
    removeUploadedFile(avatarUrl);
    console.error('Update avatar error:', error);
    res.status(500).json({ error: '头像更新失败，请稍后重试' });
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
    if (approvalStatus === 'rejected') {
      // 拒绝商户注册申请：直接删记录而非仅打标记，释放邮箱供重新注册。
      // 拒绝流程不发邮件通知，用户唯一能感知的方式就是"重新注册"，
      // 若邮箱被 rejected 记录永久占用会导致其卡在"已注册但登录不了"的死循环。
      const result = await pool.query(
        `DELETE FROM users WHERE id = $1 AND role = 'merchant'
         RETURNING id, email, username, phone, role, created_at`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: '商户账号不存在' });
      }

      invalidateUserCache(Number(id));

      return res.json({
        message: '商户审核已拒绝，账号已移除，该邮箱可重新注册',
        merchant: { ...result.rows[0], approval_status: 'rejected' as const },
      });
    }

    const result = await pool.query(
      `UPDATE users
       SET approval_status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND role = 'merchant'
       RETURNING id, email, username, phone, role, approval_status, created_at, updated_at`,
      [approvalStatus, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: '商户账号不存在' });
    }

    // 审核状态变更后立即失效缓存，避免被拒商户仍能用 30s 内的旧缓存访问
    invalidateUserCache(Number(id));

    res.json({
      message: '商户审核已通过',
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
      user: toSafeUser(user)
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

// 管理员删除指定用户账号（不能删自己或其他管理员）
export const deleteAdminUser = async (req: AuthRequest, res: Response) => {
  const targetId = Number(req.params.id);
  const adminId = req.userId;

  if (!targetId || isNaN(targetId)) return res.status(400).json({ error: '无效的用户 ID' });
  if (targetId === adminId) return res.status(403).json({ error: '不能删除自己的账号' });

  try {
    const userRes = await pool.query('SELECT id, role, username FROM users WHERE id = $1', [targetId]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: '用户不存在' });
    if (userRes.rows[0].role === 'admin') return res.status(403).json({ error: '不能删除管理员账号' });

    await pool.query('DELETE FROM users WHERE id = $1', [targetId]);
    invalidateUserCache(targetId);
    res.json({ message: `用户 ${userRes.rows[0].username} 已删除` });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: '删除用户失败' });
  }
};
