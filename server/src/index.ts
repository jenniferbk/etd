import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createApp } from './app.js';
import { openDb } from './db.js';

const dbPath = process.env.ETD_DB_PATH ?? './data/etd.sqlite';
mkdirSync(dirname(dbPath), { recursive: true });
const db = openDb(dbPath);

const port = Number(process.env.PORT ?? 8787);
createApp(db).listen(port, () => {
  console.log(`etd-server listening on :${port} (db: ${dbPath})`);
});
