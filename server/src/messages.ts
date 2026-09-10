import { Request, Response } from 'express';
import { db } from './db';
import crypto from 'crypto';
import { bus } from './bus';
import multer from 'multer';
import { config } from './config';
import fs from 'fs';
import path from 'path';
import { sendWebhook } from './outbound';

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const sessionId = req.signedCookies.jmj_sid;
    const dest = path.join(config.MEDIA_DIR, sessionId || 'unknown');
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    cb(null, crypto.randomUUID());
  }
});
const upload = multer({
  storage,
  limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024 }
});

export const streamMessages = (req: Request, res: Response) => {
  const sessionId = req.signedCookies.jmj_sid;
  if (!sessionId) {
    return res.status(401).send();
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const desde = parseInt(req.query.desde as string, 10);
  if (!isNaN(desde)) {
    const missedMessages = db.prepare(`
      SELECT id, seq, author, kind, text, created_at as createdAt
      FROM messages
      WHERE session_id = ? AND seq > ?
      ORDER BY seq ASC
    `).all(sessionId, desde);

    for (const msg of missedMessages as any[]) {
      res.write(`event: mensaje\ndata: ${JSON.stringify(msg)}\n\n`);
    }
  }

  bus.addClient(sessionId, res);
};

export const postMessage = (req: Request, res: Response) => {
  const sessionId = req.signedCookies.jmj_sid;
  if (!sessionId) {
    return res.status(401).json({ error: 'unauthorized', message: 'No hay sesión' });
  }

  const session = db.prepare('SELECT status FROM sessions WHERE id = ?').get(sessionId) as { status: string } | undefined;
  if (!session || session.status !== 'activa') {
    return res.status(409).json({ error: 'session_closed', message: 'La sesión está cerrada' });
  }

  const text = req.body.text || null;
  const file = req.file;

  if (!text && !file) {
    return res.status(400).json({ error: 'empty_message', message: 'Mensaje vacío' });
  }

  const messageId = crypto.randomUUID();
  const now = new Date().toISOString();
  
  let kind = 'texto';
  let mediaId = null;

  try {
    db.exec('BEGIN TRANSACTION');

    if (file) {
      kind = 'archivo';
      mediaId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO media (id, session_id, filename, mimetype, size_bytes, path, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(mediaId, sessionId, file.originalname, file.mimetype, file.size, file.path, now);
    }

    const { maxSeq } = db.prepare('SELECT COALESCE(MAX(seq), 0) as maxSeq FROM messages WHERE session_id = ?').get(sessionId) as { maxSeq: number };
    const seq = maxSeq + 1;

    db.prepare(`
      INSERT INTO messages (id, session_id, seq, author, kind, text, media_id, created_at)
      VALUES (?, ?, ?, 'persona', ?, ?, ?, ?)
    `).run(messageId, sessionId, seq, kind, text, mediaId, now);

    db.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(now, sessionId);

    db.exec('COMMIT');

    const msgObj = {
      id: messageId,
      seq,
      author: 'persona',
      kind,
      text,
      createdAt: now
    };

    res.status(202).json(msgObj);

    // Call webhook
    const emailObj = db.prepare('SELECT email FROM sessions WHERE id = ?').get(sessionId) as { email: string };
    sendWebhook({
      sessionId,
      messageId,
      email: emailObj.email,
      text,
      kind: kind as 'texto' | 'archivo'
    });

  } catch (err) {
    db.exec('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'internal_error', message: 'Error al guardar mensaje' });
  }
};

export const messageUploadMiddleware = upload.single('file');
