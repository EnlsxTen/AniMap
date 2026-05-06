import express from 'express';
import { toggleFavorite, getMyFavorites, getMyFavoriteKeys, setReminderEnabled } from '../controllers/favoriteController';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();

router.post('/toggle', authMiddleware, toggleFavorite);
router.get('/my', authMiddleware, getMyFavorites);
router.get('/keys', authMiddleware, getMyFavoriteKeys);
router.patch('/:id/reminder', authMiddleware, setReminderEnabled);

export default router;
