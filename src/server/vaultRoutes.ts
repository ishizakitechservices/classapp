/**
 * Vault file routes: list, search, upload, edit, download, trash and restore.
 *
 * The 200 MB quota is enforced here, on the server, against an authoritative counter on
 * the users row. The browser's reported size is never trusted.
 *
 * Deleting is a soft delete: the row is flagged and the object stays in B2, so a student
 * can undo a mistake for TRASH_RETENTION_DAYS. Trashed files still count against the
 * quota, because their bytes are still stored — the trash total is shown separately so
 * "delete" never looks like it freed space that it did not.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { getSql } from './db';
import { AuthError, type PublicUser as User } from './auth';
import { MAX_UPLOAD_BYTES, STORAGE_QUOTA_BYTES } from '../shared/constants';
import {
  orderByFor,
  likePattern,
  isSearchable,
  parseFolder,
  parseSort,
  cleanFileName,
  cleanSubject,
  cleanDescription,
  cleanNotes,
  parseBulkAction,
  cleanIdList,
  TRASH_RETENTION_DAYS,
  type VaultFolder,
} from '../shared/vaultQuery';
import {
  buildObjectKey,
  uploadObject,
  createDownloadUrl,
  deleteObject,
  headObject,
  getObjectText,
  getObjectStream,
  createUploadUrl,
  isStorageConfigured,
} from './storage';

export interface AuthedRequest extends Request {
  user?: User;
}

function requireUser(req: AuthedRequest): User {
  if (!req.user) throw new AuthError(401, 'Sign in to continue.');
  return req.user;
}

/**
 * Raw body parser for uploads. Rejects anything over MAX_UPLOAD_BYTES before
 * the whole file is buffered.
 */
export function rawUploadBody(req: Request, res: Response, next: NextFunction): void {
  const declared = Number(req.headers['content-length'] || 0);
  if (declared > MAX_UPLOAD_BYTES) {
    res.status(413).json({
      error: `Files can be at most ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB.`,
    });
    return;
  }

  const chunks: Buffer[] = [];
  let received = 0;
  let finished = false;

  const fail = (status: number, message: string) => {
    if (finished) return;
    finished = true;
    if (!res.headersSent) res.status(status).json({ error: message });
    else res.end();
  };

  req.on('data', (chunk: Buffer) => {
    if (finished) return;
    received += chunk.length;
    if (received > MAX_UPLOAD_BYTES) {
      fail(413, 'File is too large.');
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });

  req.on('end', () => {
    if (finished) return;
    finished = true;
    if (received === 0) {
      // Never let an empty stream hang the handler.
      res.status(400).json({ error: 'The uploaded file is empty.' });
      return;
    }
    (req as any).rawBody = Buffer.concat(chunks);
    next();
  });

  // A aborted/errored upload must answer immediately instead of hanging.
  req.on('error', () => fail(400, 'The upload was interrupted. Please try again.'));
  req.on('aborted', () => fail(400, 'The upload was cancelled.'));
}

export const vaultRouter = Router();

/** Shape sent to the browser for one file. */
function toVaultEntry(r: any) {
  return {
    id: r.id,
    displayName: r.display_name,
    mimeType: r.mime_type,
    sizeBytes: Number(r.size_bytes),
    subjectCode: r.subject_code,
    description: r.description,
    folder: r.folder,
    notes: r.notes ?? null,
    starred: Boolean(r.starred),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at ?? null,
  };
}

/**
 * Vault listing: live files, the trash, or a search across both.
 *
 * Every value is parameterised. Two statements: one for the totals (cheap, always the
 * same cheap shape) and one for the page of files. Two round trips only happen when the
 * database is remote anyway, and this keeps the SQL readable and safe.
 */
vaultRouter.get('/files', async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const user = requireUser(req);
    const sql = getSql();

    const folder = req.query.folder ? parseFolder(req.query.folder) : null;
    const subjectCode = req.query.subject ? cleanSubject(req.query.subject) : null;
    const subjectFilter = subjectCode && subjectCode.ok ? subjectCode.value : null;
    const starredOnly = req.query.starred === '1' || req.query.starred === 'true';
    const trash = req.query.trash === '1' || req.query.trash === 'true';
    const q = isSearchable(req.query.q) ? likePattern(req.query.q) : null;
    const sortColumn = parseSort(req.query.sort);
    const orderBy = orderByFor(sortColumn);

    // Totals across the whole vault, so the storage card is right even when filtering.
    const totalsRows = (await sql`
      SELECT
        COALESCE(SUM(size_bytes) FILTER (WHERE deleted_at IS NULL), 0)::bigint AS live_bytes,
        COALESCE(SUM(size_bytes) FILTER (WHERE deleted_at IS NOT NULL), 0)::bigint AS trash_bytes,
        COUNT(*) FILTER (WHERE deleted_at IS NULL)::int AS live_count,
        COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS trash_count
      FROM vault_files WHERE owner_id = ${user.id}
    `) as any[];
    const totals = totalsRows[0] ?? {};

    // The ORDER BY fragment is chosen from a closed whitelist, never built from input.
    const files = (await sql`
      SELECT id, display_name, mime_type, size_bytes, subject_code, description,
             folder, notes, starred, created_at, updated_at, deleted_at
      FROM vault_files
      WHERE owner_id = ${user.id}
        AND deleted_at IS ${trash ? sql`NOT NULL` : sql`NULL`}
        AND (${folder}::text IS NULL OR folder = ${folder})
        AND (${subjectFilter}::text IS NULL OR subject_code = ${subjectFilter})
        AND (${starredOnly}::boolean IS FALSE OR starred = TRUE)
        AND (${q}::text IS NULL OR display_name ILIKE ${q}
             OR COALESCE(description, '') ILIKE ${q}
             OR COALESCE(subject_code, '') ILIKE ${q})
      ORDER BY ${sql.unsafe(orderBy)}
    `) as any[];

    const liveBytes = Number(totals.live_bytes || 0);
    const trashBytes = Number(totals.trash_bytes || 0);
    const counted = liveBytes + trashBytes;

    // Heal a drifted counter without making the list wait on a second write.
    if (counted !== user.storageUsedBytes) {
      void sql`
        UPDATE users SET storage_used_bytes = ${counted} WHERE id = ${user.id}
      `.catch(() => {});
    }

    res.json({
      files: files.map(toVaultEntry),
      usage: {
        liveBytes,
        trashBytes,
        usedBytes: counted,
        quotaBytes: STORAGE_QUOTA_BYTES,
        liveCount: Number(totals.live_count || 0),
        trashCount: Number(totals.trash_count || 0),
      },
      sort: sortColumn,
    });
  } catch (err) {
    next(err);
  }
});

/** Where the storage is going: per subject and per folder, live files only. */
vaultRouter.get('/files/usage', async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const user = requireUser(req);
    const sql = getSql();
    const rows = (await sql`
      SELECT
        COALESCE(subject_code, '—') AS subject_code,
        folder,
        COUNT(*)::int AS files,
        COALESCE(SUM(size_bytes), 0)::bigint AS bytes
      FROM vault_files
      WHERE owner_id = ${user.id} AND deleted_at IS NULL
      GROUP BY subject_code, folder
    `) as any[];

    const bySubject = new Map<string, { subjectCode: string; files: number; bytes: number }>();
    const byFolder = new Map<string, { folder: string; files: number; bytes: number }>();

    for (const r of rows) {
      const subjectKey = r.subject_code || '—';
      const subjectEntry = bySubject.get(subjectKey) ?? { subjectCode: subjectKey, files: 0, bytes: 0 };
      subjectEntry.files += Number(r.files || 0);
      subjectEntry.bytes += Number(r.bytes || 0);
      bySubject.set(subjectKey, subjectEntry);

      const folderEntry = byFolder.get(r.folder) ?? { folder: r.folder, files: 0, bytes: 0 };
      folderEntry.files += Number(r.files || 0);
      folderEntry.bytes += Number(r.bytes || 0);
      byFolder.set(r.folder, folderEntry);
    }

    res.json({
      bySubject: [...bySubject.values()].sort((a, b) => b.bytes - a.bytes),
      byFolder: [...byFolder.values()].sort((a, b) => b.bytes - a.bytes),
      quotaBytes: STORAGE_QUOTA_BYTES,
    });
  } catch (err) {
    next(err);
  }
});

vaultRouter.post('/files/stream-token', async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const user = requireUser(req);
    if (!isStorageConfigured()) {
      throw new AuthError(503, 'File storage is not configured on the server.');
    }

    const displayName = String(req.query.name || '').trim().slice(0, 200);
    if (!displayName) throw new AuthError(400, 'A file name is required.');

    const mimeType = String(req.query.type || 'application/octet-stream').slice(0, 120);
    const sizeBytes = Number(req.query.size || 0);
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      throw new AuthError(400, 'The file is empty.');
    }

    // The browser reports the size up front; the quota is checked here, and the
    // real object size is verified again at commit, so a lie cannot exceed 200 MB.
    // One reply gives us both the quota decision and the usage figure to return.
    const sql = getSql();
    const usage = (await sql`
      SELECT
        COALESCE(SUM(size_bytes), 0)::bigint AS used,
        COUNT(*)::int AS files
      FROM vault_files WHERE owner_id = ${user.id}
    `) as any[];
    const used = Number(usage[0]?.used || 0);
    if (used + sizeBytes > STORAGE_QUOTA_BYTES) {
      throw new AuthError(
        413,
        `Your vault is full. ${Math.round(STORAGE_QUOTA_BYTES / (1024 * 1024))} MB is the limit.`
      );
    }

    const key = buildObjectKey(user.id, displayName);
    const uploadUrl = await createUploadUrl(key, mimeType);

    res.json({
      uploadUrl,
      key,
      expiresInSeconds: 900,
      // Lets the client show the new total without a second round trip.
      usage: { usedBytes: used, quotaBytes: STORAGE_QUOTA_BYTES },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Second half of a direct upload: the browser has PUT the bytes into B2, so this
 * only verifies the object exists and records the row. No file data passes through
 * here, which is why saving completes in milliseconds instead of re-uploading.
 */
vaultRouter.post('/files/commit', async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const user = requireUser(req);
    if (!isStorageConfigured()) {
      throw new AuthError(503, 'File storage is not configured on the server.');
    }

    const key = String(req.body?.key || '');
    // A key must belong to this user; buildObjectKey always starts with `u<id>/`.
    if (!key.startsWith(`u${user.id}/`)) throw new AuthError(400, 'That upload does not belong to you.');

    const displayName = String(req.body?.name || '').trim().slice(0, 200);
    if (!displayName) throw new AuthError(400, 'A file name is required.');

    const mimeType = String(req.body?.type || 'application/octet-stream').slice(0, 120);
    const subjectCode = req.body?.subject ? String(req.body.subject).slice(0, 40) : null;
    const folder = parseFolder(req.body?.folder);
    const description = req.body?.description ? String(req.body.description).slice(0, 500) : null;

    // Trust the object in storage, never the number the browser claimed.
    const stored = await headObject(key);
    if (!stored || stored.sizeBytes <= 0) {
      throw new AuthError(409, 'The upload did not finish. Please try again.');
    }

    const sql = getSql();
    const inserted = (await sql`
      WITH totals AS (
        SELECT COALESCE(SUM(size_bytes), 0)::bigint AS used FROM vault_files WHERE owner_id = ${user.id}
      )
      INSERT INTO vault_files (owner_id, display_name, object_key, mime_type, size_bytes, subject_code, description, folder)
      SELECT ${user.id}, ${displayName}, ${key}, ${mimeType}, ${stored.sizeBytes}, ${subjectCode}, ${description}, ${folder}
      FROM totals
      WHERE totals.used + ${stored.sizeBytes} <= ${STORAGE_QUOTA_BYTES}
      ON CONFLICT (object_key) DO NOTHING
      RETURNING id, display_name, size_bytes, created_at
    `.catch(async (insertErr) => {
      await deleteObject(key).catch(() => {});
      throw insertErr;
    })) as any[];

    if (inserted.length === 0) {
      // Either over quota, or a retry of a commit that already landed.
      const existing = (await sql`
        SELECT id, display_name, size_bytes, created_at FROM vault_files
        WHERE object_key = ${key} AND owner_id = ${user.id} LIMIT 1
      `) as any[];
      if (existing[0]) {
        res.status(200).json({
          file: {
            id: existing[0].id,
            displayName: existing[0].display_name,
            sizeBytes: Number(existing[0].size_bytes),
            createdAt: existing[0].created_at,
          },
          usage: { usedBytes: user.storageUsedBytes, quotaBytes: STORAGE_QUOTA_BYTES },
        });
        return;
      }
      await deleteObject(key).catch(() => {});
      throw new AuthError(
        413,
        `That file would exceed your ${Math.round(STORAGE_QUOTA_BYTES / (1024 * 1024))} MB storage limit.`
      );
    }

    // Keep the authoritative counter in step without a second round trip to Neon.
    void sql`
      UPDATE users SET storage_used_bytes = ${user.storageUsedBytes + stored.sizeBytes}
      WHERE id = ${user.id}
    `.catch(() => {});

    res.status(201).json({
      file: {
        id: inserted[0].id,
        displayName: inserted[0].display_name,
        sizeBytes: Number(inserted[0].size_bytes),
        createdAt: inserted[0].created_at,
      },
      // Computed here, from what we just inserted, instead of re-reading the sum.
      usage: {
        usedBytes: user.storageUsedBytes + stored.sizeBytes,
        quotaBytes: STORAGE_QUOTA_BYTES,
      },
    });
  } catch (err) {
    next(err);
  }
});

vaultRouter.post(
  '/files',
  rawUploadBody,
  async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!isStorageConfigured()) {
        throw new AuthError(503, 'File storage is not configured on the server.');
      }

      const body = (req as any).rawBody as Buffer;
      if (!body || body.length === 0) throw new AuthError(400, 'The uploaded file is empty.');
      if (body.length > MAX_UPLOAD_BYTES) throw new AuthError(413, 'File is too large.');

      const displayName = String(req.query.name || '').trim().slice(0, 200);
      if (!displayName) throw new AuthError(400, 'A file name is required.');

      const mimeType = String(req.query.type || 'application/octet-stream').slice(0, 120);
      const subjectCode = req.query.subject ? String(req.query.subject).slice(0, 40) : null;
      const folder = parseFolder(req.query.folder);
      const description = req.query.description
        ? String(req.query.description).slice(0, 500)
        : null;

      // Quota check against the files that actually exist, then reserve the space
      // atomically so two parallel uploads cannot both slip under the limit. Deriving
      // the starting figure from vault_files also clears any stale counter drift.
      const sql = getSql();
      const reserved = (await sql`
        UPDATE users
        SET storage_used_bytes = COALESCE(
          (SELECT SUM(size_bytes) FROM vault_files WHERE owner_id = ${user.id}), 0
        ) + ${body.length}
        WHERE id = ${user.id}
          AND COALESCE(
            (SELECT SUM(size_bytes) FROM vault_files WHERE owner_id = ${user.id}), 0
          ) + ${body.length} <= ${STORAGE_QUOTA_BYTES}
        RETURNING storage_used_bytes
      `) as any[];

      if (reserved.length === 0) {
        throw new AuthError(
          413,
          `That file would exceed your ${Math.round(STORAGE_QUOTA_BYTES / (1024 * 1024))} MB storage limit.`
        );
      }

      const key = buildObjectKey(user.id, displayName);
      try {
        await uploadObject(key, body, mimeType);
      } catch (uploadErr) {
        // Roll the reservation back so a failed upload does not silently eat quota.
        await sql`
          UPDATE users SET storage_used_bytes = storage_used_bytes - ${body.length}
          WHERE id = ${user.id}
        `;
        throw uploadErr;
      }

      const inserted = (await sql`
        INSERT INTO vault_files (owner_id, display_name, object_key, mime_type, size_bytes, subject_code, description, folder)
        VALUES (${user.id}, ${displayName}, ${key}, ${mimeType}, ${body.length}, ${subjectCode}, ${description}, ${folder})
        RETURNING id, display_name, size_bytes, created_at
      `.catch(async (insertErr) => {
        // Row failed to record: release the reserved quota AND drop the orphaned object.
        await sql`UPDATE users SET storage_used_bytes = storage_used_bytes - ${body.length} WHERE id = ${user.id}`;
        await deleteObject(key).catch(() => {});
        throw insertErr;
      })) as any[];

      res.status(201).json({
        file: {
          id: inserted[0].id,
          displayName: inserted[0].display_name,
          sizeBytes: Number(inserted[0].size_bytes),
          createdAt: inserted[0].created_at,
        },
        usage: { usedBytes: Number(reserved[0].storage_used_bytes), quotaBytes: STORAGE_QUOTA_BYTES },
      });
    } catch (err) {
      next(err);
    }
  }
);

vaultRouter.get('/files/:id/download', async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const user = requireUser(req);
    const sql = getSql();
    const rows = (await sql`
      SELECT object_key FROM vault_files WHERE id = ${Number(req.params.id)} AND owner_id = ${user.id} LIMIT 1
    `) as any[];

    if (!rows[0]) throw new AuthError(404, 'File not found.');
    res.json({ url: await createDownloadUrl(rows[0].object_key) });
  } catch (err) {
    next(err);
  }
});

/**
 * Stable, owner-checked streaming URL. This is what the app opens and the service
 * worker caches — unlike signed B2 URLs it never changes, so the second open is
 * instant and later opens can work offline.
 */
vaultRouter.get('/files/:id/stream', async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const user = requireUser(req);
    const sql = getSql();
    const rows = (await sql`
      SELECT object_key, display_name, mime_type FROM vault_files
      WHERE id = ${Number(req.params.id)} AND owner_id = ${user.id} LIMIT 1
    `) as any[];

    if (!rows[0]) throw new AuthError(404, 'File not found.');

    // One response path: both open and download stream from B2, with the
    // attachment flag carried by the signed request instead of a second helper.
    const wantsDownload = Boolean(req.query.download);
    const rangeHeader = req.headers.range;
    // Byte ranges are what let the video and audio players scrub and resume.
    // Only simple single-range requests are forwarded; anything else gets the
    // whole file, which every browser also understands.
    const range =
      !wantsDownload && typeof rangeHeader === 'string' && /^bytes=\d*-\d*$/.test(rangeHeader.trim())
        ? rangeHeader.trim()
        : undefined;

    let file;
    try {
      file = await getObjectStream(
        rows[0].object_key,
        wantsDownload ? String(rows[0].display_name) : undefined,
        range
      );
    } catch (err) {
      if (!range) throw err;
      // B2 refused the range (for example past the end of the file): stream the
      // whole object rather than breaking playback.
      file = await getObjectStream(rows[0].object_key, undefined);
    }

    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Accept-Ranges', 'bytes');
    if (file.contentRange) {
      res.status(206);
      res.setHeader('Content-Range', file.contentRange);
    }
    if (file.contentLength) res.setHeader('Content-Length', String(file.contentLength));
    if (wantsDownload) {
      // Attachment for THIS browser too, so mobile browsers save rather than display.
      const safeName = rows[0].display_name.replace(/[^\w.\- ]+/g, '_');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    }
    // Cacheable by this user's browser only; vault files never change once stored.
    res.setHeader('Cache-Control', 'private, max-age=86400');

    // Stream it through: no full-file Buffer, no waiting for the last byte.
    file.stream.pipe(res);
    file.stream.on('error', () => {
      if (!res.headersSent) res.status(502).json({ error: 'Could not read the file.' });
      else res.destroy();
    });
  } catch (err) {
    next(err);
  }
});

/** Inline text for notes/small study files (up to 512 KB), checked against the owner. */
const TEXT_MAX_BYTES = 512 * 1024;
vaultRouter.get('/files/:id/content', async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const user = requireUser(req);
    const sql = getSql();
    const rows = (await sql`
      SELECT object_key, mime_type, size_bytes FROM vault_files
      WHERE id = ${Number(req.params.id)} AND owner_id = ${user.id} LIMIT 1
    `) as any[];

    if (!rows[0]) throw new AuthError(404, 'File not found.');
    if (Number(rows[0].size_bytes) > TEXT_MAX_BYTES) {
      throw new AuthError(413, 'This file is too large to read inline. Open it instead.');
    }
    const text = await getObjectText(rows[0].object_key, TEXT_MAX_BYTES);
    res.json({ mimeType: rows[0].mime_type, text });
  } catch (err) {
    next(err);
  }
});

/**
 * Edit a file's own details. Only the fields present in the body are touched, so the
 * reader can save notes without resending (or blanking) the name, folder and subject.
 */
vaultRouter.patch('/files/:id', async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const user = requireUser(req);
    const sql = getSql();
    const id = Number(req.params.id);
    const body = req.body ?? {};

    const existing = (await sql`
      SELECT id FROM vault_files WHERE id = ${id} AND owner_id = ${user.id} LIMIT 1
    `) as any[];
    if (!existing[0]) throw new AuthError(404, 'File not found.');

    const updates: Array<Promise<unknown>> = [];

    if (body.name !== undefined) {
      const name = cleanFileName(body.name);
      if (!name.ok) throw new AuthError(400, name.error);
      updates.push(sql`UPDATE vault_files SET display_name = ${name.value}, updated_at = NOW() WHERE id = ${id} AND owner_id = ${user.id}`);
    }
    if (body.description !== undefined) {
      const desc = cleanDescription(body.description);
      if (!desc.ok) throw new AuthError(400, desc.error);
      updates.push(sql`UPDATE vault_files SET description = ${desc.value}, updated_at = NOW() WHERE id = ${id} AND owner_id = ${user.id}`);
    }
    if (body.subject !== undefined) {
      const subject = cleanSubject(body.subject);
      if (!subject.ok) throw new AuthError(400, subject.error);
      updates.push(sql`UPDATE vault_files SET subject_code = ${subject.value}, updated_at = NOW() WHERE id = ${id} AND owner_id = ${user.id}`);
    }
    if (body.folder !== undefined) {
      const folder: VaultFolder = parseFolder(body.folder);
      updates.push(sql`UPDATE vault_files SET folder = ${folder}, updated_at = NOW() WHERE id = ${id} AND owner_id = ${user.id}`);
    }
    if (body.starred !== undefined) {
      const starred = body.starred === true || body.starred === 'true';
      updates.push(sql`UPDATE vault_files SET starred = ${starred}, updated_at = NOW() WHERE id = ${id} AND owner_id = ${user.id}`);
    }
    if (body.notes !== undefined) {
      const notes = cleanNotes(body.notes);
      if (!notes.ok) throw new AuthError(400, notes.error);
      updates.push(sql`UPDATE vault_files SET notes = ${notes.value}, updated_at = NOW() WHERE id = ${id} AND owner_id = ${user.id}`);
    }

    if (updates.length === 0) throw new AuthError(400, 'Nothing to update.');
    await Promise.all(updates);

    const rows = (await sql`
      SELECT id, display_name, mime_type, size_bytes, subject_code, description,
             folder, notes, starred, created_at, updated_at, deleted_at
      FROM vault_files WHERE id = ${id} AND owner_id = ${user.id} LIMIT 1
    `) as any[];

    res.json({ file: toVaultEntry(rows[0]) });
  } catch (err) {
    next(err);
  }
});

vaultRouter.post('/files/:id/restore', async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const user = requireUser(req);
    const sql = getSql();
    const id = Number(req.params.id);

    // Restoring needs no quota check: these bytes were always counted.
    const rows = (await sql`
      UPDATE vault_files SET deleted_at = NULL, updated_at = NOW()
      WHERE id = ${id} AND owner_id = ${user.id} AND deleted_at IS NOT NULL
      RETURNING id, display_name, mime_type, size_bytes, subject_code, description,
                folder, notes, starred, created_at, updated_at, deleted_at
    `) as any[];

    if (!rows[0]) throw new AuthError(404, 'That file is not in the trash.');
    res.json({ file: toVaultEntry(rows[0]) });
  } catch (err) {
    next(err);
  }
});

/**
 * Act on many files at once: delete, restore, move, star or unstar.
 *
 * Ownership is enforced in the WHERE clause, so an id from another account simply
 * matches nothing — the count returned is what actually changed.
 */
vaultRouter.put('/files/bulk', async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const user = requireUser(req);
    const sql = getSql();

    const ids = cleanIdList(req.body?.ids);
    if (ids.length === 0) throw new AuthError(400, 'Select at least one file.');

    const action = parseBulkAction(req.body?.action);
    if (!action) throw new AuthError(400, 'Unknown action.');

    let changed: any[] = [];

    if (action === 'delete') {
      changed = (await sql`
        UPDATE vault_files SET deleted_at = NOW(), updated_at = NOW()
        WHERE id = ANY(${ids}) AND owner_id = ${user.id} AND deleted_at IS NULL
        RETURNING id
      `) as any[];
    } else if (action === 'restore') {
      changed = (await sql`
        UPDATE vault_files SET deleted_at = NULL, updated_at = NOW()
        WHERE id = ANY(${ids}) AND owner_id = ${user.id} AND deleted_at IS NOT NULL
        RETURNING id
      `) as any[];
    } else if (action === 'move') {
      const folder: VaultFolder = parseFolder(req.body?.folder);
      changed = (await sql`
        UPDATE vault_files SET folder = ${folder}, updated_at = NOW()
        WHERE id = ANY(${ids}) AND owner_id = ${user.id} AND deleted_at IS NULL
        RETURNING id
      `) as any[];
    } else {
      const starred = action === 'star';
      changed = (await sql`
        UPDATE vault_files SET starred = ${starred}, updated_at = NOW()
        WHERE id = ANY(${ids}) AND owner_id = ${user.id} AND deleted_at IS NULL
        RETURNING id
      `) as any[];
    }

    res.json({ changed: changed.length, action });
  } catch (err) {
    next(err);
  }
});

/** Empty the trash: remove the stored objects, then the rows. This is the only real delete. */
async function purgeTrashFor(user: User, olderThanDays?: number): Promise<number> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id, object_key FROM vault_files
    WHERE owner_id = ${user.id}
      AND deleted_at IS NOT NULL
      ${olderThanDays ? sql`AND deleted_at < NOW() - ${`${olderThanDays} days`}::interval` : sql``}
  `) as any[];

  let removed = 0;
  for (const row of rows) {
    // Storage first: if B2 fails, the row stays so the object is not orphaned forever.
    try {
      await deleteObject(row.object_key);
    } catch {
      continue;
    }
    await sql`DELETE FROM vault_files WHERE id = ${row.id} AND owner_id = ${user.id}`;
    removed += 1;
  }

  if (removed > 0) {
    await sql`
      UPDATE users
      SET storage_used_bytes = COALESCE((SELECT SUM(size_bytes) FROM vault_files WHERE owner_id = ${user.id}), 0)
      WHERE id = ${user.id}
    `;
  }
  return removed;
}

vaultRouter.post('/files/trash/purge', async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const user = requireUser(req);
    const removed = await purgeTrashFor(user);
    const sql = getSql();
    const rows = (await sql`SELECT storage_used_bytes FROM users WHERE id = ${user.id}`) as any[];
    res.json({
      removed,
      usage: { usedBytes: Number(rows[0]?.storage_used_bytes || 0), quotaBytes: STORAGE_QUOTA_BYTES },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Housekeeping: permanently remove files that have sat in the trash past the retention
 * window. Called at startup, so a student is never asked to tidy up by hand.
 */
export async function purgeExpiredTrash(): Promise<void> {
  const sql = getSql();
  const rows = (await sql`
    SELECT DISTINCT owner_id FROM vault_files
    WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - ${`${TRASH_RETENTION_DAYS} days`}::interval
  `) as any[];

  for (const row of rows) {
    try {
      await purgeTrashFor({ id: row.owner_id } as User, TRASH_RETENTION_DAYS);
    } catch (err) {
      console.warn(
        `[Vault] Could not purge expired trash for user ${row.owner_id}:`,
        err instanceof Error ? err.message : err
      );
    }
  }
}

/** Move a file to the trash. Nothing is deleted from storage until the trash is emptied. */
vaultRouter.delete('/files/:id', async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const user = requireUser(req);
    const sql = getSql();
    const id = Number(req.params.id);

    const rows = (await sql`
      UPDATE vault_files SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = ${id} AND owner_id = ${user.id} AND deleted_at IS NULL
      RETURNING id
    `) as any[];

    if (!rows[0]) throw new AuthError(404, 'File not found.');

    // Quota is unchanged: the bytes are still stored. Report the true totals.
    const totals = (await sql`
      SELECT COALESCE(SUM(size_bytes), 0)::bigint AS used FROM vault_files WHERE owner_id = ${user.id}
    `) as any[];

    res.json({
      ok: true,
      usage: { usedBytes: Number(totals[0]?.used || 0), quotaBytes: STORAGE_QUOTA_BYTES },
    });
  } catch (err) {
    next(err);
  }
});
