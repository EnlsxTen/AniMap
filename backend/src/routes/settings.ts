import express from 'express';
import {
  getAuthBg,
  updateAuthBg,
  deleteAuthBg,
  getCacheStats,
  getHomeFabSettings,
  updateHomeFabSettings,
  checkMissingThumbnails,
  regenerateMissingThumbnails,
} from '../controllers/settingsController';
import { authMiddleware, requireRole } from '../middleware/auth';
import { upload, processUploadedFile } from '../middleware/upload';

const router = express.Router();

// 公开接口
router.get('/auth-bg', getAuthBg);
router.get('/home-fab', getHomeFabSettings);

// 管理员接口
// （B站同步 / 异地备份 / AI 摘要已迁移为插件，见 /api/plugins）
router.put('/auth-bg', authMiddleware, requireRole(['admin']), upload.single('image'), processUploadedFile('image'), updateAuthBg);
router.delete('/auth-bg', authMiddleware, requireRole(['admin']), deleteAuthBg);
router.get('/cache-stats', authMiddleware, requireRole(['admin']), getCacheStats);
router.put('/home-fab', authMiddleware, requireRole(['admin']), updateHomeFabSettings);
router.get('/thumbnails/check', authMiddleware, requireRole(['admin']), checkMissingThumbnails);
router.post('/thumbnails/regenerate', authMiddleware, requireRole(['admin']), regenerateMissingThumbnails);

export default router;
