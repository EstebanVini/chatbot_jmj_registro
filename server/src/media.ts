import { Request, Response } from 'express';
import { db } from './db';
import { config } from './config';
import fs from 'fs';

export const getMedia = (req: Request, res: Response) => {
  const sessionId = req.signedCookies.jmj_sid;
  const mediaId = req.params.id;

  if (!sessionId) {
    return res.status(404).send(); // Pretend not found to not reveal existence
  }

  const mediaRow = db.prepare('SELECT path, session_id, mimetype FROM media WHERE id = ?').get(mediaId) as { path: string, session_id: string, mimetype: string } | undefined;

  if (!mediaRow || mediaRow.session_id !== sessionId) {
    return res.status(404).send();
  }

  if (fs.existsSync(mediaRow.path)) {
    res.setHeader('Content-Type', mediaRow.mimetype);
    res.sendFile(mediaRow.path);
  } else {
    res.status(404).send();
  }
};

export const startMediaCleanupJob = () => {
  // Run every 6 hours
  setInterval(() => {
    try {
      console.log('Running media cleanup job...');
      const cutoff = new Date(Date.now() - config.MEDIA_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const oldMedia = db.prepare('SELECT id, path FROM media WHERE created_at < ?').all(cutoff) as { id: string, path: string }[];
      
      let deleted = 0;
      for (const media of oldMedia) {
        if (fs.existsSync(media.path)) {
          fs.unlinkSync(media.path);
        }
        db.prepare('DELETE FROM media WHERE id = ?').run(media.id);
        deleted++;
      }
      
      if (deleted > 0) {
        console.log(`Cleanup job finished: deleted ${deleted} old media files.`);
      }
    } catch (e) {
      console.error('Error during media cleanup job:', e);
    }
  }, 6 * 60 * 60 * 1000);
};
