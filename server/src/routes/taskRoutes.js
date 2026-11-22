// Routes under /api/tasks (login required).
import { Router } from 'express';
import { z } from 'zod';
import { listTasks, updateTask, deleteTask } from '../controllers/taskController.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(requireAuth);
router.get('/', listTasks);
router.patch('/:id', validate(z.object({ enabled: z.boolean() })), updateTask); // pause / resume
router.delete('/:id', deleteTask);

export default router;
