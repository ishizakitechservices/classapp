// Enforce HMR disabled in AI Studio dev environment to prevent WebSocket closed errors
process.env.DISABLE_HMR = 'true';

import http from 'http';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import { DeepSeekProvider, DeepSeekConfigError, checkRateLimit } from './src/server/deepseekProvider.ts';
import {
  STUDY_BATCH_SIZE,
  STUDY_MAX_BATCHES,
  STUDY_SIZES,
  batchesFor,
  clampStudyCount,
  creditsFor,
  type StudyKind,
} from './src/shared/studyLimits.ts';
import { CURRICULUM_VERSION, buildCurriculumBlock } from './src/shared/curriculum/index.ts';
import { loadAllCurricula } from './src/server/curriculumLoader.ts';
import { SUBJECTS, formOf } from './src/shared/subjects.ts';
import {
  signUp,
  signIn,
  destroySession,
  getUserBySession,
  setVerified,
  setSubjects,
  attachSubjects,
  appointPrefect,
  removePrefect,
  issueResetCode,
  consumeResetCode,
  checkAndCountAiUsage,
  countAiUsageBulk,
  countSchoolFuse,
  countSchoolFuseBulk,
  refundSchoolFuse,
  refundAiUsage,
  purgeExpiredData,
  AuthError,
  type PublicUser,
} from './src/server/auth.ts';
import { isDatabaseConfigured, getSql } from './src/server/db.ts';
import { vaultRouter, purgeExpiredTrash, type AuthedRequest } from './src/server/vaultRoutes.ts';
import { noticesRouter } from './src/server/noticesRoutes.ts';
import { OLAG_CLASSES, AI_DAILY_LIMIT_ADMIN, AI_DAILY_LIMIT_STUDENT_VERIFIED, AI_DAILY_LIMIT_UNVERIFIED } from './src/shared/constants.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Body parsing with safe size limit to prevent memory exhaustion
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// Attach the signed-in user to every request. Never trust a client-supplied user id.
app.use(async (req: AuthedRequest, _res, next) => {
  if (!isDatabaseConfigured()) return next();
  try {
    req.user = (await getUserBySession(req.cookies?.sid)) ?? undefined;
  } catch {
    req.user = undefined;
  }
  next();
});

function handleAuthError(err: unknown, res: Response): boolean {
  if (err instanceof AuthError) {
    res.status(err.status).json({ error: err.message });
    return true;
  }
  return false;
}

/** Subject codes arrive as a JSON array; anything else means "no electives". */
function readElectiveCodes(value: unknown): string[] {
  return Array.isArray(value) ? value.map((code) => String(code)) : [];
}

// ---------------------------------------------------------------- auth routes

app.post('/api/auth/signup', async (req: Request, res: Response) => {
  if (!isDatabaseConfigured()) {
    res.status(503).json({ error: 'Accounts are not configured on this server yet.' });
    return;
  }
  try {
    const user = await signUp({
      studentId: String(req.body?.studentId ?? ''),
      displayName: String(req.body?.displayName ?? ''),
      className: String(req.body?.className ?? ''),
      password: String(req.body?.password ?? ''),
      electives: readElectiveCodes(req.body?.subjects),
    });
    const { token } = await signIn(user.studentId, String(req.body?.password ?? ''));
    res.cookie('sid', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 30 * 24 * 3600 * 1000 });
    res.status(201).json({ user });
  } catch (err) {
    if (!handleAuthError(err, res)) {
      console.error('[Signup Error]:', err instanceof Error ? err.message : err);
      res.status(500).json({ error: 'Could not create the account.' });
    }
  }
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
  if (!isDatabaseConfigured()) {
    res.status(503).json({ error: 'Accounts are not configured on this server yet.' });
    return;
  }
  try {
    const { user, token } = await signIn(
      String(req.body?.studentId ?? ''),
      String(req.body?.password ?? '')
    );
    res.cookie('sid', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 30 * 24 * 3600 * 1000 });
    res.json({ user });
  } catch (err) {
    if (!handleAuthError(err, res)) {
      console.error('[Login Error]:', err instanceof Error ? err.message : err);
      res.status(500).json({ error: 'Could not sign in.' });
    }
  }
});

app.post('/api/auth/logout', async (req: Request, res: Response) => {
  try {
    if (req.cookies?.sid) await destroySession(req.cookies.sid);
  } catch {
    // Signing out locally still succeeds even if the session row is already gone.
  }
  res.clearCookie('sid');
  res.json({ ok: true });
});

app.get('/api/auth/me', async (req: AuthedRequest, res: Response) => {
  // Subjects are loaded only here, so other routes do not pay for an extra query.
  const user = req.user ? await attachSubjects(req.user) : null;
  res.json({ user });
});

/** Restore the stored Google OAuth access token for the signed-in account. */
app.get('/api/auth/google/token', async (req: AuthedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Sign in to continue.' });
    return;
  }
  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT google_access_token, google_token_expires_at FROM users WHERE id = ${req.user.id}
    `) as any[];
    const row = rows[0];
    const expired =
      row?.google_token_expires_at && new Date(row.google_token_expires_at) <= new Date();
    res.json({
      token: expired ? null : (row?.google_access_token ?? null),
      expiresAt: row?.google_token_expires_at ?? null,
    });
  } catch (err) {
    console.error('[Google Token Restore Error]:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Could not restore your Google token.' });
  }
});

/** Store the Google OAuth access token for the signed-in account (one-time login). */
app.post('/api/auth/google/token', async (req: AuthedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Sign in to continue.' });
    return;
  }
  const { accessToken, expiresInSeconds } = req.body || {};
  if (typeof accessToken !== 'string' || !accessToken) {
    res.status(400).json({ error: 'accessToken is required.' });
    return;
  }
  try {
    const sql = getSql();
    const expiresAt = expiresInSeconds
      ? new Date(Date.now() + Number(expiresInSeconds) * 1000).toISOString()
      : null;
    await sql`
      UPDATE users
      SET google_access_token = ${accessToken}, google_token_expires_at = ${expiresAt}
      WHERE id = ${req.user.id}
    `;
    res.json({ ok: true });
  } catch (err) {
    console.error('[Google Token Store Error]:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Could not store your Google token.' });
  }
});

/** Clear the stored Google token (sign-out / disconnect). */
app.delete('/api/auth/google/token', async (req: AuthedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Sign in to continue.' });
    return;
  }
  try {
    const sql = getSql();
    await sql`UPDATE users SET google_access_token = NULL, google_token_expires_at = NULL WHERE id = ${req.user.id}`;
    // Drop the classroom links too since the token that fetched them is gone.
    await sql`DELETE FROM classroom_links WHERE user_id = ${req.user.id}`;
    res.json({ ok: true });
  } catch (err) {
    console.error('[Google Token Clear Error]:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Could not clear your Google token.' });
  }
});

// List the signed-in student's classroom course links (subject -> Google Classroom course).
app.get('/api/classroom/links', async (req: AuthedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Sign in to continue.' });
    return;
  }
  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT subject_code, classroom_course_id, classroom_course_name, created_at
      FROM classroom_links WHERE user_id = ${req.user.id}
    `) as any[];
    res.json({ links: rows.map((r) => ({
      subjectCode: r.subject_code,
      courseId: r.classroom_course_id,
      courseName: r.classroom_course_name,
      createdAt: r.created_at,
    })) });
  } catch (err) {
    console.error('[Classroom Links List Error]:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Could not load your classroom links.' });
  }
});

// Link a subject to a Google Classroom course the student already connected to.
app.post('/api/classroom/links', async (req: AuthedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Sign in to continue.' });
    return;
  }
  const { subjectCode, courseId, courseName } = req.body || {};
  if (!subjectCode || !courseId) {
    res.status(400).json({ error: 'subjectCode and courseId are required.' });
    return;
  }
  try {
    const sql = getSql();
    const inserted = (await sql`
      INSERT INTO classroom_links (user_id, subject_code, classroom_course_id, classroom_course_name)
      VALUES (${req.user.id}, ${String(subjectCode).toUpperCase().trim()}, ${String(courseId).trim()}, ${courseName ? String(courseName).trim() : null})
      ON CONFLICT (user_id, subject_code) DO UPDATE
        SET classroom_course_id = EXCLUDED.classroom_course_id,
            classroom_course_name = EXCLUDED.classroom_course_name,
            created_at = NOW()
      RETURNING subject_code, classroom_course_id, classroom_course_name
    `) as any[];
    res.status(201).json({ link: inserted[0] });
  } catch (err) {
    console.error('[Classroom Link Create Error]:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Could not link that classroom.' });
  }
});

// Unlink a subject from its Google Classroom course.
app.delete('/api/classroom/links/:subjectCode', async (req: AuthedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Sign in to continue.' });
    return;
  }
  try {
    const sql = getSql();
    await sql`DELETE FROM classroom_links WHERE user_id = ${req.user.id} AND subject_code = ${String(req.params.subjectCode).toUpperCase().trim()}`;
    res.json({ ok: true });
  } catch (err) {
    console.error('[Classroom Link Delete Error]:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Could not unlink that classroom.' });
  }
});

app.get('/api/auth/classes', (_req: Request, res: Response) => {
  res.json({ classes: OLAG_CLASSES });
});

/** Change the subjects on your own account (core and internal ones are automatic). */
app.post('/api/auth/subjects', async (req: AuthedRequest, res: Response) => {
  try {
    if (!req.user) throw new AuthError(401, 'Sign in to change your subjects.');
    if (!Array.isArray(req.body?.subjects)) {
      throw new AuthError(400, 'Send the subjects you study.');
    }
    const user = await setSubjects(req.user, readElectiveCodes(req.body.subjects));
    res.json({ user });
  } catch (err) {
    if (!handleAuthError(err, res)) {
      console.error('[Subjects Error]:', err instanceof Error ? err.message : err);
      res.status(500).json({ error: 'Could not save your subjects.' });
    }
  }
});

/** Verification: admin anywhere, prefect only within their own class. */
app.post('/api/auth/verify', async (req: AuthedRequest, res: Response) => {
  try {
    if (!req.user) throw new AuthError(401, 'Sign in to continue.');
    const user = await setVerified(req.user, String(req.body?.studentId ?? ''), Boolean(req.body?.verified));
    res.json({ user });
  } catch (err) {
    if (!handleAuthError(err, res)) {
      console.error('[Verify Error]:', err instanceof Error ? err.message : err);
      res.status(500).json({ error: 'Could not update verification.' });
    }
  }
});

app.post('/api/auth/prefect/appoint', async (req: AuthedRequest, res: Response) => {
  try {
    if (!req.user) throw new AuthError(401, 'Sign in to continue.');
    const user = await appointPrefect(req.user, String(req.body?.studentId ?? ''), String(req.body?.className ?? ''));
    res.json({ user });
  } catch (err) {
    if (!handleAuthError(err, res)) res.status(500).json({ error: 'Could not appoint prefect.' });
  }
});

app.post('/api/auth/prefect/remove', async (req: AuthedRequest, res: Response) => {
  try {
    if (!req.user) throw new AuthError(401, 'Sign in to continue.');
    const user = await removePrefect(req.user, String(req.body?.studentId ?? ''));
    res.json({ user });
  } catch (err) {
    if (!handleAuthError(err, res)) res.status(500).json({ error: 'Could not remove prefect.' });
  }
});

/** Prefect or admin issues a one-time code. The plaintext code is returned once. */
app.post('/api/auth/reset/issue', async (req: AuthedRequest, res: Response) => {
  try {
    if (!req.user) throw new AuthError(401, 'Sign in to continue.');
    const result = await issueResetCode(req.user, String(req.body?.studentId ?? ''));
    res.json(result);
  } catch (err) {
    if (!handleAuthError(err, res)) res.status(500).json({ error: 'Could not issue a reset code.' });
  }
});

/** Anyone holding a valid code can set a new password. No sign-in required. */
app.post('/api/auth/reset/consume', async (req: Request, res: Response) => {
  try {
    await consumeResetCode(
      String(req.body?.studentId ?? ''),
      String(req.body?.code ?? ''),
      String(req.body?.newPassword ?? '')
    );
    res.json({ ok: true });
  } catch (err) {
    if (!handleAuthError(err, res)) res.status(500).json({ error: 'Could not reset the password.' });
  }
});

app.use('/api/vault', vaultRouter);
app.use('/api/notices', noticesRouter);

/**
 * JSON error handler for the routers above. Without it, a thrown AuthError (or any
 * failure) falls through to Express's default HTML error page, so the browser's
 * JSON parser reports "Unexpected token '<'" instead of the real message.
 */
app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(err);
  if (err instanceof AuthError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error('[API Error]:', err instanceof Error ? err.message : err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

/** Read-only budget indicator: how many Adom AI requests remain today (does not count one). */
app.get('/api/ai/budget', async (req: AuthedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Sign in to continue.' });
    return;
  }
  try {
    const limit =
      req.user.role === 'admin'
        ? AI_DAILY_LIMIT_ADMIN
        : req.user.isVerified
          ? AI_DAILY_LIMIT_STUDENT_VERIFIED
          : AI_DAILY_LIMIT_UNVERIFIED;
    const rows = (await getSql()`
      SELECT requests FROM ai_usage_daily WHERE user_id = ${req.user.id} AND day = CURRENT_DATE
    `) as any[];
    const used = Number(rows[0]?.requests ?? 0);
    res.json({ used, limit, remaining: Math.max(0, limit - used) });
  } catch {
    res.status(503).json({ error: 'Could not read your allowance.' });
  }
});

// Prefer the signed-in account, so one student cannot exhaust the whole school's
// in-memory rate limit. Unauthenticated callers fall back to their socket address;
// X-Forwarded-For is spoofable, so it is deliberately not trusted.
function clientIdFor(req: AuthedRequest): string {
  if (req.user?.id) return `user:${req.user.id}`;
  return `ip:${req.socket.remoteAddress || 'unknown'}`;
}

/**
 * Curriculum grounding for a chat turn.
 *
 * The client sends whatever the student picked, which is a display name ("General
 * Science") from the subject chips. Resolve it to a code, then to that student's own
 * form level, so the block lists the strands and topics actually in their syllabus.
 */
function curriculumContextFor(user: PublicUser | undefined, contextSubject: unknown): string | undefined {
  if (!user || typeof contextSubject !== 'string' || !contextSubject.trim()) return undefined;
  const raw = contextSubject.trim();
  const upper = raw.toUpperCase();
  const byCode = SUBJECTS.find((s) => s.code === upper);
  const byName = SUBJECTS.find((s) => s.name.toLowerCase() === raw.toLowerCase());
  const code = (byCode ?? byName)?.code;
  if (!code) return undefined;
  const block = buildCurriculumBlock({ code, form: formOfClass(user.className) });
  return block || undefined;
}

// Initialize server-side DeepSeek AI Provider
const deepseekProvider = new DeepSeekProvider();

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: deepseekProvider.isModelValid() ? 'ok' : 'misconfigured',
    provider: 'deepseek',
    hasDeepSeekKey: deepseekProvider.isConfigured(),
    model: deepseekProvider.getModelName(),
    modelValid: deepseekProvider.isModelValid(),
    curriculumVersion: CURRICULUM_VERSION,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Free web image search proxy (DuckDuckGo, no API key, no registration).
 *
 * Server-side only so the student's browser never touches a search API and
 * SafeSearch is enforced at the proxy. DeepSeek decides whether an image is
 * needed and what to search for; this endpoint just fetches real results.
 */
app.get('/api/ai/images', async (req: Request, res: Response) => {
  const { q } = req.query;
  if (!q || typeof q !== 'string' || !q.trim()) {
    res.status(400).json({ error: 'A search query is required.' });
    return;
  }

  try {
    // DuckDuckGo image search JSON endpoint. SafeSearch=moderate for school use.
    const encoded = encodeURIComponent(q.trim());
    const duckRes = await fetch(
      `https://duckduckgo.com/i.js?q=${encoded}&l=wt-wt&o=json&safesearch=1`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (ClassApp-AdomAI/1.0)',
          Accept: 'application/json',
        },
      }
    );

    if (!duckRes.ok) {
      res.status(502).json({ error: 'Image search service is unavailable right now.' });
      return;
    }

    const data = (await duckRes.json()) as any;
    const results = Array.isArray(data?.results) ? data.results : [];

    const images = results
      .slice(0, 6)
      .map((item: any) => ({
        title: typeof item.title === 'string' ? item.title.slice(0, 120) : '',
        image_url: typeof item.image === 'string' ? item.image : '',
        thumbnail: typeof item.thumbnail === 'string' ? item.thumbnail : '',
        source_url: typeof item.url === 'string' ? item.url : '',
      }))
      .filter((img: any) => img.image_url);

    res.json({ query: q.trim(), images, count: images.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Image search failed.';
    console.error('[AI Images Error]:', msg);
    res.status(502).json({ error: msg });
  }
});

/**
 * Shared preflight for every AI route. Returns false after the response has been sent.
 * Requires a signed-in user, then applies the per-user daily allowance (smaller until verified).
 */
async function rejectAiRequestIfUnavailable(req: AuthedRequest, res: Response): Promise<boolean> {
  if (!deepseekProvider.isModelValid()) {
    console.error(`[DeepSeek Config Error]: ${deepseekProvider.getConfigError()}`);
    res.status(503).json({
      success: false,
      error: 'The DeepSeek model configured on this server is not supported. Contact the administrator.',
      isOfflineFallback: true,
    });
    return true;
  }
  if (!deepseekProvider.isConfigured()) {
    res.status(503).json({
      success: false,
      error: 'DEEPSEEK_API_KEY is not configured on the server. Falling back to local study tools.',
      isOfflineFallback: true,
    });
    return true;
  }
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Sign in to use Adom AI.' });
    return true;
  }
  try {
    const usage = await checkAndCountAiUsage(req.user);
    if (!usage.allowed) {
      res.status(429).json({
        success: false,
        error: req.user.isVerified
          ? `You have used all ${usage.limit} Adom AI requests for today. Try again tomorrow.`
          : `Unverified accounts get ${usage.limit} Adom AI requests a day. Ask your class prefect to verify you for more.`,
        isOfflineFallback: true,
      });
      return true;
    }

    const fuse = await countSchoolFuse();
    if (!fuse.allowed) {
      // Fuse blocked the generation — hand the personal request straight back.
      await refundAiUsage(req.user);
      res.status(429).json({
        success: false,
        error: 'The school has reached its daily Adom AI limit. Try again tomorrow.',
        isOfflineFallback: true,
      });
      return true;
    }
  } catch (err) {
    console.error('[AI Usage Error]:', err instanceof Error ? err.message : err);
    res.status(503).json({ success: false, error: 'Could not check your AI allowance. Try again shortly.' });
    return true;
  }
  return false;
}

// Chat completion with multi-turn and context support
app.post('/api/ai/chat', async (req: AuthedRequest, res: Response) => {
  try {
    const clientId = clientIdFor(req);
    const rateCheck = checkRateLimit(clientId);
    if (!rateCheck.allowed) {
      res.status(429).json({
        success: false,
        error: 'Too many requests. Please pause for a few seconds before asking Adom AI again.',
        isOfflineFallback: true,
      });
      return;
    }

    const { message, contextSubject, fileContext, history, deep, memory, wantTitle, wantImage, wantChart, teacherMode } = req.body || {};
    if (!message || typeof message !== 'string' || !message.trim()) {
      res.status(400).json({ success: false, error: 'A valid message string is required.' });
      return;
    }

    if (deep === true) {
      // "Think deeper" costs two regular requests and uses the stronger model.
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Sign in to use Adom AI.' });
        return;
      }
      const bulk = await countAiUsageBulk(req.user, 2);
      if (!bulk.allowed) {
        res.status(429).json({
          success: false,
          error: `Think deeper needs 2 requests and only ${Math.max(0, bulk.limit - bulk.used)} remain today. Try again tomorrow.`,
          isOfflineFallback: true,
        });
        return;
      }
      const fuse = await countSchoolFuse();
      if (!fuse.allowed) {
        await refundAiUsage(req.user);
        await refundAiUsage(req.user);
        res.status(429).json({
          success: false,
          error: 'The school has reached its daily Adom AI limit. Try again tomorrow.',
          isOfflineFallback: true,
        });
        return;
      }
    } else if (await rejectAiRequestIfUnavailable(req, res)) {
      return;
    }

    try {
      const result = await deepseekProvider.chat({
        message,
        contextSubject,
        curriculumContext: curriculumContextFor(req.user, contextSubject),
        fileContext,
        history,
        memory: typeof memory === 'string' ? memory.slice(0, 600) : undefined,
        deep,
        wantTitle,
        wantImage: wantImage === true,
        wantChart: wantChart === true,
        teacherMode: teacherMode === true,
      });

      // When DeepSeek asked for an image search, fetch real results from DuckDuckGo.
      let images = result.images?.length ? result.images : undefined;
      if (images && images.some((img: any) => img._searchQuery)) {
        try {
          const encoded = encodeURIComponent(String(images[0]._searchQuery));
          const duckRes = await fetch(
            `https://duckduckgo.com/i.js?q=${encoded}&l=wt-wt&o=json&safesearch=1`,
            {
              headers: {
                'User-Agent': 'Mozilla/5.0 (ClassApp-AdomAI/1.0)',
                Accept: 'application/json',
              },
            }
          );
          if (duckRes.ok) {
            const data = (await duckRes.json()) as any;
            const results = Array.isArray(data?.results) ? data.results : [];
            images = results
              .slice(0, 6)
              .map((item: any) => ({
                title: typeof item.title === 'string' ? item.title.slice(0, 120) : '',
                image_url: typeof item.image === 'string' ? item.image : '',
                thumbnail: typeof item.thumbnail === 'string' ? item.thumbnail : '',
                source_url: typeof item.url === 'string' ? item.url : '',
              }))
              .filter((img: any) => img.image_url);
          }
        } catch {
          // Image fetch failed: text answer still stands, images stay empty.
        }
      }
      // Strip internal fields before sending to the client.
      if (images) {
        images = images.map(({ _searchQuery, ...rest }) => rest);
      }

      res.json({
        success: true,
        text: result.text,
        mode: result.mode,
        engine: 'deepseek',
        title: result.nudge,
        nudge: result.nudge,
        images,
        chart: result.chart,
        teacherMode: result.teacherMode,
      });    } catch (err) {
      // The AI itself failed: give the student their request back. A deep request
      // was charged 2 credits, so refund 2 as well.
      if (req.user) {
        await refundAiUsage(req.user).catch(() => {});
        if (deep === true) await refundAiUsage(req.user).catch(() => {});
      }
      throw err;
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error during DeepSeek processing';
    console.error('[DeepSeek Chat Error]:', errorMsg);
    res.status(500).json({
      success: false,
      error: errorMsg,
      isOfflineFallback: true,
    });
  }
});

/**
 * Shared guard for both chat endpoints (JSON and stream). Returns true when the request
 * was already answered with an error, false when the AI call may proceed.
 */
async function guardChatRequest(req: AuthedRequest, res: Response, deep: unknown): Promise<boolean> {
  const clientId = clientIdFor(req);
  const rateCheck = checkRateLimit(clientId);
  if (!rateCheck.allowed) {
    res.status(429).json({
      success: false,
      error: 'Too many requests. Please pause for a few seconds before asking Adom AI again.',
      isOfflineFallback: true,
    });
    return true;
  }

  if (deep === true) {
    // "Think deeper" costs two regular requests and uses the stronger model.
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Sign in to use Adom AI.' });
      return true;
    }
    const bulk = await countAiUsageBulk(req.user, 2);
    if (!bulk.allowed) {
      res.status(429).json({
        success: false,
        error: `Think deeper needs 2 requests and only ${Math.max(0, bulk.limit - bulk.used)} remain today. Try again tomorrow.`,
        isOfflineFallback: true,
      });
      return true;
    }
    const fuse = await countSchoolFuse();
    if (!fuse.allowed) {
      await refundAiUsage(req.user);
      await refundAiUsage(req.user);
      res.status(429).json({
        success: false,
        error: 'The school has reached its daily Adom AI limit. Try again tomorrow.',
        isOfflineFallback: true,
      });
      return true;
    }
    return false;
  }

  return rejectAiRequestIfUnavailable(req, res);
}

// Streaming chat completion (Server-Sent Events). Words reach the student as they are written.
app.post('/api/ai/chat/stream', async (req: AuthedRequest, res: Response) => {
  const { message, contextSubject, fileContext, history, deep, memory, wantTitle, wantImage, wantChart, teacherMode } = req.body || {};
  if (!message || typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ success: false, error: 'A valid message string is required.' });
    return;
  }

  try {
    if (await guardChatRequest(req, res, deep)) return;

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    // Stop the upstream stream if the student closes the tab or taps Stop.
    const clientGone = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) clientGone.abort();
    });

    let wroteAnyText = false;
    const sse = (event: string, data: any) => {
        if (res.writableEnded) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const result = await deepseekProvider.chatStream(
        {
          message,
          contextSubject,
          curriculumContext: curriculumContextFor(req.user, contextSubject),
          fileContext,
          history,
          memory: typeof memory === 'string' ? memory.slice(0, 600) : undefined,
          deep,
          wantTitle,
          wantImage: wantImage === true,
          wantChart: wantChart === true,
          teacherMode: teacherMode === true,
          signal: clientGone.signal,
        },
        (delta) => {
          wroteAnyText = true;
          sse('delta', { text: delta });
        }
      );

      // When DeepSeek asked for an image search, fetch real results before finishing.
      let doneImages = result.images;
      if (doneImages && doneImages.some((img: any) => img._searchQuery)) {
        try {
          const encoded = encodeURIComponent(String(doneImages[0]._searchQuery));
          const duckRes = await fetch(
            `https://duckduckgo.com/i.js?q=${encoded}&l=wt-wt&o=json&safesearch=1`,
            {
              headers: {
                'User-Agent': 'Mozilla/5.0 (ClassApp-AdomAI/1.0)',
                Accept: 'application/json',
              },
            }
          );
          if (duckRes.ok) {
            const data = (await duckRes.json()) as any;
            const results = Array.isArray(data?.results) ? data.results : [];
            doneImages = results
              .slice(0, 6)
              .map((item: any) => ({
                title: typeof item.title === 'string' ? item.title.slice(0, 120) : '',
                image_url: typeof item.image === 'string' ? item.image : '',
                thumbnail: typeof item.thumbnail === 'string' ? item.thumbnail : '',
                source_url: typeof item.url === 'string' ? item.url : '',
              }))
              .filter((img: any) => img.image_url);
          }
        } catch {
          // Image fetch failed: text already streamed, images stay empty.
        }
      }
      if (doneImages) {
        doneImages = doneImages.map(({ _searchQuery, ...rest }) => rest);
      }

      sse('done', {
        success: true,
        text: result.text,
        mode: result.mode,
        engine: 'deepseek',
        title: result.nudge,
        nudge: result.nudge,
        images: doneImages,
        chart: result.chart,
        teacherMode: result.teacherMode,
      });
    } catch (err) {
      // The AI itself failed: give the student their allowance back. 'Think deeper' was
      // charged 2 credits up front, so it must be refunded 2 — not 1, which silently ate
      // a request every time a deep answer failed.
      if (req.user && !clientGone.signal.aborted) {
        const refunds = deep === true ? 2 : 1;
        for (let r = 0; r < refunds; r++) await refundAiUsage(req.user).catch(() => {});
      }
      const errorMsg = err instanceof Error ? err.message : 'Unknown error during DeepSeek processing';
      console.error('[DeepSeek Stream Error]:', errorMsg);
      sse('error', {
        success: false,
        error: errorMsg,
        // Partial text lets the client keep what the student already read.
        partial: wroteAnyText,
        isOfflineFallback: true,
      });
    } finally {
      if (!res.writableEnded) res.end();
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error during DeepSeek processing';
    console.error('[DeepSeek Stream Setup Error]:', errorMsg);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: errorMsg, isOfflineFallback: true });
    } else if (!res.writableEnded) {
      res.end();
    }
  }
});

/**
 * Shared study library: one generated quiz/deck serves the whole school for free.
 * Returns null when nothing is stored yet (or the database is not configured).
 */
async function getStudyLibraryEntry(key: string): Promise<any | null> {
  if (!isDatabaseConfigured()) return null;
  try {
    const rows = (await getSql()`
      SELECT payload FROM shared_studies WHERE key = ${key} LIMIT 1
    `) as any[];
    return rows[0]?.payload ?? null;
  } catch {
    // A library read must never block a generation.
    return null;
  }
}

/**
 * Key for the shared study library.
 *
 * The count is the CLAMPED size (never the raw request): 25-question Full sets and
 * 4-question document quizzes are different products, not one entry with a loose cap.
 * The variant is only included when non-zero, so a plain reopen still hits the cache
 * while an explicit "new set" gets fresh questions.
 */
function sharedStudyKey(
  kind: StudyKind,
  topic: string,
  subjectCode: unknown,
  count: unknown,
  strand: unknown,
  formLevel: unknown,
  variant: unknown
): string {
  const normalisedTopic = String(topic).trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 160);
  const num = clampStudyCount(kind, count);
  const strandKey = String(strand || '').trim().toLowerCase().slice(0, 80);
  const formKey = Number(formLevel) === 1 || Number(formLevel) === 2 || Number(formLevel) === 3 ? String(Number(formLevel)) : '';
  const variantNum = Math.max(0, Math.trunc(Number(variant)) || 0);
  const base = `${kind}:v${CURRICULUM_VERSION}:${normalisedTopic}:${String(subjectCode || '').toUpperCase()}:${strandKey}:${formKey}:${num}`;
  return variantNum > 0 ? `${base}:r${variantNum}` : base;
}

/**
 * Form level for a student's class ("2 Science 1" -> 2). The curriculum block and the
 * library key both use it, so a Form 2 quiz cannot serve a Form 1 question set.
 */
function formOfClass(className: string | undefined | null): number | null {
  return formOf(String(className || ''));
}

/**
 * Shared preflight for a study generation: checks the daily allowance once, and
 * charges the whole-school fuse for every provider call the request will make.
 * Returns false after the response has been sent.
 */
async function guardStudyRequest(
  req: AuthedRequest,
  res: Response,
  kind: StudyKind,
  count: number
): Promise<boolean> {
  if (await rejectAiRequestIfUnavailable(req, res)) return false;
  const user = req.user!;
  const batches = batchesFor(kind, count);
  if (batches > STUDY_MAX_BATCHES) {
    res.status(400).json({
      success: false,
      error: 'That set is too large to generate in one go. Ask for a smaller one.',
    });
    return false;
  }
  const fuse = await countSchoolFuseBulk(batches);
  if (!fuse.allowed) {
    await refundAiUsage(user).catch(() => {});
    res.status(429).json({
      success: false,
      error: 'The school has reached its daily Adom AI limit. Try again tomorrow.',
      isOfflineFallback: true,
    });
    return false;
  }
  return true;
}

/** A full-length set costs 2 credits; Quick and Standard cost 1. */
async function chargeStudyCredits(req: AuthedRequest, res: Response, kind: StudyKind, count: number): Promise<boolean> {
  const credits = creditsFor(kind, count);
  if (credits <= 1) return true; // the standard 1 credit was already taken above
  const bulk = await countAiUsageBulk(req.user!, credits - 1);
  if (!bulk.allowed) {
    await refundAiUsage(req.user!).catch(() => {});
    // The school fuse for every planned batch was already reserved; nothing ran.
    await refundSchoolFuse(batchesFor(kind, count)).catch(() => {});
    res.status(429).json({
      success: false,
      error: `A full-length ${kind === 'quiz' ? 'quiz' : 'deck'} needs ${credits} requests and only ${Math.max(0, bulk.limit - bulk.used)} remain today. Try Standard instead, or come back tomorrow.`,
      isOfflineFallback: true,
    });
    return false;
  }
  return true;
}

/** Best-effort write to the shared library. The set itself was already delivered. */
async function storeSharedStudy(
  key: string,
  kind: StudyKind,
  subjectCode: unknown,
  payload: unknown,
  userId: number
): Promise<void> {
  if (!isDatabaseConfigured()) return;
  try {
    await getSql()`
      INSERT INTO shared_studies (key, kind, subject_code, payload, created_by)
      VALUES (${key}, ${kind}, ${subjectCode ? String(subjectCode).slice(0, 40) : null},
              ${JSON.stringify(payload)}::jsonb, ${userId})
      ON CONFLICT (key) DO NOTHING
    `;
  } catch {
    // Library write is best-effort; the set itself is already delivered.
  }
}

// Dynamic Quiz Generation endpoint
app.post('/api/ai/quiz', async (req: AuthedRequest, res: Response) => {
  try {
    const clientId = clientIdFor(req);
    const rateCheck = checkRateLimit(clientId);
    if (!rateCheck.allowed) {
      res.status(429).json({
        success: false,
        error: 'Rate limit reached. Please wait a moment.',
        isOfflineFallback: true,
      });
      return;
    }

    const { topic, subjectCode, fileContext, count, strand, variant, formLevel } = req.body || {};

    if (!topic || typeof topic !== 'string' || !topic.trim()) {
      res.status(400).json({ success: false, error: 'A study topic is required.' });
      return;
    }

    if (!req.user) {
      res.status(401).json({ success: false, error: 'Sign in to use Adom AI.' });
      return;
    }

    const size = clampStudyCount('quiz', count);
    const form = formOfClass(req.user.className) ?? (Number(formLevel) || null);
    const hasDocumentContext = typeof fileContext === 'string' && fileContext.trim().length > 0;

    // A quiz another student already generated is free for everyone — but never when
    // it was generated from someone's private attached note.
    const libraryKey = sharedStudyKey('quiz', topic, subjectCode, size, strand, form, variant);
    const shared = hasDocumentContext ? null : await getStudyLibraryEntry(libraryKey);
    if (shared) {
      res.json({
        success: true,
        questions: shared.questions,
        quizTitle: shared.quizTitle,
        engine: 'deepseek',
        shared: true,
        count: Array.isArray(shared.questions) ? shared.questions.length : size,
      });
      return;
    }

    if (await guardStudyRequest(req, res, 'quiz', size)) {
      if (!(await chargeStudyCredits(req, res, 'quiz', size))) return;
    } else {
      return;
    }

    let result: { questions: any[]; quizTitle: string; calls: number };
    try {
      result = await deepseekProvider.generateQuiz({
        topic,
        subjectCode,
        formLevel: form,
        strand: typeof strand === 'string' ? strand : null,
        fileContext,
        count: size,
        variant: Math.max(0, Math.trunc(Number(variant)) || 0),
      });
    } catch (err) {
      // The AI itself failed: give the student their requests back, and the school
      // its fuse units, since nothing was delivered.
      await refundAiUsage(req.user).catch(() => {});
      if (creditsFor('quiz', size) > 1) await refundAiUsage(req.user).catch(() => {});
      await refundSchoolFuse(batchesFor('quiz', size)).catch(() => {});
      throw err;
    }

    // What the provider could not deliver is refunded, so a short set costs less.
    const delivered = result.questions.length;
    const missing = Math.max(0, batchesFor('quiz', size) - Math.max(1, Math.ceil(delivered / STUDY_BATCH_SIZE.quiz)));
    if (missing > 0) await refundSchoolFuse(missing).catch(() => {});
    // A Full set costs 2 credits. If it came back no larger than a Standard set,
    // the student paid for a full generation that did not happen.
    if (creditsFor('quiz', size) > 1 && delivered <= STUDY_SIZES.quiz.standard) {
      await refundAiUsage(req.user).catch(() => {});
    }

    if (!hasDocumentContext) {
      await storeSharedStudy(
        libraryKey,
        'quiz',
        subjectCode,
        { questions: result.questions, quizTitle: result.quizTitle },
        req.user.id
      );
    }

    res.json({
      success: true,
      questions: result.questions,
      quizTitle: result.quizTitle,
      engine: 'deepseek',
      count: delivered,
      requested: size,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Error generating quiz with DeepSeek';
    console.error('[DeepSeek Quiz Error]:', errorMsg);
    res.status(500).json({
      success: false,
      error: errorMsg,
      isOfflineFallback: true,
    });
  }
});

// Dynamic Flashcard Deck Generation endpoint
app.post('/api/ai/flashcards', async (req: AuthedRequest, res: Response) => {
  try {
    const clientId = clientIdFor(req);
    const rateCheck = checkRateLimit(clientId);
    if (!rateCheck.allowed) {
      res.status(429).json({
        success: false,
        error: 'Rate limit reached. Please wait a moment.',
        isOfflineFallback: true,
      });
      return;
    }

    const { topic, subjectCode, fileContext, count, strand, variant, formLevel } = req.body || {};

    if (!topic || typeof topic !== 'string' || !topic.trim()) {
      res.status(400).json({ success: false, error: 'A study topic is required.' });
      return;
    }

    if (!req.user) {
      res.status(401).json({ success: false, error: 'Sign in to use Adom AI.' });
      return;
    }

    const size = clampStudyCount('flashcards', count);
    const form = formOfClass(req.user.className) ?? (Number(formLevel) || null);
    const hasDocumentContext = typeof fileContext === 'string' && fileContext.trim().length > 0;

    // A deck another student already generated is free for everyone — but never when
    // it was generated from someone's private attached note.
    const libraryKey = sharedStudyKey('flashcards', topic, subjectCode, size, strand, form, variant);
    const shared = hasDocumentContext ? null : await getStudyLibraryEntry(libraryKey);
    if (shared) {
      res.json({
        success: true,
        flashcards: shared.flashcards,
        topic: shared.topic,
        engine: 'deepseek',
        shared: true,
        count: Array.isArray(shared.flashcards) ? shared.flashcards.length : size,
      });
      return;
    }

    if (await guardStudyRequest(req, res, 'flashcards', size)) {
      if (!(await chargeStudyCredits(req, res, 'flashcards', size))) return;
    } else {
      return;
    }

    let result: { flashcards: any[]; topic: string; calls: number };
    try {
      result = await deepseekProvider.generateFlashcards({
        topic,
        subjectCode,
        formLevel: form,
        strand: typeof strand === 'string' ? strand : null,
        fileContext,
        count: size,
        variant: Math.max(0, Math.trunc(Number(variant)) || 0),
      });
    } catch (err) {
      await refundAiUsage(req.user).catch(() => {});
      if (creditsFor('flashcards', size) > 1) await refundAiUsage(req.user).catch(() => {});
      await refundSchoolFuse(batchesFor('flashcards', size)).catch(() => {});
      throw err;
    }

    const delivered = result.flashcards.length;
    const missing = Math.max(
      0,
      batchesFor('flashcards', size) - Math.max(1, Math.ceil(delivered / STUDY_BATCH_SIZE.flashcards))
    );
    if (missing > 0) await refundSchoolFuse(missing).catch(() => {});
    if (creditsFor('flashcards', size) > 1 && delivered <= STUDY_SIZES.flashcards.standard) {
      await refundAiUsage(req.user).catch(() => {});
    }

    if (!hasDocumentContext) {
      await storeSharedStudy(
        libraryKey,
        'flashcards',
        subjectCode,
        { flashcards: result.flashcards, topic: result.topic },
        req.user.id
      );
    }

    res.json({
      success: true,
      flashcards: result.flashcards,
      topic: result.topic,
      engine: 'deepseek',
      count: delivered,
      requested: size,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Error generating flashcards with DeepSeek';
    console.error('[DeepSeek Flashcard Error]:', errorMsg);
    res.status(500).json({
      success: false,
      error: errorMsg,
      isOfflineFallback: true,
    });
  }
});

// Document Summarization / Revision Notes endpoint
app.post('/api/ai/summarize', async (req: AuthedRequest, res: Response) => {
  try {
    const clientId = clientIdFor(req);
    const rateCheck = checkRateLimit(clientId);
    if (!rateCheck.allowed) {
      res.status(429).json({
        success: false,
        error: 'Rate limit reached. Please wait a moment.',
        isOfflineFallback: true,
      });
      return;
    }

    const { documentName, documentContent, subjectCode } = req.body || {};

    if (!documentContent || typeof documentContent !== 'string' || !documentContent.trim()) {
      res.status(400).json({ success: false, error: 'Document content is required.' });
      return;
    }

    if (await rejectAiRequestIfUnavailable(req, res)) return;

    const form = formOfClass(req.user!.className);
    let result: { summary: string; calls: number };
    try {
      result = await deepseekProvider.summarize({
        documentName,
        documentContent,
        subjectCode,
        formLevel: form,
      });
    } catch (err) {
      if (req.user) await refundAiUsage(req.user).catch(() => {});
      throw err;
    }

    res.json({
      success: true,
      summary: result.summary,
      engine: 'deepseek',
      ...(result.calls === 0 ? { shared: true } : {}),
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Error generating summary with DeepSeek';
    console.error('[DeepSeek Summary Error]:', errorMsg);
    res.status(500).json({
      success: false,
      error: errorMsg,
      isOfflineFallback: true,
    });
  }
});

// ---------------------------------------------------------------- Adom AI threads (cloud persistence)
// Conversations are saved per signed-in student and kept until deleted.

const MAX_THREAD_MESSAGES = 200;
const MAX_MESSAGE_CHARS = 20000;
const THREAD_ID_RE = /^t-[A-Za-z0-9_-]{1,100}$/;
const MESSAGE_ID_RE = /^[A-Za-z0-9_-]{1,120}$/;

/**
 * Message ids are generated in the browser (`u-<timestamp>`), so two students can
 * produce the same id. Prefix them with the thread id before they reach the global
 * primary key; the read path strips the prefix again.
 */
function dbMessageId(threadId: string, clientId: string): string {
  const clean = clientId.trim().slice(0, 100);
  const prefix = `${threadId}:`;
  return clean.startsWith(prefix) ? clean : `${prefix}${clean}`;
}

function clientMessageId(threadId: string, dbId: string): string {
  const prefix = `${threadId}:`;
  return dbId.startsWith(prefix) ? dbId.slice(prefix.length) : dbId;
}

app.get('/api/ai/threads', async (req: AuthedRequest, res: Response) => {
  if (!isDatabaseConfigured()) {
    res.status(503).json({ error: 'Accounts are not configured on this server yet.' });
    return;
  }
  if (!req.user) {
    res.status(401).json({ error: 'Sign in to continue.' });
    return;
  }
  try {
    const rows = (await getSql()`
      SELECT ct.id, ct.title, ct.title_is_ai AS "titleIsAi",
             ct.created_at AS "createdAt", ct.updated_at AS "updatedAt",
             COUNT(cm.id)::int AS messageCount
      FROM chat_threads ct
      LEFT JOIN chat_messages cm ON cm.thread_id = ct.id
      WHERE ct.user_id = ${req.user.id}
      GROUP BY ct.id, ct.title, ct.title_is_ai, ct.created_at, ct.updated_at
      ORDER BY ct.updated_at DESC
    `) as any[];
    res.json({ threads: rows });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Could not load your chats.';
    console.error('[AI Threads List Error]:', msg);
    res.status(500).json({ error: msg });
  }
});

app.get('/api/ai/threads/:id', async (req: AuthedRequest, res: Response) => {
  if (!isDatabaseConfigured()) {
    res.status(503).json({ error: 'Accounts are not configured on this server yet.' });
    return;
  }
  if (!req.user) {
    res.status(401).json({ error: 'Sign in to continue.' });
    return;
  }
  try {
    const { id } = req.params;
    const thread = (await getSql()`
      SELECT id, title, title_is_ai AS "titleIsAi", created_at AS "createdAt", updated_at AS "updatedAt"
      FROM chat_threads WHERE id = ${id} AND user_id = ${req.user.id}
    `) as any[];
    if (!thread[0]) {
      res.status(404).json({ error: 'Chat not found.' });
      return;
    }
    const messages = (await getSql()`
      SELECT id, sender, content, timestamp, mode, engine, streaming, error, interactive_data AS "interactiveData"
      FROM chat_messages WHERE thread_id = ${id}
      ORDER BY created_at ASC
    `) as any[];
    res.json({
      thread: {
        ...thread[0],
        messages: messages.map((m) => ({ ...m, id: clientMessageId(id, String(m.id)) })),
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Could not load that chat.';
    console.error('[AI Thread Get Error]:', msg);
    res.status(500).json({ error: msg });
  }
});

app.post('/api/ai/threads', async (req: AuthedRequest, res: Response) => {
  if (!isDatabaseConfigured()) {
    res.status(503).json({ error: 'Accounts are not configured on this server yet.' });
    return;
  }
  if (!req.user) {
    res.status(401).json({ error: 'Sign in to continue.' });
    return;
  }
  const userId = req.user.id;
  const { id, title, titleIsAi, createdAt, updatedAt, messages } = req.body || {};
  if (typeof id !== 'string' || !THREAD_ID_RE.test(id)) {
    res.status(400).json({ error: 'Send a valid chat id.' });
    return;
  }
  const cleanTitle = typeof title === 'string' ? title.trim().slice(0, 120) : '';
  if (!cleanTitle || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'Send a complete conversation (id, title, messages).' });
    return;
  }
  if (messages.length > MAX_THREAD_MESSAGES) {
    res.status(413).json({ error: `A chat can hold at most ${MAX_THREAD_MESSAGES} messages.` });
    return;
  }

  const cleanMessages: Array<{
    dbId: string;
    sender: 'user' | 'assistant';
    content: string;
    timestamp: string;
    mode: string | null;
    engine: string | null;
    error: string | null;
    interactiveData: string | null;
  }> = [];
  const seen = new Set<string>();

  for (const raw of messages) {
    if (!raw || typeof raw !== 'object') {
      res.status(400).json({ error: 'Every message must be an object.' });
      return;
    }
    const clientId = typeof raw.id === 'string' ? raw.id.trim() : '';
    const sender = raw.sender === 'user' || raw.sender === 'assistant' ? raw.sender : null;
    const content = typeof raw.content === 'string' ? raw.content : '';
    if (!MESSAGE_ID_RE.test(clientId) || !sender || !content.trim()) {
      res.status(400).json({ error: 'Every message needs a valid id, sender and content.' });
      return;
    }
    if (content.length > MAX_MESSAGE_CHARS) {
      res.status(413).json({ error: `A message can be at most ${MAX_MESSAGE_CHARS} characters.` });
      return;
    }
    const dbId = dbMessageId(id, clientId);
    if (seen.has(dbId)) continue;
    seen.add(dbId);

    cleanMessages.push({
      dbId,
      sender,
      content,
      timestamp: String(raw.timestamp ?? '').slice(0, 40),
      mode: typeof raw.mode === 'string' ? raw.mode.slice(0, 20) : null,
      engine: typeof raw.engine === 'string' ? raw.engine.slice(0, 20) : null,
      error: typeof raw.error === 'string' ? raw.error.slice(0, 500) : null,
      interactiveData: raw.interactiveData ? JSON.stringify(raw.interactiveData) : null,
    });
  }

  if (cleanMessages.length === 0) {
    res.status(400).json({ error: 'That chat has no messages to save.' });
    return;
  }

  const created = new Date(createdAt);
  const updated = new Date(updatedAt);
  const createdIso = Number.isFinite(created.getTime()) ? created.toISOString() : new Date().toISOString();
  const updatedIso = Number.isFinite(updated.getTime()) ? updated.toISOString() : new Date().toISOString();

  try {
    const sql = getSql();

    // Atomic: create/update the thread only if it belongs to this account, replace its
    // messages, and never leave a half-written thread if one insert fails.
    const upsert = sql`
      INSERT INTO chat_threads (id, user_id, title, title_is_ai, created_at, updated_at)
      VALUES (${id}, ${userId}, ${cleanTitle}, ${Boolean(titleIsAi)}, ${createdIso}, ${updatedIso})
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        title_is_ai = EXCLUDED.title_is_ai,
        updated_at = EXCLUDED.updated_at
      WHERE chat_threads.user_id = ${userId}
      RETURNING id
    `;

    const ownership = sql`SELECT 1 FROM chat_threads WHERE id = ${id} AND user_id = ${userId}`;
    const clear = sql`
      DELETE FROM chat_messages
      WHERE thread_id = ${id}
        AND EXISTS (SELECT 1 FROM chat_threads WHERE id = ${id} AND user_id = ${userId})
    `;
    const inserts = cleanMessages.map(
      (m) => sql`
        INSERT INTO chat_messages
          (id, thread_id, user_id, sender, content, timestamp, mode, engine, streaming, error, interactive_data)
        SELECT
          ${m.dbId}, ${id}, ${userId}, ${m.sender}, ${m.content}, ${m.timestamp},
          ${m.mode}, ${m.engine}, FALSE, ${m.error}, ${m.interactiveData}
        WHERE EXISTS (SELECT 1 FROM chat_threads WHERE id = ${id} AND user_id = ${userId})
        ON CONFLICT (id) DO NOTHING
      `
    );

    const results = await sql.transaction([upsert, ownership, clear, ...inserts]);
    const ownsThread = Array.isArray(results[0]) && results[0].length > 0;
    const stillOwned = Array.isArray(results[1]) && results[1].length > 0;
    if (!ownsThread || !stillOwned) {
      res.status(409).json({ error: 'That chat belongs to another account.' });
      return;
    }

    res.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Could not save the chat.';
    console.error('[AI Thread Save Error]:', msg);
    res.status(500).json({ error: msg });
  }
});

app.delete('/api/ai/threads/:id', async (req: AuthedRequest, res: Response) => {
  if (!isDatabaseConfigured()) {
    res.status(503).json({ error: 'Accounts are not configured on this server yet.' });
    return;
  }
  if (!req.user) {
    res.status(401).json({ error: 'Sign in to continue.' });
    return;
  }
  try {
    await getSql()`
      DELETE FROM chat_threads WHERE id = ${req.params.id} AND user_id = ${req.user.id}
    `;
    res.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Could not delete that chat.';
    console.error('[AI Thread Delete Error]:', msg);
    res.status(500).json({ error: msg });
  }
});

// Google Workspace API Proxy Endpoints
// Eliminates browser CORS issues for Google Classroom and Google Drive APIs
app.get('/api/workspace/classroom/courses', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ error: 'Missing Authorization header' });
    return;
  }
  try {
    const googleRes = await fetch('https://classroom.googleapis.com/v1/courses?studentId=me&courseStates=ACTIVE', {
      headers: { Authorization: authHeader },
    });
    const data = await googleRes.json().catch(() => ({}));
    if (!googleRes.ok) {
      res.status(googleRes.status).json(data);
      return;
    }
    res.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Classroom proxy request failed';
    console.error('[Classroom Courses Proxy Error]:', msg);
    res.status(502).json({ error: msg });
  }
});

app.get('/api/workspace/classroom/courses/:courseId/courseWork', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ error: 'Missing Authorization header' });
    return;
  }
  try {
    const { courseId } = req.params;
    const googleRes = await fetch(
      `https://classroom.googleapis.com/v1/courses/${encodeURIComponent(courseId)}/courseWork?courseWorkStates=PUBLISHED`,
      { headers: { Authorization: authHeader } }
    );
    const data = await googleRes.json().catch(() => ({}));
    if (!googleRes.ok) {
      res.status(googleRes.status).json(data);
      return;
    }
    res.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'CourseWork proxy request failed';
    console.error('[Classroom CourseWork Proxy Error]:', msg);
    res.status(502).json({ error: msg });
  }
});

app.get('/api/workspace/classroom/courses/:courseId/announcements', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ error: 'Missing Authorization header' });
    return;
  }
  try {
    const { courseId } = req.params;
    const googleRes = await fetch(
      `https://classroom.googleapis.com/v1/courses/${encodeURIComponent(courseId)}/announcements`,
      { headers: { Authorization: authHeader } }
    );
    const data = await googleRes.json().catch(() => ({}));
    if (!googleRes.ok) {
      res.status(googleRes.status).json(data);
      return;
    }
    res.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Announcements proxy request failed';
    console.error('[Classroom Announcements Proxy Error]:', msg);
    res.status(502).json({ error: msg });
  }
});

app.get('/api/workspace/classroom/courses/:courseId/courseWorkMaterials', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ error: 'Missing Authorization header' });
    return;
  }
  try {
    const { courseId } = req.params;
    const googleRes = await fetch(
      `https://classroom.googleapis.com/v1/courses/${encodeURIComponent(courseId)}/courseWorkMaterials`,
      { headers: { Authorization: authHeader } }
    );
    const data = await googleRes.json().catch(() => ({}));
    if (!googleRes.ok) {
      res.status(googleRes.status).json(data);
      return;
    }
    res.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'CourseWorkMaterials proxy request failed';
    console.error('[Classroom CourseWorkMaterials Proxy Error]:', msg);
    res.status(502).json({ error: msg });
  }
});

app.get('/api/workspace/classroom/courses/:courseId/teachers', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ error: 'Missing Authorization header' });
    return;
  }
  try {
    const { courseId } = req.params;
    const googleRes = await fetch(
      `https://classroom.googleapis.com/v1/courses/${encodeURIComponent(courseId)}/teachers`,
      { headers: { Authorization: authHeader } }
    );
    const data = await googleRes.json().catch(() => ({}));
    if (!googleRes.ok) {
      res.status(googleRes.status).json(data);
      return;
    }
    res.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Teachers proxy request failed';
    console.error('[Classroom Teachers Proxy Error]:', msg);
    res.status(502).json({ error: msg });
  }
});

app.get('/api/workspace/classroom/courses/:courseId/submissions', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ error: 'Missing Authorization header' });
    return;
  }
  try {
    const { courseId } = req.params;
    const googleRes = await fetch(
      `https://classroom.googleapis.com/v1/courses/${encodeURIComponent(courseId)}/courseWork/-/studentSubmissions?userId=me`,
      { headers: { Authorization: authHeader } }
    );
    const data = await googleRes.json().catch(() => ({}));
    if (!googleRes.ok) {
      res.status(googleRes.status).json(data);
      return;
    }
    res.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Student submissions proxy request failed';
    console.error('[Classroom Submissions Proxy Error]:', msg);
    res.status(502).json({ error: msg });
  }
});

// Create a student submission (answer draft) for an assignment / short-answer question.
// Body: { answer?: string } — for SHORT_ANSWER_QUESTION this becomes shortAnswerSubmission.answer
app.post(
  '/api/workspace/classroom/courses/:courseId/courseWork/:courseWorkId/studentSubmissions',
  async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({ error: 'Missing Authorization header' });
      return;
    }
    try {
      const { courseId, courseWorkId } = req.params;
      const body: Record<string, any> = {};
      if (req.body?.answer && String(req.body.answer).trim()) {
        body.shortAnswerSubmission = { answer: String(req.body.answer) };
      }
      const googleRes = await fetch(
        `https://classroom.googleapis.com/v1/courses/${encodeURIComponent(courseId)}/courseWork/${encodeURIComponent(
          courseWorkId
        )}/studentSubmissions`,
        {
          method: 'POST',
          headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );
      const data = await googleRes.json().catch(() => ({}));
      if (!googleRes.ok) {
        res.status(googleRes.status).json(data);
        return;
      }
      res.status(201).json(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Create submission proxy request failed';
      console.error('[Classroom Create Submission Proxy Error]:', msg);
      res.status(502).json({ error: msg });
    }
  }
);

// Turn in a student submission
app.post(
  '/api/workspace/classroom/courses/:courseId/courseWork/:courseWorkId/studentSubmissions/:submissionId/turnIn',
  async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({ error: 'Missing Authorization header' });
      return;
    }
    try {
      const { courseId, courseWorkId, submissionId } = req.params;
      const googleRes = await fetch(
        `https://classroom.googleapis.com/v1/courses/${encodeURIComponent(courseId)}/courseWork/${encodeURIComponent(
          courseWorkId
        )}/studentSubmissions/${encodeURIComponent(submissionId)}:turnIn`,
        { method: 'POST', headers: { Authorization: authHeader, 'Content-Length': '0' } }
      );
      const data = await googleRes.json().catch(() => ({}));
      if (!googleRes.ok) {
        res.status(googleRes.status).json(data);
        return;
      }
      res.json(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Turn in proxy request failed';
      console.error('[Classroom Turn In Proxy Error]:', msg);
      res.status(502).json({ error: msg });
    }
  }
);

// Add a private comment to a student submission
app.post(
  '/api/workspace/classroom/courses/:courseId/courseWork/:courseWorkId/studentSubmissions/:submissionId/comments',
  async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({ error: 'Missing Authorization header' });
      return;
    }
    try {
      const { courseId, courseWorkId, submissionId } = req.params;
      const text = String(req.body?.text || '').trim();
      if (!text) {
        res.status(400).json({ error: 'Comment text is required.' });
        return;
      }
      const googleRes = await fetch(
        `https://classroom.googleapis.com/v1/courses/${encodeURIComponent(courseId)}/courseWork/${encodeURIComponent(
          courseWorkId
        )}/studentSubmissions/${encodeURIComponent(submissionId)}/comments`,
        {
          method: 'POST',
          headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        }
      );
      const data = await googleRes.json().catch(() => ({}));
      if (!googleRes.ok) {
        res.status(googleRes.status).json(data);
        return;
      }
      res.status(201).json(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Add comment proxy request failed';
      console.error('[Classroom Add Comment Proxy Error]:', msg);
      res.status(502).json({ error: msg });
    }
  }
);

app.get('/api/workspace/drive/files', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ error: 'Missing Authorization header' });
    return;
  }
  try {
    const q = req.query.q ? String(req.query.q) : '';
    const pageSize = req.query.pageSize ? String(req.query.pageSize) : '30';
    const fields = req.query.fields
      ? String(req.query.fields)
      : 'nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink,iconLink,thumbnailLink)';

    const driveUrl = new URL('https://www.googleapis.com/drive/v3/files');
    driveUrl.searchParams.set('pageSize', pageSize);
    driveUrl.searchParams.set('fields', fields);
    if (q) {
      driveUrl.searchParams.set('q', q);
    }

    const googleRes = await fetch(driveUrl.toString(), {
      headers: { Authorization: authHeader },
    });
    const data = await googleRes.json().catch(() => ({}));
    if (!googleRes.ok) {
      res.status(googleRes.status).json(data);
      return;
    }
    res.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Drive files proxy request failed';
    console.error('[Drive Files Proxy Error]:', msg);
    res.status(502).json({ error: msg });
  }
});

/**
 * Serve a single Drive file's bytes through our own origin so it can be embedded
 * in a same-origin iframe (Google Drive blocks framing via X-Frame-Options).
 * Google Docs / Sheets / Slides are exported to PDF first.
 */
app.get('/api/workspace/drive/files/:fileId/content', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ error: 'Missing Authorization header' });
    return;
  }
  try {
    const { fileId } = req.params;

    // Resolve the real mime type so we can export Google Docs editors to PDF.
    const metaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=mimeType,name`,
      { headers: { Authorization: authHeader } }
    );
    if (!metaRes.ok) {
      res.status(metaRes.status).json(await metaRes.json().catch(() => ({})));
      return;
    }
    const meta = (await metaRes.json()) as { mimeType?: string; name?: string };
    const mime = meta.mimeType || '';
    const isGoogleEditor =
      mime.includes('google-apps.document') ||
      mime.includes('google-apps.presentation') ||
      mime.includes('google-apps.spreadsheet');

    const contentUrl = isGoogleEditor
      ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=application/pdf`
      : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;

    const googleRes = await fetch(contentUrl, {
      headers: { Authorization: authHeader },
    });
    if (!googleRes.ok) {
      res.status(googleRes.status).json(await googleRes.json().catch(() => ({})));
      return;
    }

    const contentType = isGoogleEditor ? 'application/pdf' : (googleRes.headers.get('content-type') || 'application/octet-stream');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    // Deliberately no X-Frame-Options: this is our own origin, so a same-origin
    // iframe from our app can embed it without Google's framing block.
    const buffer = Buffer.from(await googleRes.arrayBuffer());
    res.status(googleRes.status).send(buffer);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Drive content proxy request failed';
    console.error('[Drive Content Proxy Error]:', msg);
    res.status(502).json({ error: msg });
  }
});

// Start server: mount Vite dev middleware in development or serve static in production
async function startServer() {
  const httpServer = http.createServer(app);

  // Curriculum grounding is read from memory per request, so load it once, up front.
  const curricula = await loadAllCurricula();
  console.log(
    `[curriculum] ${curricula.loaded} subject(s) loaded` +
      (curricula.failed.length ? `; not available: ${curricula.failed.join(', ')}` : '')
  );

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(Number(PORT), '0.0.0.0', () => {
    console.log(
      `ClassApp server listening on http://0.0.0.0:${PORT} (DeepSeek: ${
        deepseekProvider.isConfigured() ? 'Configured (' + deepseekProvider.getModelName() + ')' : 'Offline Local Fallback Mode'
      })`
    );
    // Housekeeping: drop expired sessions, spent reset codes, stale usage days.
    if (isDatabaseConfigured()) {
      purgeExpiredData().catch((e) => console.error('[Purge Error]:', e instanceof Error ? e.message : e));
      // Trashed vault files past the retention window are removed from B2 for real.
      purgeExpiredTrash().catch((e) => console.error('[Trash Purge Error]:', e instanceof Error ? e.message : e));
    }
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
