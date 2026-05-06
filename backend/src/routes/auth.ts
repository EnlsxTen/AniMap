import express from 'express';
import {
  register,
  login,
  getProfile,
  getPendingMerchants,
  updateMerchantApproval,
  registerValidation,
  loginValidation,
  updateMerchantApprovalValidation,
  sendCode,
  sendCodeValidation,
  loginByCode,
  loginByCodeValidation,
  forgotPassword,
  forgotPasswordValidation
} from '../controllers/authController';
import { authMiddleware, requireRole } from '../middleware/auth';

const router = express.Router();

router.post('/register', registerValidation, register);
router.post('/login', loginValidation, login);
router.post('/send-code', sendCodeValidation, sendCode);
router.post('/login-by-code', loginByCodeValidation, loginByCode);
router.post('/forgot-password', forgotPasswordValidation, forgotPassword);
router.get('/profile', authMiddleware, getProfile);
router.get('/admin/pending-merchants', authMiddleware, requireRole(['admin']), getPendingMerchants);
router.patch('/admin/merchants/:id/approval', authMiddleware, requireRole(['admin']), updateMerchantApprovalValidation, updateMerchantApproval);

export default router;
