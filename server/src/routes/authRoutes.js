// Routes under /api/auth (public). Login/register are rate-limited to slow down password guessing.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { register, login, refresh, logout, googleStart, googleCallback } from '../controllers/authController.js';
import { validate } from '../middleware/validate.js';
import { registerSchema, loginSchema } from '../validators/authSchemas.js';
import { env } from '../config/env.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 20, // max attempts per IP in that window
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts, please try again later' },
  skip: () => env.NODE_ENV === 'test', // automated tests register many users from one IP
});

router.post('/register', authLimiter, validate(registerSchema), register);
router.post('/login', authLimiter, validate(loginSchema), login);
router.post('/refresh', refresh);
router.post('/logout', logout);
// "Sign in with Google": browser navigations (not API calls), so they redirect instead of returning JSON
router.get('/google', authLimiter, googleStart);
router.get('/google/callback', googleCallback);

export default router;
