/**
 * Shape of the Ghana (NaCCA) standard-based SHS curriculum data used by ClassApp.
 *
 * One entry per subject code from `src/shared/subjects.ts`, split by form level, then
 * strand -> sub-strand -> topic, with the official learning outcome and the source
 * document each entry came from.
 *
 * Rules that keep this honest:
 * - A topic only carries `status: 'verified'` when it was read out of an official
 *   MoE / NaCCA document (see `source`).
 * - Anything we could not confirm stays `'unresolved'`: it is listed, not guessed, and
 *   is never presented to a student as syllabus content.
 * - No entry is invented to fill a gap. An empty strand list means "not extracted yet".
 */

export type CurriculumStatus = 'verified' | 'unresolved';

export type CurriculumForm = 1 | 2 | 3;

export interface CurriculumTopic {
  /** Official topic / content statement wording. */
  topic: string;
  /** Official learning outcome or indicator, when the source states one. */
  outcome?: string;
  /** Direct link to the official document this came from. */
  source?: string;
  status: CurriculumStatus;
}

export interface CurriculumSubStrand {
  name: string;
  topics: CurriculumTopic[];
}

export interface CurriculumStrand {
  name: string;
  /** Official learning outcomes stated for this strand, when the source lists them. */
  outcomes?: string[];
  subStrands: CurriculumSubStrand[];
}

export interface CurriculumLevel {
  strands: CurriculumStrand[];
  /** Documents this level was extracted from. */
  sources: string[];
  /** 'unresolved' when nothing has been extracted for this level yet. */
  status: CurriculumStatus;
}

export interface SubjectCurriculum {
  code: string;
  name: string;
  /** Form level ('1' | '2' | '3'). Missing keys mean "no material yet". */
  levels: Partial<Record<'1' | '2' | '3', CurriculumLevel>>;
}
