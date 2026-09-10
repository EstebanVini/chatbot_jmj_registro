import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  PUBLIC_URL: z.string().url(),
  N8N_WEBHOOK_URL: z.string().url(),
  PORTAL_API_KEY: z.string().min(32),
  COOKIE_SECRET: z.string().min(32),
  INSTANCE_NAME: z.string().default('jmj-web'),
  TRIP_BOT_ID: z.string(),
  ACTIVATION_PHRASE: z.string().default('Quiero registrarme para la JMJ Corea 2027'),
  DB_PATH: z.string().default(path.join(__dirname, '../../portal.db')),
  MEDIA_DIR: z.string().default(path.join(__dirname, '../../media')),
  MEDIA_TTL_DAYS: z.coerce.number().default(30),
  MAX_UPLOAD_MB: z.coerce.number().default(12),
});

const parseResult = envSchema.safeParse(process.env);

if (!parseResult.success) {
  console.error('❌ Environment validation failed:', parseResult.error.format());
  process.exit(1);
}

export const config = parseResult.data;
