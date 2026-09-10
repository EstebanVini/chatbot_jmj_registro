import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from './db';
import crypto from 'crypto';
import { sendWebhook } from './outbound';
import { config } from './config';

const sessionSchema = z.object({
  email: z.string().email().transform((val) => val.trim().toLowerCase()),
});

export const createSession = (req: Request, res: Response) => {
  const result = sessionSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: 'invalid_email', message: 'Correo inválido' });
  }

  const email = result.data.email;
  const sessionId = crypto.randomUUID();
  const now = new Date().toISOString();

  const insertSession = db.prepare(`
    INSERT INTO sessions (id, email, created_at, last_seen_at, status)
    VALUES (?, ?, ?, ?, 'activa')
  `);

  insertSession.run(sessionId, email, now, now);

  res.cookie('jmj_sid', sessionId, {
    httpOnly: true,
    signed: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 2592000000, // 30 days in ms
    path: '/',
  });

  const actMessageId = crypto.randomUUID();
  sendWebhook({
    sessionId,
    messageId: actMessageId,
    email,
    kind: 'texto',
    text: config.ACTIVATION_PHRASE
  });

  res.status(201).json({
    sessionId,
    email,
    status: 'activa',
  });
};

export const getSession = (req: Request, res: Response) => {
  const sessionId = req.signedCookies.jmj_sid;
  if (!sessionId) {
    return res.status(204).send();
  }

  const session = db.prepare('SELECT id as sessionId, email, status FROM sessions WHERE id = ?').get(sessionId);

  if (!session) {
    return res.status(204).send();
  }

  const messages = db.prepare(`
    SELECT id, seq, author, kind, text, created_at as createdAt
    FROM messages
    WHERE session_id = ?
    ORDER BY seq ASC
  `).all(sessionId);

  res.status(200).json({
    session,
    messages,
  });
};

export const deleteSession = (req: Request, res: Response) => {
  const sessionId = req.signedCookies.jmj_sid;
  if (sessionId) {
    db.prepare("UPDATE sessions SET status = 'cerrada' WHERE id = ?").run(sessionId);
    res.clearCookie('jmj_sid');
  }
  res.status(204).send();
};

export const createNewSession = (req: Request, res: Response) => {
  const oldSessionId = req.signedCookies.jmj_sid;
  if (!oldSessionId) {
    return res.status(400).json({ error: 'no_session', message: 'No hay sesión activa' });
  }

  const oldSession = db.prepare('SELECT email FROM sessions WHERE id = ?').get(oldSessionId) as { email: string } | undefined;
  
  if (!oldSession) {
    return res.status(400).json({ error: 'invalid_session', message: 'Sesión inválida' });
  }

  const email = oldSession.email;
  const sessionId = crypto.randomUUID();
  const now = new Date().toISOString();

  const insertSession = db.prepare(`
    INSERT INTO sessions (id, email, created_at, last_seen_at, status)
    VALUES (?, ?, ?, ?, 'activa')
  `);

  insertSession.run(sessionId, email, now, now);

  res.cookie('jmj_sid', sessionId, {
    httpOnly: true,
    signed: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 2592000000,
    path: '/',
  });

  const actMessageId = crypto.randomUUID();
  sendWebhook({
    sessionId,
    messageId: actMessageId,
    email,
    kind: 'texto',
    text: config.ACTIVATION_PHRASE
  });

  res.status(201).json({
    sessionId,
    email,
    status: 'activa',
  });
};
