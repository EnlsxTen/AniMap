import express from 'express';
import {
  createSession, createSessionValidation,
  getPublicSessions, getVenueSessions, getMySessions,
  getSessionById, updateSession, deleteSession,
  registerSession, cancelRegistration, getRegistrations,
} from '../controllers/sessionController';
import { authMiddleware, optionalAuth } from '../middleware/auth';

const router = express.Router();

router.get('/public', getPublicSessions);
router.get('/venue/:venueId', getVenueSessions);
router.get('/merchant/my-sessions', authMiddleware, getMySessions);
router.post('/', authMiddleware, createSessionValidation, createSession);
router.get('/:id', optionalAuth, getSessionById);
router.put('/:id', authMiddleware, createSessionValidation, updateSession);
router.delete('/:id', authMiddleware, deleteSession);
router.post('/:id/register', authMiddleware, registerSession);
router.delete('/:id/register', authMiddleware, cancelRegistration);
router.get('/:id/registrations', authMiddleware, getRegistrations);

export default router;
