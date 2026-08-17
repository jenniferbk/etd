import express from 'express';
import cors from 'cors';
import type { Db } from './db.js';

export function createApp(db: Db): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '25mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Routers are mounted here by later tasks.
  void db;

  return app;
}
