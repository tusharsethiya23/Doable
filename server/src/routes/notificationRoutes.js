// Routes under /api/notifications (login required).
import { Router } from 'express';
import { z } from 'zod';
import { listNotifications, markRead, streamNotifications } from '../controllers/notificationController.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(requireAuth);
router.get('/', listNotifications);
router.get('/stream', streamNotifications); // live updates (Server-Sent Events)
router.post('/read', validate(z.object({ ids: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).max(100).optional() })), markRead);

export default router;
