/**
 * School notices. Server-backed so a posted notice actually reaches students.
 * - Admin: posts school-wide (class_name NULL) and to any class; can delete.
 * - Prefect: posts only to their assigned class.
 * - Everyone: reads their class's notices + school-wide ones.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { getSql } from './db';
import { AuthError, type PublicUser } from './auth';

export interface AuthedRequest extends Request {
  user?: PublicUser;
}

export const noticesRouter = Router();

function requireUser(req: AuthedRequest): PublicUser {
  if (!req.user) throw new AuthError(401, 'Sign in to continue.');
  return req.user;
}

function canPost(user: PublicUser): boolean {
  return user.role === 'admin' || user.role === 'prefect';
}

noticesRouter.get('/', async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const user = requireUser(req);
    const sql = getSql();
    const rows = (await sql`
      SELECT n.id, n.class_name, n.title, n.body, n.is_pinned, n.created_at, u.display_name AS author_name
      FROM notices n LEFT JOIN users u ON u.id = n.author_id
      WHERE n.class_name IS NULL OR n.class_name = ${user.className}
      ORDER BY n.is_pinned DESC, n.created_at DESC
      LIMIT 100
    `) as any[];

    res.json({
      notices: rows.map((n) => ({
        id: `n-${n.id}`,
        dbId: n.id,
        className: n.class_name,
        title: n.title,
        body: n.body,
        isPinned: Boolean(n.is_pinned),
        authorName: n.author_name || 'School',
        createdAt: n.created_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

noticesRouter.post('/', async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const user = requireUser(req);
    if (!canPost(user)) throw new AuthError(403, 'Only the admin or a class prefect can post notices.');

    const title = String(req.body?.title || '').trim().slice(0, 140);
    const body = String(req.body?.body || '').trim().slice(0, 4000);
    if (!title || !body) throw new AuthError(400, 'A title and message are required.');

    // Scope: school-wide only for admin; prefects are locked to their class.
    let className: string | null = null;
    if (user.role === 'prefect') {
      className = user.prefectOfClass || user.className;
    } else if (req.body?.className && typeof req.body.className === 'string') {
      const target = req.body.className.trim();
      className = target.slice(0, 40);
    }

    const sql = getSql();
    const inserted = (await sql`
      INSERT INTO notices (author_id, class_name, title, body)
      VALUES (${user.id}, ${className}, ${title}, ${body})
      RETURNING id, class_name, title, body, is_pinned, created_at
    `) as any[];

    res.status(201).json({
      notice: {
        id: `n-${inserted[0].id}`,
        dbId: inserted[0].id,
        className: inserted[0].class_name,
        title: inserted[0].title,
        body: inserted[0].body,
        isPinned: Boolean(inserted[0].is_pinned),
        authorName: user.displayName,
        createdAt: inserted[0].created_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

noticesRouter.delete('/:id', async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const user = requireUser(req);
    if (!canPost(user)) throw new AuthError(403, 'Only the admin or a class prefect can remove notices.');

    const dbId = Number(String(req.params.id).replace('n-', ''));
    const sql = getSql();
    const rows = (await sql`
      SELECT author_id, class_name FROM notices WHERE id = ${dbId} LIMIT 1
    `) as any[];
    if (!rows[0]) throw new AuthError(404, 'Notice not found.');

    const isOwner = rows[0].author_id === user.id;
    const ownClass = user.role === 'prefect' && rows[0].class_name === (user.prefectOfClass || user.className);
    if (!(user.role === 'admin' || (isOwner && ownClass))) {
      throw new AuthError(403, 'You cannot delete this notice.');
    }

    await sql`DELETE FROM notices WHERE id = ${dbId}`;
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
