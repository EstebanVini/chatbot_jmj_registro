import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config';
import appRoutes from './routes/app';
import evolutionRoutes from './routes/evolution';
import { startMediaCleanupJob } from './media';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(cookieParser(config.COOKIE_SECRET));

// Healthcheck
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// App routes (consumed by browser)
app.use('/api', appRoutes);

// Evolution routes (consumed by n8n)
app.use('/message', evolutionRoutes);
app.use('/chat', evolutionRoutes);

startMediaCleanupJob();

const server = app.listen(config.PORT, () => {
  console.log(`🚀 Server running on port ${config.PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  server.close(() => {
    process.exit(0);
  });
});
