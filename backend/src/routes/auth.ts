import express from 'express';
import rateLimit from 'express-rate-limit';
import {
  register,
  login,
  getProfile,
  getAdminUsers,
  changePassword,
  updateAvatar,
  getPendingMerchants,
  updateMerchantApproval,
  registerValidation,
  loginValidation,
  changePasswordValidation,
  updateMerchantApprovalValidation,
  sendCode,
  sendCodeValidation,
  loginByCode,
  loginByCodeValidation,
  forgotPassword,
  forgotPasswordValidation,
  deleteAdminUser,
} from '../controllers/authController';
import { authMiddleware, requireRole } from '../middleware/auth';
import { upload, processUploadedFile } from '../middleware/upload';

const router = express.Router();

// 登录/注册接口的严格限流：每 IP 每 15 分钟最多 20 次
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: '操作过于频繁，请稍后再试' },
});

// 发验证码接口的限流：每 IP 每分钟最多 10 次（codeStore 内部还有更严格的 5 次/分钟兜底）
const codeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: '发送过于频繁，请稍后再试' },
});

router.post('/register', authLimiter, registerValidation, register);
router.post('/login', authLimiter, loginValidation, login);
router.post('/send-code', codeLimiter, sendCodeValidation, sendCode);
router.post('/login-by-code', authLimiter, loginByCodeValidation, loginByCode);
router.post('/forgot-password', authLimiter, forgotPasswordValidation, forgotPassword);
router.get('/profile', authMiddleware, getProfile);
router.patch('/change-password', authMiddleware, authLimiter, changePasswordValidation, changePassword);
router.put('/avatar', authMiddleware, upload.single('avatar'), processUploadedFile('avatar'), updateAvatar);
router.get('/admin/users', authMiddleware, requireRole(['admin']), getAdminUsers);
router.get('/admin/pending-merchants', authMiddleware, requireRole(['admin']), getPendingMerchants);
router.patch('/admin/merchants/:id/approval', authMiddleware, requireRole(['admin']), updateMerchantApprovalValidation, updateMerchantApproval);
router.delete('/admin/users/:id', authMiddleware, requireRole(['admin']), deleteAdminUser);

export default router;
