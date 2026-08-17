import express from 'express';
import cors from 'cors';
import { resolve } from 'node:path';
import { authRoutes } from './routes/auth.js';
import { inviteRoutes } from './routes/invites.js';
import { groupRoutes } from './routes/groups.js';
import { resetRoutes } from './routes/resets.js';
import { diagramRoutes } from './routes/diagrams.js';
import type { Db } from './db.js';

export function createApp(db: Db, opts: { staticDir?: string } = {}): express.Express {
  const app = express();
  // Documented deployments (Cloudflare Tunnel, Tailscale Funnel — see
  // server/README.md Section 5) put exactly one local proxy in front of this
  // process, which sets X-Forwarded-For. Without this, Express's default
  // trust proxy=false makes req.ip resolve to the tunnel daemon's address,
  // so express-rate-limit would bucket the whole team behind one IP.
  app.set('trust proxy', 1);
  app.use(cors());
  app.use(express.json({ limit: '25mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/auth', authRoutes(db));
  app.use('/api', inviteRoutes(db));
  // Mount order matters: reset-password is unauthenticated, and groupRoutes
  // and diagramRoutes both apply requireAuth router-wide on the shared /api
  // mount — any router with unauthenticated /api routes must be mounted
  // before any router that applies requireAuth router-wide.
  app.use('/api', resetRoutes(db));
  app.use('/api', diagramRoutes(db));
  app.use('/api', groupRoutes(db));

  // Catch-all so unknown /api routes return JSON, not Express's HTML 404 —
  // must come after every router above.
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not found' });
  });

  // Optional same-origin frontend hosting (campus-VPN deployment):
  // static assets plus an SPA fallback for client-side routes. Mounted after
  // all /api handlers so API behavior is unchanged.
  if (opts.staticDir) {
    const staticDir = resolve(opts.staticDir);
    app.use(express.static(staticDir));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api/')) {
        next();
        return;
      }
      res.sendFile(resolve(staticDir, 'index.html'));
    });
  }

  // Final error handler (4-arg signature required by Express to be
  // recognized as an error middleware). Must be last. Ensures malformed
  // request bodies and unexpected throws also come back as JSON, never
  // Express's default HTML handler (which includes a stack trace since
  // NODE_ENV is never set to "production" in local/dev runs).
  // _next is unused but required: Express detects error middleware by arity
  // (fn.length === 4), so it must stay in the signature.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof SyntaxError && 'status' in err && (err as { status?: number }).status === 400 && 'body' in err) {
      res.status(400).json({ error: 'invalid JSON body' });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'internal server error' });
  });

  return app;
}
