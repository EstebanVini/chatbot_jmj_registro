import { Router } from 'express';
import { createSession, getSession, deleteSession, createNewSession } from '../sessions';
import { streamMessages, postMessage, messageUploadMiddleware } from '../messages';
import { getMedia } from '../media';

const router = Router();

router.post('/session', createSession);
router.get('/session', getSession);
router.delete('/session', deleteSession);
router.post('/session/nueva', createNewSession);

router.get('/stream', streamMessages);
router.post('/messages', messageUploadMiddleware, postMessage);
router.get('/media/:id', getMedia);

export default router;
