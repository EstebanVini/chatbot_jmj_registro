import { config } from './config';
import { db } from './db';
import { bus } from './bus';
import crypto from 'crypto';

interface WebhookPayload {
  sessionId: string;
  messageId: string;
  email: string;
  text?: string | null;
  kind: 'texto' | 'archivo';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const sendWebhook = (payload: WebhookPayload) => {
  const body = {
    instance: config.INSTANCE_NAME,
    event: 'messages.upsert',
    server_url: config.PUBLIC_URL,
    apikey: config.PORTAL_API_KEY,
    sender: config.TRIP_BOT_ID,
    data: {
      key: {
        remoteJid: `${payload.sessionId}@web.jmj`,
        fromMe: false,
        id: payload.messageId,
      },
      message: payload.kind === 'archivo' 
        ? { imageMessage: { caption: payload.text || '' } }
        : { conversation: payload.text || '' },
      messageType: payload.kind === 'archivo' ? 'imageMessage' : 'conversation',
      pushName: payload.email,
      email: payload.email,
    },
  };

  const attemptRequest = async (retriesLeft: number, delay: number): Promise<boolean> => {
    try {
      const response = await fetch(config.N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return true;
    } catch (err) {
      if (retriesLeft > 0) {
        console.warn(`Webhook failed, retrying in ${delay}ms...`);
        await sleep(delay);
        return attemptRequest(retriesLeft - 1, delay === 1000 ? 3000 : 3000);
      }
      console.error('Webhook failed after retries:', err);
      return false;
    }
  };

  // Run in background without awaiting
  attemptRequest(2, 1000).then((success) => {
    if (!success) {
      const botMsgId = crypto.randomUUID();
      const now = new Date().toISOString();
      const errorText = 'Hubo un problema de conexión con el sistema. Por favor, intente de nuevo.';
      
      try {
        db.exec('BEGIN TRANSACTION');
        const { maxSeq } = db.prepare('SELECT COALESCE(MAX(seq), 0) as maxSeq FROM messages WHERE session_id = ?').get(payload.sessionId) as { maxSeq: number };
        const seq = maxSeq + 1;

        db.prepare(`
          INSERT INTO messages (id, session_id, seq, author, kind, text, created_at)
          VALUES (?, ?, ?, 'bot', 'texto', ?, ?)
        `).run(botMsgId, payload.sessionId, seq, errorText, now);
        
        db.exec('COMMIT');

        bus.emitMessage(payload.sessionId, {
          id: botMsgId,
          seq,
          author: 'bot',
          kind: 'texto',
          text: errorText,
          createdAt: now
        });
      } catch (e) {
        if (db.inTransaction) db.exec('ROLLBACK');
        console.error('Failed to insert error message', e);
      }
    }
  });
};
