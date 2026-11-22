// Routes under /api/users (all require a logged-in user).
import { Router } from 'express';
import { getMe, getMyUsage, updateMe, deleteMe } from '../controllers/userController.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { updateProfileSchema, deleteAccountSchema } from '../validators/authSchemas.js';

const router = Router();

router.use(requireAuth);
router.get('/me', getMe);
router.get('/me/usage', getMyUsage);
router.patch('/me', validate(updateProfileSchema), updateMe);
router.delete('/me', validate(deleteAccountSchema), deleteMe); // needs password (or email) confirmation

export default router;
