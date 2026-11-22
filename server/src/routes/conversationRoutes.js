// Routes under /api/conversations (all require login). Sending messages is rate-limited per user to control AI cost.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  listConversations,
  createConversation,
  getConversation,
  renameConversation,
  removeConversation,
  sendMessage,
  continueConversation,
} from '../controllers/conversationController.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { sendMessageSchema, renameConversationSchema } from '../validators/chatSchemas.js';

const router = Router();

const messageLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 30, // max messages per user per minute (SRS NFR-10)
  keyGenerator: (req) => req.user.id, // count per user, not per IP
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, message: 'You are sending messages too quickly. Please wait a moment.' },
});

router.use(requireAuth);

router.get('/', listConversations);
router.post('/', createConversation);
router.get('/:id', getConversation);
router.patch('/:id', validate(renameConversationSchema), renameConversation);
router.delete('/:id', removeConversation);
router.post('/:id/messages', messageLimiter, validate(sendMessageSchema), sendMessage);
router.post('/:id/continue', messageLimiter, continueConversation); // after approving/rejecting actions

export default router;
