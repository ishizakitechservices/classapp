/**
 * Study-generation sizes, shared by browser and server.
 *
 * One clamp for every layer: the request body, the route, the provider, the cache key
 * and the UI button all read these numbers, so a size can never mean two different
 * things depending on where it is checked.
 *
 * Cost model: a "credit" is one unit of a student's daily AI allowance. Quick and
 * Standard spend 1 credit; Full spends 2, because it is several provider calls.
 */

export type StudyKind = 'quiz' | 'flashcards';

export type StudySize = 'quick' | 'standard' | 'full';

/** What the size buttons offer, in item counts. */
export const STUDY_SIZES: Record<StudyKind, Record<StudySize, number>> = {
  quiz: { quick: 5, standard: 10, full: 25 },
  flashcards: { quick: 10, standard: 20, full: 40 },
};

/** Absolute ceilings. Nothing larger is generated, whatever the client asks for. */
export const STUDY_CAPS: Record<StudyKind, number> = {
  quiz: 25,
  flashcards: 40,
};

/** Lower bound for any requested size (a caller may ask for something smaller than Quick). */
export const STUDY_FLOORS: Record<StudyKind, number> = {
  quiz: 3,
  flashcards: 3,
};

/** Items requested per provider call. Keeps every single call well inside the output cap. */
export const STUDY_BATCH_SIZE: Record<StudyKind, number> = {
  quiz: 5,
  flashcards: 8,
};

/** A batch above this many calls is refused rather than run for minutes on end. */
export const STUDY_MAX_BATCHES = 8;

export function clampStudyCount(kind: StudyKind, raw: unknown): number {
  const requested = Number(raw);
  const fallback = STUDY_SIZES[kind].standard;
  const n = Number.isFinite(requested) && requested > 0 ? Math.round(requested) : fallback;
  return Math.min(Math.max(n, STUDY_FLOORS[kind]), STUDY_CAPS[kind]);
}

/** 1 credit for a normal set, 2 for a full-length one. */
export function creditsFor(kind: StudyKind, count: number): number {
  const standard = STUDY_SIZES[kind].standard;
  return clampStudyCount(kind, count) > standard ? 2 : 1;
}

/** How many provider calls a request of this size will make. */
export function batchesFor(kind: StudyKind, count: number): number {
  return Math.ceil(clampStudyCount(kind, count) / STUDY_BATCH_SIZE[kind]);
}

export function studySizeLabel(kind: StudyKind, size: StudySize): string {
  const n = STUDY_SIZES[kind][size];
  return size === 'full' ? `Full (${n})` : `${size === 'quick' ? 'Quick' : 'Standard'} (${n})`;
}

/** Human label for the size a raw count falls into. */
export function studySizeForCount(kind: StudyKind, count: number): StudySize {
  const n = clampStudyCount(kind, count);
  if (n <= STUDY_SIZES[kind].quick) return 'quick';
  if (n <= STUDY_SIZES[kind].standard) return 'standard';
  return 'full';
}
