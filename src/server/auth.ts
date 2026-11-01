/**
 * Authentication and accounts. Server-only.
 *
 * Decisions encoded here:
 * - Signup is open; new accounts are active but UNVERIFIED (usage-capped, see limits).
 * - Only the admin appoints prefects; a prefect is scoped to one class.
 * - Password reset: a prefect (or admin) issues a one-time code. They never see the
 *   new password, so they cannot take over the account.
 * - Session tokens are random, stored as SHA-256 hashes; the raw token exists only
 *   in the user's HttpOnly cookie.
 */
import crypto from 'node:crypto';
import argon2 from 'argon2';
import { getSql } from './db';
import {
  AI_DAILY_LIMIT_UNVERIFIED,
  AI_DAILY_LIMIT_VERIFIED,
  AI_DAILY_LIMIT_ADMIN,
  AI_DAILY_LIMIT_STUDENT_VERIFIED,
  SCHOOL_DAILY_AI_FUSE_DEFAULT,
  OLAG_CLASSES,
  isValidStudentId,
  normaliseStudentId,
} from '../shared/constants';
import {
  getSubject,
  normalizeSubjectSelection,
  sortSubjects,
  type UserSubject,
} from '../shared/subjects';

export type Role = 'student' | 'prefect' | 'admin';

export interface PublicUser {
  id: number;
  studentId: string;
  displayName: string;
  className: string;
  role: Role;
  isVerified: boolean;
  prefectOfClass: string | null;
  storageUsedBytes: number;
  /** Everything the student studies, core and internal included. */
  subjects: UserSubject[];
}

const SESSION_DAYS = 30;
const RESET_CODE_MINUTES = 30;

export const ARGON_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON_OPTIONS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function toPublicUser(row: any): PublicUser {
  return {
    id: row.id,
    studentId: row.student_id,
    displayName: row.display_name,
    className: row.class_name,
    role: row.role,
    isVerified: row.is_verified,
    prefectOfClass: row.prefect_of_class,
    storageUsedBytes: Number(row.storage_used_bytes),
    // Filled in by attachSubjects(); every route that returns a user does so.
    subjects: [],
  };
}

// ---------------------------------------------------------------- subjects

/** Read a student's subjects in display order. Unknown codes are dropped. */
export async function loadSubjects(userId: number): Promise<UserSubject[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT subject_code FROM user_subjects WHERE user_id = ${userId}
  `) as any[];

  const subjects: UserSubject[] = [];
  for (const row of rows) {
    const def = getSubject(row.subject_code);
    if (def) subjects.push({ code: def.code, name: def.name, kind: def.kind, group: def.group });
  }
  return sortSubjects(subjects);
}

/** Replace a student's whole subject list in one statement. */
async function saveSubjects(userId: number, subjects: UserSubject[]): Promise<void> {
  const sql = getSql();
  const payload = JSON.stringify(
    subjects.map((s) => ({ user_id: userId, subject_code: s.code, kind: s.kind }))
  );

  await sql`DELETE FROM user_subjects WHERE user_id = ${userId}`;
  if (subjects.length === 0) return;
  await sql`
    INSERT INTO user_subjects (user_id, subject_code, kind)
    SELECT user_id, subject_code, kind
    FROM jsonb_to_recordset(${payload}::jsonb)
      AS x(user_id INTEGER, subject_code TEXT, kind TEXT)
  `;
}

/** Attach the stored subject list to a public user. */
export async function attachSubjects(user: PublicUser): Promise<PublicUser> {
  return { ...user, subjects: await loadSubjects(user.id) };
}

export interface SignupInput {
  studentId: string;
  displayName: string;
  className: string;
  password: string;
  /** Elective codes only; core and internal subjects are added automatically. */
  electives: string[];
}

export class AuthError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

export async function signUp(input: SignupInput): Promise<PublicUser> {
  const studentId = normaliseStudentId(input.studentId);
  const displayName = (input.displayName || '').trim();
  const className = input.className;

  if (!isValidStudentId(studentId)) {
    throw new AuthError(400, 'Student ID must be one letter followed by 1-3 digits, e.g. n64.');
  }
  if (displayName.length < 2 || displayName.length > 80) {
    throw new AuthError(400, 'Name must be between 2 and 80 characters.');
  }
  if (!(OLAG_CLASSES as readonly string[]).includes(className)) {
    throw new AuthError(400, 'Select a class from the list.');
  }
  if (typeof input.password !== 'string' || input.password.length < 8 || input.password.length > 200) {
    throw new AuthError(400, 'Password must be at least 8 characters.');
  }

  // Validate the subject list before hashing, so a bad choice costs nothing.
  const selection = normalizeSubjectSelection(className, input.electives ?? []);
  if (!selection.ok) throw new AuthError(400, selection.error);

  const sql = getSql();

  const existing = (await sql`SELECT id FROM users WHERE student_id = ${studentId} LIMIT 1`) as any[];
  if (existing.length > 0) {
    // Deliberately not revealing anything beyond "taken" — the ID is public knowledge anyway.
    throw new AuthError(409, 'That student ID is already registered. If it is yours, ask a class prefect for a reset code.');
  }

  const passwordHash = await hashPassword(input.password);

  const rows = (await sql`
    INSERT INTO users (student_id, display_name, class_name, password_hash, role, is_verified)
    VALUES (${studentId}, ${displayName}, ${className}, ${passwordHash}, 'student', FALSE)
    RETURNING *
  `) as any[];

  const user = toPublicUser(rows[0]);
  await saveSubjects(user.id, selection.subjects);

  return { ...user, subjects: selection.subjects };
}

export async function signIn(studentIdRaw: string, password: string): Promise<{ user: PublicUser; token: string }> {
  const studentId = normaliseStudentId(studentIdRaw || '');
  const sql = getSql();

  const rows = (await sql`SELECT * FROM users WHERE student_id = ${studentId} LIMIT 1`) as any[];
  const row = rows[0];

  // Always run a hash comparison so a missing account and a wrong password take similar time.
  const ok = row
    ? await verifyPassword(row.password_hash, password || '')
    : await verifyPassword(
        '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$0000000000000000000000000000000000000000000',
        password || ''
      );

  if (!row || !ok) {
    throw new AuthError(401, 'Student ID or password is incorrect.');
  }

  return { user: await attachSubjects(toPublicUser(row)), token: await createSession(row.id) };
}

export async function createSession(userId: number): Promise<string> {
  const sql = getSql();
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await sql`
    INSERT INTO sessions (token_hash, user_id, expires_at)
    VALUES (${sha256(token)}, ${userId}, ${expires.toISOString()})
  `;
  return token;
}

export async function destroySession(token: string): Promise<void> {
  const sql = getSql();
  await sql`DELETE FROM sessions WHERE token_hash = ${sha256(token)}`;
}

export async function getUserBySession(token: string | undefined): Promise<PublicUser | null> {
  if (!token) return null;
  const sql = getSql();
  const rows = (await sql`
    SELECT u.* FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${sha256(token)} AND s.expires_at > NOW()
    LIMIT 1
  `) as any[];
  return rows[0] ? toPublicUser(rows[0]) : null;
}

// ---------------------------------------------------------------- subjects

/**
 * Replace a student's electives. Core and internal subjects are recomputed from
 * the class, so a Form 3 student can never be left holding a Form 2 subject.
 */
export async function setSubjects(user: PublicUser, electiveCodes: string[]): Promise<PublicUser> {
  const selection = normalizeSubjectSelection(user.className, electiveCodes);
  if (!selection.ok) throw new AuthError(400, selection.error);

  await saveSubjects(user.id, selection.subjects);
  return { ...user, subjects: selection.subjects };
}

// ---------------------------------------------------------------- verification

export async function setVerified(actor: PublicUser, targetStudentId: string, verified: boolean): Promise<PublicUser> {
  const sql = getSql();
  const studentId = normaliseStudentId(targetStudentId);

  const rows = (await sql`SELECT * FROM users WHERE student_id = ${studentId} LIMIT 1`) as any[];
  const target = rows[0];
  if (!target) throw new AuthError(404, 'No such student.');

  const canVerify =
    actor.role === 'admin' ||
    (actor.role === 'prefect' && actor.prefectOfClass === target.class_name);

  if (!canVerify) {
    throw new AuthError(403, 'You can only verify students in the class you are prefect of.');
  }
  if (target.id === actor.id) {
    throw new AuthError(400, 'You cannot change your own verification status.');
  }
  // A prefect must never be able to demote or lock out an admin.
  if (target.role === 'admin' && actor.role !== 'admin') {
    throw new AuthError(403, 'Only an admin can change an admin account.');
  }

  const updated = (await sql`
    UPDATE users
    SET is_verified = ${verified},
        verified_by = ${verified ? actor.id : null},
        verified_at = ${verified ? new Date().toISOString() : null}
    WHERE id = ${target.id}
    RETURNING *
  `) as any[];

  return attachSubjects(toPublicUser(updated[0]));
}

// ---------------------------------------------------------------- roles

export async function appointPrefect(actor: PublicUser, studentIdRaw: string, className: string): Promise<PublicUser> {
  if (actor.role !== 'admin') throw new AuthError(403, 'Only the admin can appoint prefects.');
  if (!(OLAG_CLASSES as readonly string[]).includes(className)) {
    throw new AuthError(400, 'Select a class from the list.');
  }

  const sql = getSql();
  const studentId = normaliseStudentId(studentIdRaw);
  const rows = (await sql`SELECT * FROM users WHERE student_id = ${studentId} LIMIT 1`) as any[];
  const target = rows[0];
  if (!target) throw new AuthError(404, 'No such student.');
  if (target.role === 'admin') throw new AuthError(400, 'The admin cannot be made a prefect.');

  const updated = (await sql`
    UPDATE users
    SET role = 'prefect', prefect_of_class = ${className}
    WHERE id = ${target.id}
    RETURNING *
  `) as any[];

  return attachSubjects(toPublicUser(updated[0]));
}

export async function removePrefect(actor: PublicUser, studentIdRaw: string): Promise<PublicUser> {
  if (actor.role !== 'admin') throw new AuthError(403, 'Only the admin can remove prefects.');

  const sql = getSql();
  const studentId = normaliseStudentId(studentIdRaw);
  const updated = (await sql`
    UPDATE users
    SET role = 'student', prefect_of_class = NULL
    WHERE student_id = ${studentId} AND role = 'prefect'
    RETURNING *
  `) as any[];

  if (!updated[0]) throw new AuthError(404, 'That student is not a prefect.');
  return attachSubjects(toPublicUser(updated[0]));
}

// ---------------------------------------------------------------- password reset

/**
 * Prefect (for their class) or admin issues a one-time code. The prefect never
 * learns the resulting password, so this cannot be used to take over an account.
 */
export async function issueResetCode(actor: PublicUser, studentIdRaw: string): Promise<{ code: string; expiresAt: string }> {
  const sql = getSql();
  const studentId = normaliseStudentId(studentIdRaw);
  const rows = (await sql`SELECT * FROM users WHERE student_id = ${studentId} LIMIT 1`) as any[];
  const target = rows[0];
  if (!target) throw new AuthError(404, 'No such student.');

  const allowed =
    actor.role === 'admin' ||
    (actor.role === 'prefect' && actor.prefectOfClass === target.class_name);
  if (!allowed) {
    throw new AuthError(403, 'You can only reset passwords for students in the class you are prefect of.');
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const expires = new Date(Date.now() + RESET_CODE_MINUTES * 60 * 1000);

  await sql`
    INSERT INTO password_reset_codes (user_id, code_hash, issued_by, expires_at)
    VALUES (${target.id}, ${sha256(code)}, ${actor.id}, ${expires.toISOString()})
  `;

  return { code, expiresAt: expires.toISOString() };
}

export async function consumeResetCode(studentIdRaw: string, code: string, newPassword: string): Promise<void> {
  if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 200) {
    throw new AuthError(400, 'New password must be at least 8 characters.');
  }

  const sql = getSql();
  const studentId = normaliseStudentId(studentIdRaw);

  const rows = (await sql`
    SELECT c.id, c.user_id
    FROM password_reset_codes c
    JOIN users u ON u.id = c.user_id
    WHERE u.student_id = ${studentId}
      AND c.code_hash = ${sha256(String(code || '').trim())}
      AND c.used_at IS NULL
      AND c.expires_at > NOW()
    LIMIT 1
  `) as any[];

  const found = rows[0];
  if (!found) throw new AuthError(400, 'That code is invalid or has expired. Ask your prefect for a new one.');

  const hash = await hashPassword(newPassword);

  await sql`UPDATE users SET password_hash = ${hash} WHERE id = ${found.user_id}`;
  await sql`UPDATE password_reset_codes SET used_at = NOW() WHERE id = ${found.id}`;
  // Sign out every existing session so a stolen cookie cannot survive the reset.
  await sql`DELETE FROM sessions WHERE user_id = ${found.user_id}`;
}

// ---------------------------------------------------------------- AI usage

export async function checkAndCountAiUsage(user: PublicUser): Promise<{ allowed: boolean; limit: number; used: number }> {
  const sql = getSql();
  const limit =
    user.role === 'admin'
      ? AI_DAILY_LIMIT_ADMIN
      : user.isVerified
        ? AI_DAILY_LIMIT_STUDENT_VERIFIED
        : AI_DAILY_LIMIT_UNVERIFIED;

  const rows = (await sql`
    INSERT INTO ai_usage_daily (user_id, day, requests)
    VALUES (${user.id}, CURRENT_DATE, 1)
    ON CONFLICT (user_id, day)
    DO UPDATE SET requests = ai_usage_daily.requests + 1
    WHERE ai_usage_daily.requests < ${limit}
    RETURNING requests
  `) as any[];

  if (rows.length === 0) {
    const current = (await sql`
      SELECT requests FROM ai_usage_daily WHERE user_id = ${user.id} AND day = CURRENT_DATE
    `) as any[];
    return { allowed: false, limit, used: current[0]?.requests ?? limit };
  }
  return { allowed: true, limit, used: rows[0].requests };
}

/** Give a request back when the AI itself fails — students never pay for nothing. */
export async function refundAiUsage(user: PublicUser): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE ai_usage_daily SET requests = GREATEST(0, requests - 1)
    WHERE user_id = ${user.id} AND day = CURRENT_DATE
  `;
}

/**
 * Whole-school daily fuse. One row per day for user_id = 0. Counting happens only
 * when a real generation starts, so cached/shared study material never burns it.
 */
/** Whole-school daily fuse, configurable from the server env only. */
function schoolFuseLimit(): number {
  const parsed = Number(process.env.AI_SCHOOL_FUSE || '');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : SCHOOL_DAILY_AI_FUSE_DEFAULT;
}

export async function countSchoolFuse(): Promise<{ allowed: boolean; used: number; limit: number }> {
  const sql = getSql();
  const rows = (await sql`
    INSERT INTO school_usage_daily (day, requests)
    VALUES (CURRENT_DATE, 1)
    ON CONFLICT (day)
    DO UPDATE SET requests = school_usage_daily.requests + 1
    WHERE school_usage_daily.requests < ${schoolFuseLimit()}
    RETURNING requests
  `) as any[];
  if (rows.length === 0) {
    const current = (await sql`
      SELECT requests FROM school_usage_daily WHERE day = CURRENT_DATE
    `) as any[];
    return { allowed: false, used: current[0]?.requests ?? schoolFuseLimit(), limit: schoolFuseLimit() };
  }
  return { allowed: true, used: Number(rows[0].requests), limit: schoolFuseLimit() };
}

/**
 * Count several fuse units in ONE statement (a full-length quiz is several provider
 * calls). All-or-nothing: if the whole school cannot afford every call, nothing is
 * counted and the caller refuses before spending anything.
 */
export async function countSchoolFuseBulk(amount: number): Promise<{ allowed: boolean; used: number; limit: number }> {
  const units = Math.max(1, Math.trunc(amount) || 1);
  const sql = getSql();
  const rows = (await sql`
    INSERT INTO school_usage_daily (day, requests)
    VALUES (CURRENT_DATE, ${units})
    ON CONFLICT (day)
    DO UPDATE SET requests = school_usage_daily.requests + ${units}
    WHERE school_usage_daily.requests + ${units} <= ${schoolFuseLimit()}
    RETURNING requests
  `) as any[];
  if (rows.length === 0) {
    const current = (await sql`
      SELECT requests FROM school_usage_daily WHERE day = CURRENT_DATE
    `) as any[];
    return { allowed: false, used: current[0]?.requests ?? schoolFuseLimit(), limit: schoolFuseLimit() };
  }
  return { allowed: true, used: Number(rows[0].requests), limit: schoolFuseLimit() };
}

/** Hand fuse units back (the provider call failed, so the school must not pay). */
export async function refundSchoolFuse(amount: number = 1): Promise<void> {
  const units = Math.max(1, Math.trunc(amount) || 1);
  const sql = getSql();
  await sql`
    UPDATE school_usage_daily SET requests = GREATEST(0, requests - ${units})
    WHERE day = CURRENT_DATE
  `;
}

/** Counts a "Think deeper" request that costs two allowances in one shot. */
export async function countAiUsageBulk(user: PublicUser, amount: number): Promise<{ allowed: boolean; limit: number; used: number }> {
  const sql = getSql();
  const limit =
    user.role === 'admin'
      ? AI_DAILY_LIMIT_ADMIN
      : user.isVerified
        ? AI_DAILY_LIMIT_STUDENT_VERIFIED
        : AI_DAILY_LIMIT_UNVERIFIED;
  const rows = (await sql`
    INSERT INTO ai_usage_daily (user_id, day, requests)
    VALUES (${user.id}, CURRENT_DATE, ${amount})
    ON CONFLICT (user_id, day)
    DO UPDATE SET requests = ai_usage_daily.requests + ${amount}
    WHERE ai_usage_daily.requests + ${amount} <= ${limit}
    RETURNING requests
  `) as any[];
  if (rows.length === 0) {
    const current = (await sql`
      SELECT requests FROM ai_usage_daily WHERE user_id = ${user.id} AND day = CURRENT_DATE
    `) as any[];
    return { allowed: false, limit, used: current[0]?.requests ?? limit };
  }
  return { allowed: true, limit, used: Number(rows[0].requests) };
}

/** Housekeeping: expired sessions + spent reset codes + usage rows older than 60 days. */
export async function purgeExpiredData(): Promise<void> {
  const sql = getSql();
  await sql`
    DELETE FROM sessions WHERE expires_at < NOW() - INTERVAL '1 day';
  `;
  await sql`
    DELETE FROM password_reset_codes WHERE expires_at < NOW() - INTERVAL '1 day' OR used_at IS NOT NULL;
  `;
  await sql`
    DELETE FROM ai_usage_daily WHERE day < CURRENT_DATE - INTERVAL '60 days';
  `;
}
