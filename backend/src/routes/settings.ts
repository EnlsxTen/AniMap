import express from 'express';
import { getAuthBg, updateAuthBg, deleteAuthBg } from '../controllers/settingsController';
import { authMiddleware, requireRole } from '../middleware/auth';
import { upload } from '../middleware/upload';

const router = express.Router();

// 公开接口
router.get('/auth-bg', getAuthBg);

// 管理员接口
router.put('/auth-bg', authMiddleware, requireRole(['admin']), upload.single('image'), updateAuthBg);
router.delete('/auth-bg', authMiddleware, requireRole(['admin']), deleteAuthBg);

export default router;
