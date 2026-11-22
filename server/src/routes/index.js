// Main API router: mounts every feature router under /api.
import { Router } from 'express';
import authRoutes from './authRoutes.js';
import userRoutes from './userRoutes.js';
import conversationRoutes from './conversationRoutes.js';
import activityRoutes from './activityRoutes.js';
import integrationRoutes from './integrationRoutes.js';
import actionRoutes from './actionRoutes.js';

const router = Router();

// Quick check that the server is up (useful for hosting health checks)
router.get('/health', (_req, res) => res.json({ success: true, status: 'ok', time: new Date().toISOString() }));

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/conversations', conversationRoutes);
router.use('/activity', activityRoutes);
router.use('/integrations', integrationRoutes);
router.use('/actions', actionRoutes);

export default router;
