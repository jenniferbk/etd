import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import { getRole } from '../access.js';
import { packSnapshot, unpackSnapshot } from '../snapshots.js';
import type { Db } from '../db.js';

const snapshotSchema = z.record(z.string(), z.unknown());

interface DiagramRow {
  id: number;
  group_id: number;
  creator_id: number;
  title: string;
  current_version_id: number;
  updated_at: string;
}

export function diagramRoutes(db: Db): Router {
  const router = Router();
  router.use(requireAuth(db));

  function addVersion(diagramId: number, authorId: number, snapshot: unknown): number {
    const v = db
      .prepare('INSERT INTO diagram_versions (diagram_id, author_id, snapshot_gz) VALUES (?, ?, ?)')
      .run(diagramId, authorId, packSnapshot(snapshot));
    const versionId = Number(v.lastInsertRowid);
    db.prepare(`UPDATE diagrams SET current_version_id = ?, updated_at = datetime('now') WHERE id = ?`).run(
      versionId, diagramId,
    );
    return versionId;
  }

  function getDiagramForMember(
    req: import('express').Request, res: import('express').Response,
  ): DiagramRow | null {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'invalid diagram id' });
      return null;
    }
    const row = db.prepare('SELECT * FROM diagrams WHERE id = ?').get(id) as DiagramRow | undefined;
    if (!row) {
      res.status(404).json({ error: 'diagram not found' });
      return null;
    }
    if (getRole(db, req.user!.id, row.group_id) === null) {
      res.status(403).json({ error: 'not a member of this diagram\'s group' });
      return null;
    }
    return row;
  }

  router.post('/diagrams', (req, res) => {
    const parsed = z
      .object({ groupId: z.number().int(), title: z.string().trim().min(1), snapshot: snapshotSchema })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid request' });
      return;
    }
    const { groupId, title, snapshot } = parsed.data;
    if (getRole(db, req.user!.id, groupId) === null) {
      res.status(403).json({ error: 'not a member of this group' });
      return;
    }
    let id = 0;
    let currentVersionId = 0;
    db.transaction(() => {
      const d = db
        .prepare('INSERT INTO diagrams (group_id, creator_id, title) VALUES (?, ?, ?)')
        .run(groupId, req.user!.id, title);
      id = Number(d.lastInsertRowid);
      currentVersionId = addVersion(id, req.user!.id, snapshot);
    })();
    res.json({ id, currentVersionId });
  });

  router.get('/groups/:id/diagrams', (req, res) => {
    const groupId = Number(req.params.id);
    if (!Number.isInteger(groupId)) {
      res.status(400).json({ error: 'invalid group id' });
      return;
    }
    if (getRole(db, req.user!.id, groupId) === null) {
      res.status(403).json({ error: 'not a member of this group' });
      return;
    }
    const rows = db
      .prepare(
        `SELECT d.id, d.title, d.updated_at AS updatedAt, u.display_name AS lastEditor,
                (SELECT COUNT(*) FROM diagram_versions v WHERE v.diagram_id = d.id) AS versionCount
         FROM diagrams d
         JOIN diagram_versions cv ON cv.id = d.current_version_id
         JOIN users u ON u.id = cv.author_id
         WHERE d.group_id = ?
         ORDER BY d.updated_at DESC, d.id DESC`,
      )
      .all(groupId);
    res.json(rows);
  });

  router.get('/diagrams/:id', (req, res) => {
    const row = getDiagramForMember(req, res);
    if (!row) return;
    const version = db
      .prepare('SELECT snapshot_gz FROM diagram_versions WHERE id = ?')
      .get(row.current_version_id) as { snapshot_gz: Buffer };
    res.json({
      id: row.id,
      groupId: row.group_id,
      title: row.title,
      currentVersionId: row.current_version_id,
      updatedAt: row.updated_at,
      snapshot: unpackSnapshot(version.snapshot_gz),
    });
  });

  router.put('/diagrams/:id', (req, res) => {
    const row = getDiagramForMember(req, res);
    if (!row) return;
    const parsed = z
      .object({ snapshot: snapshotSchema, title: z.string().trim().min(1).optional() })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid request' });
      return;
    }
    let currentVersionId = 0;
    db.transaction(() => {
      currentVersionId = addVersion(row.id, req.user!.id, parsed.data.snapshot);
      if (parsed.data.title) {
        db.prepare('UPDATE diagrams SET title = ? WHERE id = ?').run(parsed.data.title, row.id);
      }
    })();
    res.json({ currentVersionId });
  });

  router.delete('/diagrams/:id', (req, res) => {
    const row = getDiagramForMember(req, res);
    if (!row) return;
    const isCreator = row.creator_id === req.user!.id;
    const isGroupAdmin = getRole(db, req.user!.id, row.group_id) === 'admin';
    if (!isCreator && !isGroupAdmin && !req.user!.isSiteAdmin) {
      res.status(403).json({ error: 'only the creator or a group admin can delete a diagram' });
      return;
    }
    db.transaction(() => {
      // current_version_id references diagram_versions; clear it before deleting versions
      db.prepare('UPDATE diagrams SET current_version_id = NULL WHERE id = ?').run(row.id);
      db.prepare('DELETE FROM comments WHERE diagram_id = ?').run(row.id);
      db.prepare('DELETE FROM diagram_versions WHERE diagram_id = ?').run(row.id);
      db.prepare('DELETE FROM diagrams WHERE id = ?').run(row.id);
    })();
    res.status(204).end();
  });

  return router;
}
