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
createApp(db, { staticDir: process.env.ETD_STATIC_DIR }).listen(port, () => {
  console.log(`etd-server listening on :${port} (db: ${dbPath})`);
});
