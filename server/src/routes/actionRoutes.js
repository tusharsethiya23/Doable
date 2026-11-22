// Routes under /api/actions (login required): decide on actions waiting for approval.
import { Router } from 'express';
import { z } from 'zod';
import { decide } from '../controllers/actionController.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const decisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  input: z.record(z.string(), z.unknown()).optional(), // edited tool input; validated against the tool's schema later
});

router.post('/:id/decision', requireAuth, validate(decisionSchema), decide);

export default router;
