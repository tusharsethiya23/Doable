// Routes under /api/admin — only for users with the admin role (set via ADMIN_EMAILS).
import { Router } from 'express';
import { z } from 'zod';
import { stats, users, patchUser } from '../controllers/adminController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const updateUserSchema = z
  .object({
    disabled: z.boolean().optional(),
    monthlyBudgetUsd: z.number().min(0).max(10000).nullable().optional(), // null = use the default budget
  })
  .strict();

router.use(requireAuth, requireRole('admin'));
router.get('/stats', stats);
router.get('/users', users);
router.patch('/users/:id', validate(updateUserSchema), patchUser);

export default router;
