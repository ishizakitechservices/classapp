/**
 * Device cache for generated study sets.
 *
 * Why it exists: a 25-question quiz is several provider calls and real money. Once a
 * student has it, reopening the same set must be instant and must work with no data.
 * This sits in front of the network, next to the server's own shared library, and is
 * keyed the same way so the two caches cannot disagree about what a set is.
 *
 * Rules:
 * - Only successfully generated sets are stored. Nothing is invented to fill a miss.
 * - A miss returns null; the caller then asks the network.
 * - An expired entry is dropped on read, so a corrected curriculum is never served
 *   from a stale device copy.
 */

import { dbDelete, dbGet, dbGetAll, dbPut, STORES } from './db';
import { STUDY_CAPS, clampStudyCount, type StudyKind } from '../shared/studyLimits';
import { CURRICULUM_VERSION } from '../shared/curriculum/index';

/** A set is good for a term; the syllabus does not change day to day. */
export const STUDY_SET_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Keeps a shared school device from filling its storage with old sets. */
const STUDY_SET_MAX_ENTRIES = 60;

export interface StoredStudySet {
  key: string;
  kind: StudyKind;
  subjectCode: string;
  topic: string;
  strand: string;
  form: string;
  count: number;
  /** Owner of the device cache entry; keeps a shared phone from serving another student's set. */
  userId?: number;
  /** The generated payload exactly as the server returned it. */
  payload: unknown;
  savedAt: number;
  expiresAt: number;
}

export interface StudySetSignature {
  kind: StudyKind;
  topic: string;
  subjectCode?: string | null;
  strand?: string | null;
  formLevel?: number | null;
  count: number;
  /** Signed-in account; part of the key so one student's cache is never served to another. */
  userId?: number | null;
  /** Only set for an explicit "new set", so a plain reopen still hits. */
  variant?: number;
}

/**
 * Stable key for one study set. Mirrors the server's shared-library key, including the
 * curriculum version, so bumping the syllabus invalidates both caches together.
 */
export function studySetKey(sig: StudySetSignature): string {
  const topic = String(sig.topic || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 160);
  const size = clampStudyCount(sig.kind, sig.count);
  const strand = String(sig.strand || '').trim().toLowerCase().slice(0, 80);
  const form =
    Number(sig.formLevel) === 1 || Number(sig.formLevel) === 2 || Number(sig.formLevel) === 3
      ? String(Number(sig.formLevel))
      : '';
  const variant = Math.max(0, Math.trunc(Number(sig.variant)) || 0);
  const owner = Number(sig.userId) > 0 ? `u${Math.trunc(Number(sig.userId))}` : 'u0';
  const base = `set:${owner}:${sig.kind}:v${CURRICULUM_VERSION}:${topic}:${String(sig.subjectCode || '').toUpperCase()}:${strand}:${form}:${size}`;
  return variant > 0 ? `${base}:r${variant}` : base;
}

function isValidSignature(sig: StudySetSignature): boolean {
  const size = clampStudyCount(sig.kind, sig.count);
  return size >= 1 && size <= STUDY_CAPS[sig.kind] && String(sig.topic || '').trim().length > 0;
}

/** Read a stored set, or null when it is missing, expired or unreadable. */
export async function getStoredStudySet(sig: StudySetSignature): Promise<unknown | null> {
  if (!isValidSignature(sig)) return null;
  const key = studySetKey(sig);
  const entry = await dbGet<StoredStudySet>(STORES.STUDY_SETS, key);
  if (!entry) return null;
  if (Number(entry.expiresAt) <= Date.now()) {
    // Expired: a corrected curriculum or an older set must not resurface.
    await dbDelete(STORES.STUDY_SETS, key);
    return null;
  }
  return entry.payload ?? null;
}

/** Store a set that was actually generated. Best-effort: cache failure never blocks study. */
export async function putStoredStudySet(sig: StudySetSignature, payload: unknown): Promise<void> {
  if (!isValidSignature(sig) || payload == null) return;
  const now = Date.now();
  const entry: StoredStudySet = {
    key: studySetKey(sig),
    kind: sig.kind,
    subjectCode: String(sig.subjectCode || ''),
    topic: String(sig.topic || '').trim(),
    strand: String(sig.strand || ''),
    form: String(sig.formLevel || ''),
    count: clampStudyCount(sig.kind, sig.count),
    userId: Number(sig.userId) > 0 ? Math.trunc(Number(sig.userId)) : undefined,
    payload,
    savedAt: now,
    expiresAt: now + STUDY_SET_TTL_MS,
  };
  await dbPut(STORES.STUDY_SETS, entry);
  await pruneStudySets();
}

/** Drop expired sets, then the oldest ones once the cap is reached. */
export async function pruneStudySets(): Promise<void> {
  const all = await dbGetAll<StoredStudySet>(STORES.STUDY_SETS);
  if (all.length === 0) return;
  const now = Date.now();
  const live = all.filter((entry) => Number(entry.expiresAt) > now);
  const expired = all.filter((entry) => Number(entry.expiresAt) <= now);
  for (const entry of expired) await dbDelete(STORES.STUDY_SETS, entry.key);
  if (live.length <= STUDY_SET_MAX_ENTRIES) return;
  const oldest = live.sort((a, b) => Number(a.savedAt) - Number(b.savedAt)).slice(0, live.length - STUDY_SET_MAX_ENTRIES);
  for (const entry of oldest) await dbDelete(STORES.STUDY_SETS, entry.key);
}

/** Every set saved on this device, newest first (used by the offline library view). */
export async function listStoredStudySets(): Promise<StoredStudySet[]> {
  return (await dbGetAll<StoredStudySet>(STORES.STUDY_SETS)).sort(
    (a, b) => Number(b.savedAt) - Number(a.savedAt)
  );
}
