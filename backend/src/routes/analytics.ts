import express from 'express';
import rateLimit from 'express-rate-limit';
import { recordAnalyticsHeartbeat } from '../controllers/analyticsController';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();

const heartbeatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: '统计上报过于频繁' },
});

router.post('/heartbeat', authMiddleware, heartbeatLimiter, recordAnalyticsHeartbeat);

export default router;
