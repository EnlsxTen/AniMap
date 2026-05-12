import express from 'express';
import {
  createEvent,
  getPublicEvents,
  getPendingEvents,
  getMerchantEvents,
  getEventById,
  updateEvent,
  deleteEvent,
  updateEventStatus,
  createEventValidation
} from '../controllers/eventController';
import { authMiddleware, requireRole, optionalAuth } from '../middleware/auth';
import { upload, processUploadedFile } from '../middleware/upload';

const router = express.Router();

// Public routes (specific paths first)
router.get('/public', getPublicEvents);

// Protected routes (merchant) - specific paths before dynamic params
router.get('/merchant/my-events', authMiddleware, getMerchantEvents);
router.post('/', authMiddleware, upload.single('poster'), processUploadedFile('poster'), createEventValidation, createEvent);

// Admin routes
router.get('/admin/pending', authMiddleware, requireRole(['admin']), getPendingEvents);
router.patch('/:id/status', authMiddleware, requireRole(['admin']), updateEventStatus);

// Dynamic routes (must be last)
router.get('/:id', optionalAuth, getEventById);
router.put('/:id', authMiddleware, upload.single('poster'), processUploadedFile('poster'), createEventValidation, updateEvent);
router.delete('/:id', authMiddleware, deleteEvent);

export default router;
