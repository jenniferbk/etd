import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { bootstrap } from './bootstrap.js';
import { createApp } from './app.js';
import { openDb } from './db.js';

const dbPath = process.env.ETD_DB_PATH ?? './data/etd.sqlite';
mkdirSync(dirname(dbPath), { recursive: true });
const db = openDb(dbPath);

await bootstrap(db, {
  adminEmail: process.env.ETD_ADMIN_EMAIL,
  adminPassword: process.env.ETD_ADMIN_PASSWORD,
  initialGroup: process.env.ETD_INITIAL_GROUP,
});

const port = Number(process.env.PORT ?? 8787);
const app = createApp(db, { staticDir: process.env.ETD_STATIC_DIR });
const server = app.listen(port, () => {
  console.log(`etd-server listening on :${port} (db: ${dbPath})`);
});

// Save any live-edited diagrams before exiting (launchctl unload, auto-update
// restarts). Open event streams would otherwise keep close() waiting forever.
function shutdown(signal: string) {
  console.log(`${signal}: saving open diagrams`);
  (app.locals.live as import('./live.js').LiveRooms).flushAll();
  server.closeAllConnections();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
