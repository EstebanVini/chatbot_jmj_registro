import { Router } from 'express';
import { createSession, getSession, deleteSession, createNewSession } from '../sessions';

const router = Router();

router.post('/session', createSession);
router.get('/session', getSession);
router.delete('/session', deleteSession);
router.post('/session/nueva', createNewSession);

export default router;
