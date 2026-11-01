/**
 * Curriculum lookup used by the quiz builder, the flashcard builder and Adom AI.
 *
 * Everything here is deterministic and free to call: no AI, no database.
 * The data itself lives in `./data/<CODE>.ts` and is produced by
 * `scripts/curriculum/build.ts`, so it can be regenerated and re-verified at any time.
 *
 * DATA IS LOADED PER SUBJECT. The whole catalogue is several hundred KB, and a phone on
 * a school network must not download subjects it never opens. The generated index
 * carries only code + name; the topics for one subject arrive on demand (browser) or
 * are registered once at startup (server).
 */

import { GENERATED_CURRICULUM, GENERATED_VERSION } from './data/index.ts';
import type {
  CurriculumForm,
  CurriculumStatus,
  CurriculumTopic,
  SubjectCurriculum,
} from './types.ts';
import { getSubject } from '../subjects.ts';

export { GENERATED_CURRICULUM } from './data/index.ts';
export type { CurriculumSubjectMeta } from './data/index.ts';

export type {
  CurriculumForm,
  CurriculumLevel,
  CurriculumStatus,
  CurriculumStrand,
  CurriculumSubStrand,
  CurriculumTopic,
  SubjectCurriculum,
} from './types.ts';

/**
 * Bumped whenever the generated data changes. It is part of every cache key, so a
 * corrected topic list can never be served from an older cached quiz.
 */
export const CURRICULUM_VERSION = GENERATED_VERSION;

const loaded = new Map<string, SubjectCurriculum>();

function normaliseCode(code: string | undefined | null): string {
  return String(code || '').trim().toUpperCase();
}

/**
 * Server: every subject is small once it is one object in memory, so the routes register
 * the whole catalogue once and every lookup after that is a Map read.
 */
export function registerServerCurriculum(subjects: readonly SubjectCurriculum[]): void {
  for (const subject of subjects) {
    if (subject?.code) loaded.set(normaliseCode(subject.code), subject);
  }
}

/**
 * Browser: fetch one subject's data on demand. Null means "no extracted material", so
 * callers fall back honestly instead of showing an invented syllabus.
 */
export async function loadCurriculum(code: string): Promise<SubjectCurriculum | null> {
  const key = normaliseCode(code);
  if (!key) return null;
  const cached = loaded.get(key);
  if (cached) return cached;
  const subject = await loadOne(key);
  if (subject?.code) loaded.set(key, subject);
  return subject ?? null;
}

export function isCurriculumLoaded(code: string | undefined | null): boolean {
  return loaded.has(normaliseCode(code));
}

/** The synchronous lookup. On the browser this only answers for already-loaded subjects. */
export function getCurriculum(code: string | undefined | null): SubjectCurriculum | null {
  return loaded.get(normaliseCode(code)) ?? null;
}

/** Code + name for every subject that has curriculum data in this build. */
export function curriculumSubjects(): Array<{ code: string; name: string }> {
  return GENERATED_CURRICULUM.map((c) => ({ code: c.code, name: c.name }));
}

/**
 * One lazy import per subject, listed only for subjects that have generated data in
 * this build (`scripts/curriculum/gen-loaders.ts` regenerates this list). Written as
 * literals so the bundler can split each subject into its own chunk.
 */
const STATIC_IMPORTS: Record<string, () => Promise<SubjectCurriculum>> = {
  ENG: () => import('./data/ENG.ts').then((m) => m.ENG_CURRICULUM),
  MATH: () => import('./data/MATH.ts').then((m) => m.MATH_CURRICULUM),
  GSCI: () => import('./data/GSCI.ts').then((m) => m.GSCI_CURRICULUM),
  SOC: () => import('./data/SOC.ts').then((m) => m.SOC_CURRICULUM),
  ARTFD: () => import('./data/ARTFD.ts').then((m) => m.ARTFD_CURRICULUM),
  PHY: () => import('./data/PHY.ts').then((m) => m.PHY_CURRICULUM),
  CHEM: () => import('./data/CHEM.ts').then((m) => m.CHEM_CURRICULUM),
  BIO: () => import('./data/BIO.ts').then((m) => m.BIO_CURRICULUM),
};

/**
 * Safety net: a subject whose file does not exist yet must degrade to "no curriculum"
 * rather than throw at import time.
 */
async function loadOne(code: string): Promise<SubjectCurriculum | null> {
  const direct = STATIC_IMPORTS[code];
  if (!direct) return null;
  try {
    return (await direct()) ?? null;
  } catch {
    return null;
  }
}

/** One topic flattened out of the strand tree. */
export interface FlatTopic {
  strand: string;
  subStrand: string;
  topic: string;
  outcome?: string;
  source?: string;
  status: CurriculumStatus;
}

function formKey(form: CurriculumForm | string | number | null | undefined): '1' | '2' | '3' | null {
  const n = Number(form);
  return n === 1 || n === 2 || n === 3 ? (String(n) as '1' | '2' | '3') : null;
}

/** True when this subject has at least one strand for the given form. */
export function hasCurriculum(code: string, form?: CurriculumForm | string | number | null): boolean {
  const subject = getCurriculum(code);
  if (!subject) return false;
  const key = formKey(form);
  if (!key) return Object.values(subject.levels).some((l) => (l?.strands.length ?? 0) > 0);
  return (subject.levels[key]?.strands.length ?? 0) > 0;
}

/** Strand names for a subject and form, in official order. */
export function strandsFor(code: string, form?: CurriculumForm | string | number | null): string[] {
  const subject = getCurriculum(code);
  if (!subject) return [];
  const key = formKey(form);
  if (key) return (subject.levels[key]?.strands ?? []).map((s) => s.name);
  // No form given: the union across levels, de-duplicated, keeping first appearance.
  const seen = new Set<string>();
  for (const level of Object.values(subject.levels)) {
    for (const strand of level?.strands ?? []) seen.add(strand.name);
  }
  return [...seen];
}

/** Every topic for a subject/form, flattened. */
export function topicsFor(
  code: string,
  form?: CurriculumForm | string | number | null
): FlatTopic[] {
  const subject = getCurriculum(code);
  if (!subject) return [];
  const key = formKey(form);
  const levels = key
    ? [subject.levels[key]].filter(Boolean)
    : Object.values(subject.levels);

  const out: FlatTopic[] = [];
  for (const level of levels) {
    for (const strand of level?.strands ?? []) {
      for (const sub of strand.subStrands) {
        for (const topic of sub.topics) {
          out.push({
            strand: strand.name,
            subStrand: sub.name,
            topic: topic.topic,
            outcome: topic.outcome,
            source: topic.source,
            status: topic.status,
          });
        }
      }
    }
  }
  return out;
}

export interface TopicChoice {
  /** Shown on the chip. */
  label: string;
  strand: string;
  subStrand: string;
  status: CurriculumStatus;
}

/** Topics a student can pick from, verified first, capped so the UI stays small. */
export function topicChoices(
  code: string,
  form?: CurriculumForm | string | number | null,
  limit = 12
): TopicChoice[] {
  const topics = topicsFor(code, form);
  const verified = topics.filter((t) => t.status === 'verified');
  const rest = topics.filter((t) => t.status !== 'verified');
  return [...verified, ...rest].slice(0, limit).map((t) => ({
    label: t.topic,
    strand: t.strand,
    subStrand: t.subStrand,
    status: t.status,
  }));
}

export interface CurriculumStats {
  forms: Array<'1' | '2' | '3'>;
  strands: number;
  topics: number;
  verified: number;
}

export function statsFor(code: string): CurriculumStats {
  const subject = getCurriculum(code);
  const forms: Array<'1' | '2' | '3'> = [];
  let strands = 0;
  let topics = 0;
  let verified = 0;
  if (subject) {
    for (const key of ['1', '2', '3'] as const) {
      const level = subject.levels[key];
      if (!level || level.strands.length === 0) continue;
      forms.push(key);
      strands += level.strands.length;
      for (const t of topicsFor(code, Number(key) as CurriculumForm)) {
        topics += 1;
        if (t.status === 'verified') verified += 1;
      }
    }
  }
  return { forms, strands, topics, verified };
}

/**
 * Stable, sorted list of topic names actually in the curriculum for this subject/form.
 * Used to tell the model which topics are in scope, and which one to pick when the
 * student asks for "practice" without naming a topic.
 */
export function topicNames(code: string, form?: CurriculumForm | string | number | null): string[] {
  return topicsFor(code, form)
    .filter((t) => t.status === 'verified')
    .map((t) => t.topic);
}

/**
 * The topic a "practise my subject" request should actually focus on.
 *
 * Deterministic and free: rotates through the verified topics of the subject's form so
 * repeated taps cover different ground. Returns null when nothing is verified yet, so
 * the caller can fall back to the subject name instead of pretending it has a syllabus.
 */
export function pickStudyTopic(
  code: string | null | undefined,
  form?: CurriculumForm | string | number | null,
  offset = 0
): { topic: string; strand: string } | null {
  const list = topicsFor(String(code || ''), form).filter((t) => t.status === 'verified' && t.topic.length > 3);
  if (list.length === 0) return null;
  const index = ((Math.trunc(offset) || 0) % list.length + list.length) % list.length;
  const picked = list[index];
  return { topic: picked.topic, strand: picked.strand };
}

export interface CurriculumBlockOptions {
  code?: string | null;
  /** Form level from the student's class name. */
  form?: CurriculumForm | string | number | null;
  /** Restrict the answer to this strand. */
  strand?: string | null;
  /** Named topic the student asked for (kept even if it is not in the list). */
  focusTopic?: string | null;
  /** Hard character budget. The block is trimmed, never truncated mid-line. */
  maxChars?: number;
}

/**
 * The grounding block injected into every study prompt.
 *
 * Deliberately byte-stable for a given (subject, form, strand): identical text means
 * DeepSeek's prefix cache can bill the whole school's generation at cache-read rates.
 * It contains no student names, no dates, no turn-specific wording.
 */
export function buildCurriculumBlock(options: CurriculumBlockOptions): string {
  const { code, form, strand, focusTopic, maxChars = 1600 } = options;
  const subject = getCurriculum(code ?? '');
  const catalogueName = code ? getSubject(code)?.name : null;
  if (!subject && !focusTopic) return '';

  const lines: string[] = [];
  const level = formKey(form);
  const label = subject?.name || catalogueName || String(code ?? '');

  if (subject) {
    const strands = strandsFor(subject.code, level);
    if (strands.length > 0) {
      lines.push(`Subject: ${label}${level ? ` (SHS ${level})` : ''}.`);
      lines.push(`Official strands in scope: ${strands.join('; ')}.`);
    }

    const inScope = strand
      ? topicsFor(subject.code, level).filter((t) => t.strand.toLowerCase() === strand.toLowerCase())
      : topicsFor(subject.code, level);

    const verified = inScope.filter((t) => t.status === 'verified');
    if (verified.length > 0) {
      lines.push(`Topics with verified curriculum wording (use these exact scope statements):`);
      for (const t of verified) {
        const outcome = t.outcome ? ` — ${t.outcome}` : '';
        lines.push(`- [${t.strand} / ${t.subStrand}] ${t.topic}${outcome}`);
      }
    }

    const unresolved = inScope.filter((t) => t.status !== 'verified').slice(0, 6);
    if (unresolved.length > 0) {
      lines.push(
        `Listed but not yet verified against an official document — do not present these as syllabus requirements: ${unresolved
          .map((t) => t.topic)
          .join('; ')}.`
      );
    }
  }

  if (focusTopic) {
    lines.push(`Requested focus: "${focusTopic}". Stay inside it unless the student asks otherwise.`);
  }

  // The scope rule is the point of the block: it is always last, and the topic list is
  // trimmed around it rather than the other way round. A block that lists topics but
  // never forbids leaving them is worse than no block at all.
  const scopeRule =
    'Answer only within this curriculum. Do not introduce topics that belong to a different subject, a different year, or university study.';

  // Trim whole lines only: a half-written strand list is worse than a shorter one.
  let body = lines.join('\n');
  const budget = Math.max(120, maxChars - scopeRule.length - 1);
  if (body.length > budget) {
    const kept: string[] = [];
    let size = 0;
    for (const line of lines) {
      if (size + line.length + 1 > budget) break;
      kept.push(line);
      size += line.length + 1;
    }
    kept.push('(Topic list trimmed for length.)');
    body = kept.join('\n');
  }
  return `${body}\n${scopeRule}`;
}
