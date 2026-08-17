import express from 'express';
import cors from 'cors';
import { authRoutes } from './routes/auth.js';
import { inviteRoutes } from './routes/invites.js';
import type { Db } from './db.js';

export function createApp(db: Db): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '25mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/auth', authRoutes(db));
  app.use('/api', inviteRoutes(db));

  return app;
}
