import express from 'express';
import {
  createVenue, createVenueValidation,
  getPublicVenues, getVenueById,
  getMerchantVenues, updateVenue, deleteVenue,
  getPendingVenues, updateVenueStatus,
  uploadNavPhotos, deleteNavPhoto,
} from '../controllers/venueController';
import { authMiddleware, requireRole, optionalAuth } from '../middleware/auth';
import { upload, uploadMultiple, processUploadedFile, processUploadedFiles } from '../middleware/upload';

const router = express.Router();

// 公开
router.get('/public', getPublicVenues);

// 商户
router.get('/merchant/my-venues', authMiddleware, getMerchantVenues);
router.post('/', authMiddleware, upload.single('cover'), processUploadedFile('cover'), createVenueValidation, createVenue);

// 管理员
router.get('/admin/pending', authMiddleware, requireRole(['admin']), getPendingVenues);
router.patch('/:id/status', authMiddleware, requireRole(['admin']), updateVenueStatus);

// 导航图片（需要登录，且只有 merchant/admin 才能上传）
router.post('/:id/nav-photos', authMiddleware, requireRole(['merchant', 'admin']), uploadMultiple.array('photos', 10), processUploadedFiles('photos'), uploadNavPhotos);
router.delete('/:id/nav-photos/:photoId', authMiddleware, deleteNavPhoto);

// 动态路由（放最后）
router.get('/:id', optionalAuth, getVenueById);
router.put('/:id', authMiddleware, upload.single('cover'), processUploadedFile('cover'), createVenueValidation, updateVenue);
router.delete('/:id', authMiddleware, deleteVenue);

export default router;
