import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { openDb, type Db } from '../src/db.js';
import { writeLog } from '../src/routes/codebook.js';

export interface SeedKind { id: string; label: string; category: string; type: 'question' | 'other' }
export interface Seed { kinds: SeedKind[] }
export interface SeedSummary { added: number; updated: number; unchanged: number }

interface Row { id: string; label: string; category: string; type: string }

// Upsert by id: insert missing kinds, update label/category/type of existing
// ones, log one `seed` entry per change (user NULL). Never deletes.
export function seedCodebook(db: Db, groupId: number, seed: Seed): SeedSummary {
  return db.transaction((): SeedSummary => {
    const summary: SeedSummary = { added: 0, updated: 0, unchanged: 0 };
    const get = db.prepare('SELECT id, label, category, type FROM codebook_kinds WHERE group_id = ? AND id = ?');
    for (const k of seed.kinds) {
      const before = get.get(groupId, k.id) as Row | undefined;
      if (!before) {
        const pos = (db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM codebook_kinds WHERE group_id = ?').get(groupId) as { p: number }).p;
        db.prepare('INSERT INTO codebook_kinds (group_id, id, label, category, type, position) VALUES (?, ?, ?, ?, ?, ?)')
          .run(groupId, k.id, k.label, k.category, k.type, pos);
        writeLog(db, groupId, null, 'seed', k.id, null, k);
        summary.added++;
      } else if (before.label !== k.label || before.category !== k.category || before.type !== k.type) {
        db.prepare('UPDATE codebook_kinds SET label = ?, category = ?, type = ? WHERE group_id = ? AND id = ?')
          .run(k.label, k.category, k.type, groupId, k.id);
        writeLog(db, groupId, null, 'seed', k.id, before, k);
        summary.updated++;
      } else {
        summary.unchanged++;
      }
    }
    return summary;
  })();
}

function main(): void {
  const { values } = parseArgs({
    options: { db: { type: 'string' }, 'group-name': { type: 'string' }, seed: { type: 'string' } },
  });
  if (!values.db || !values['group-name'] || !values.seed) {
    console.error('usage: tsx scripts/seed-codebook.ts --db <path> --group-name "<name>" --seed <file>');
    process.exit(1);
  }
  const db = openDb(values.db);
  const group = db.prepare('SELECT id FROM groups WHERE name = ?').get(values['group-name']) as { id: number } | undefined;
  if (!group) {
    console.error(`no group named "${values['group-name']}"`);
    process.exit(1);
  }
  const seed = JSON.parse(readFileSync(values.seed, 'utf8')) as Seed;
  const s = seedCodebook(db, group.id, seed);
  console.log(`Seeded group "${values['group-name']}": ${s.added} added, ${s.updated} updated, ${s.unchanged} unchanged.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
