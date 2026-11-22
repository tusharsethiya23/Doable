// Routes under /api/integrations. The Google callback is public (Google redirects the browser there; it is
// protected by the signed state + browser cookie instead); everything else needs a logged-in user.
import { Router } from 'express';
import { listIntegrations, connectGoogle, googleCallback, disconnect } from '../controllers/integrationController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/google/callback', googleCallback);

router.use(requireAuth);
router.get('/', listIntegrations);
router.post('/google/connect', connectGoogle);
router.delete('/google', disconnect);

export default router;
