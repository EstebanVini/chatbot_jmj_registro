import { Router } from 'express';
import { sendText, sendMedia, requireApiKey, getBase64FromMediaMessage } from '../evolution';

const router = Router();

router.use(requireApiKey);
router.post('/sendText/:instance', sendText);
router.post('/sendMedia/:instance', sendMedia);
router.post('/getBase64FromMediaMessage/:instance', getBase64FromMediaMessage);

export default router;
