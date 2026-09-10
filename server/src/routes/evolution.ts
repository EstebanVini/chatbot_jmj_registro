import { Router } from 'express';
import { sendText, sendMedia, requireApiKey } from '../evolution';

const router = Router();

router.use(requireApiKey);
router.post('/sendText/:instance', sendText);
router.post('/sendMedia/:instance', sendMedia);

export default router;
