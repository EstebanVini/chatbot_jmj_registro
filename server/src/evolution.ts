import { Request, Response } from 'express';
import { db } from './db';
import crypto from 'crypto';
import { bus } from './bus';
import { z } from 'zod';
import { config } from './config';

const sendTextSchema = z.object({
  number: z.string(),
  text: z.string(),
  delay: z.number().optional().default(0),
});

const sendMediaSchema = z.object({
  number: z.string(),
  mediatype: z.string(),
  mimetype: z.string(),
  media: z.string(),
  fileName: z.string(),
  caption: z.string().optional(),
});

export const requireApiKey = (req: Request, res: Response, next: Function) => {
  const apiKey = req.headers.apikey as string;
  if (!apiKey) {
    return res.status(401).json({ error: 'unauthorized', message: 'Missing apikey header' });
  }

  try {
    const a = Buffer.from(apiKey);
    const b = Buffer.from(config.PORTAL_API_KEY);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(401).json({ error: 'unauthorized', message: 'Invalid apikey' });
    }
  } catch (err) {
    return res.status(401).json({ error: 'unauthorized', message: 'Invalid apikey' });
  }

  next();
};

export const sendText = (req: Request, res: Response) => {
  const result = sendTextSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: 'bad_request', message: 'Invalid payload' });
  }

  const { number: sessionId, text, delay } = result.data;

  const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId);
  if (!session) {
    // Return 404 to n8n if session doesn't exist
    return res.status(404).json({ error: 'not_found', message: 'Session not found' });
  }

  const messageId = crypto.randomUUID();
  const now = new Date().toISOString();
  
  const processMessage = () => {
    try {
      db.exec('BEGIN TRANSACTION');
      const { maxSeq } = db.prepare('SELECT COALESCE(MAX(seq), 0) as maxSeq FROM messages WHERE session_id = ?').get(sessionId) as { maxSeq: number };
      const seq = maxSeq + 1;

      db.prepare(`
        INSERT INTO messages (id, session_id, seq, author, kind, text, created_at)
        VALUES (?, ?, ?, 'bot', 'texto', ?, ?)
      `).run(messageId, sessionId, seq, text, now);

      db.exec('COMMIT');

      const msgObj = {
        id: messageId,
        seq,
        author: 'bot',
        kind: 'texto',
        text,
        createdAt: now
      };

      bus.emitMessage(sessionId, msgObj);
    } catch (err) {
      db.exec('ROLLBACK');
      console.error(err);
    }
  };

  const actualDelay = Math.min(delay, 2000);
  if (actualDelay > 0) {
    bus.emitTyping(sessionId);
    setTimeout(processMessage, actualDelay);
  } else {
    processMessage();
  }

  res.status(200).json({ ok: true, messageId });
};

export const sendMedia = (req: Request, res: Response) => {
  const result = sendMediaSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: 'bad_request', message: 'Invalid payload' });
  }

  const { number: sessionId, media, caption } = result.data;

  const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'not_found', message: 'Session not found' });
  }

  const messageId = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    db.exec('BEGIN TRANSACTION');
    const { maxSeq } = db.prepare('SELECT COALESCE(MAX(seq), 0) as maxSeq FROM messages WHERE session_id = ?').get(sessionId) as { maxSeq: number };
    const seq = maxSeq + 1;

    // TODO: handle base64 uploads properly (Phase 6) - currently just trusting the media URL
    db.prepare(`
      INSERT INTO messages (id, session_id, seq, author, kind, text, media_url, created_at)
      VALUES (?, ?, ?, 'bot', 'archivo', ?, ?, ?)
    `).run(messageId, sessionId, seq, caption || null, media, now);

    db.exec('COMMIT');

    const msgObj = {
      id: messageId,
      seq,
      author: 'bot',
      kind: 'archivo',
      text: caption || null,
      media_url: media,
      createdAt: now
    };

    bus.emitMessage(sessionId, msgObj);
    res.status(200).json({ ok: true, messageId });
  } catch (err) {
    db.exec('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'internal_error' });
  }
};

const getBase64Schema = z.object({
  message: z.object({
    key: z.object({
      id: z.string()
    })
  }),
  convertToMp4: z.boolean().optional()
});

export const getBase64FromMediaMessage = (req: Request, res: Response) => {
  const result = getBase64Schema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: 'bad_request', message: 'Invalid payload' });
  }

  const messageId = result.data.message.key.id;

  const msg = db.prepare('SELECT media_id FROM messages WHERE id = ?').get(messageId) as { media_id: string | null } | undefined;
  if (!msg || !msg.media_id) {
    return res.status(200).json({ base64: "", mimetype: "" });
  }

  const media = db.prepare('SELECT path, mimetype FROM media WHERE id = ?').get(msg.media_id) as { path: string, mimetype: string } | undefined;
  
  if (!media) {
    return res.status(200).json({ base64: "", mimetype: "" });
  }

  import('fs').then(fs => {
    if (!fs.existsSync(media.path)) {
      return res.status(200).json({ base64: "", mimetype: "" });
    }
    const data = fs.readFileSync(media.path);
    res.status(200).json({
      base64: data.toString('base64'),
      mimetype: media.mimetype
    });
  }).catch(() => {
    res.status(200).json({ base64: "", mimetype: "" });
  });
};
