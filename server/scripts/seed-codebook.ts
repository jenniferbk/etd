import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { openDb, type Db } from '../src/db.js';
import { writeLog } from '../src/routes/codebook.js';

export interface SeedKind { id: string; label: string; category: string; type: 'question' | 'other' }
export interface Seed { kinds: SeedKind[] }
export interface SeedSummary { added: number; updated: number; unchanged: number }

interface Row { id: string; label: string; category: string; type: string }

const labelKey = (label: string) => label.trim().toLowerCase();

/** Labels the seed would leave shared by two unmerged kinds (labels are unique
 *  per group, case-insensitive, among unmerged kinds). Checked against the
 *  codebook as it would be after the seed, so a seed that relabels a kind and
 *  reuses its old label elsewhere is fine. */
export function seedLabelCollisions(db: Db, groupId: number, seed: Seed): { label: string; ids: string[] }[] {
  const rows = db
    .prepare('SELECT id, label, merged_into AS mergedInto FROM codebook_kinds WHERE group_id = ?')
    .all(groupId) as { id: string; label: string; mergedInto: string | null }[];
  const finalLabel = new Map<string, string>();
  const merged = new Set<string>();
  for (const r of rows) {
    finalLabel.set(r.id, r.label);
    if (r.mergedInto !== null) merged.add(r.id);
  }
  for (const k of seed.kinds) finalLabel.set(k.id, k.label);
  const seedKeys = new Set(seed.kinds.map((k) => labelKey(k.label)));
  const byLabel = new Map<string, string[]>();
  for (const [id, label] of finalLabel) {
    if (merged.has(id) || !seedKeys.has(labelKey(label))) continue;
    const ids = byLabel.get(labelKey(label)) ?? [];
    ids.push(id);
    byLabel.set(labelKey(label), ids);
  }
  return [...byLabel].filter(([, ids]) => ids.length > 1).map(([label, ids]) => ({ label, ids }));
}

// Upsert by id: insert missing kinds, update label/category/type of existing
// ones, log one `seed` entry per change (user NULL). Never deletes. Throws,
// changing nothing, when a seed label would collide with another unmerged kind.
export function seedCodebook(db: Db, groupId: number, seed: Seed): SeedSummary {
  return db.transaction((): SeedSummary => {
    const collisions = seedLabelCollisions(db, groupId, seed);
    if (collisions.length > 0) {
      const list = collisions.map((c) => `  "${c.label}": ${c.ids.join(', ')}`).join('\n');
      throw new Error(`Seed not applied: these labels would be held by more than one unmerged kind:\n${list}`);
    }
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
  let s: SeedSummary;
  try {
    s = seedCodebook(db, group.id, seed);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
  console.log(`Seeded group "${values['group-name']}": ${s.added} added, ${s.updated} updated, ${s.unchanged} unchanged.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
