import express from 'express';
import cors from 'cors';
import { authRoutes } from './routes/auth.js';
import { inviteRoutes } from './routes/invites.js';
import { groupRoutes } from './routes/groups.js';
import { resetRoutes } from './routes/resets.js';
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
  // Mount order matters: reset-password is unauthenticated, and groupRoutes
  // applies requireAuth router-wide on the shared /api mount — any router with
  // unauthenticated /api routes must be mounted before groupRoutes.
  app.use('/api', resetRoutes(db));
  app.use('/api', groupRoutes(db));

  return app;
}
