/**
 * OLAG SHS subject catalog (new curriculum).
 *
 * Shared by the browser and the server so a student's subjects are validated once
 * and displayed the same way everywhere. Keep this file free of secrets and
 * browser-only APIs.
 *
 * The rules encoded here:
 * - Five core subjects are compulsory for every class and cannot be removed.
 * - Three internal subjects are compulsory in Form 1 and 2 only; they stop in Form 3.
 * - Electives are free choice: any mix, any number. The class does not filter them.
 */

export type SubjectKind = 'core' | 'elective' | 'internal';

export type ElectiveGroup = 'Science' | 'Business' | 'Humanities & Arts' | 'Vocational & Creative';

/** One subject as it exists in the school catalog. */
export interface SubjectDef {
  /** Short stable code, e.g. 'PHY'. Also what the Vault uses to group files. */
  code: string;
  name: string;
  kind: SubjectKind;
  /** Set for electives only. */
  group?: ElectiveGroup;
  /** Internal subjects are taught in Form 1 and 2 only. */
  form1And2Only?: boolean;
}

/** A subject attached to a student's account. */
export interface UserSubject {
  code: string;
  name: string;
  kind: SubjectKind;
  group?: ElectiveGroup;
}

export const ELECTIVE_GROUPS: readonly ElectiveGroup[] = [
  'Science',
  'Business',
  'Humanities & Arts',
  'Vocational & Creative',
];

const CORE: readonly SubjectDef[] = [
  { code: 'ENG', name: 'English Language', kind: 'core' },
  { code: 'MATH', name: 'Mathematics', kind: 'core' },
  { code: 'GSCI', name: 'General Science', kind: 'core' },
  { code: 'SOC', name: 'Social Studies', kind: 'core' },
  { code: 'ARTFD', name: 'Art & Design Foundation', kind: 'core' },
];

const INTERNAL: readonly SubjectDef[] = [
  { code: 'RELETH', name: 'Religion & Ethics', kind: 'internal', form1And2Only: true },
  { code: 'COREIT', name: 'Core IT', kind: 'internal', form1And2Only: true },
  { code: 'PEH', name: 'Physical Education & Health', kind: 'internal', form1And2Only: true },
];

const ELECTIVES: readonly SubjectDef[] = [
  // Science
  { code: 'PHY', name: 'Physics', kind: 'elective', group: 'Science' },
  { code: 'CHEM', name: 'Chemistry', kind: 'elective', group: 'Science' },
  { code: 'BIO', name: 'Biology', kind: 'elective', group: 'Science' },
  { code: 'ADDMATH', name: 'Additional Mathematics', kind: 'elective', group: 'Science' },
  { code: 'COMP', name: 'Computing', kind: 'elective', group: 'Science' },
  { code: 'APPTECH', name: 'Applied Technology', kind: 'elective', group: 'Science' },
  { code: 'DCT', name: 'Design Communication Technology', kind: 'elective', group: 'Science' },

  // Business
  { code: 'FINACC', name: 'Financial Accounting', kind: 'elective', group: 'Business' },
  { code: 'BUSMGT', name: 'Business Management', kind: 'elective', group: 'Business' },
  { code: 'ECON', name: 'Economics', kind: 'elective', group: 'Business' },

  // Humanities & Arts
  { code: 'GOV', name: 'Government', kind: 'elective', group: 'Humanities & Arts' },
  { code: 'HIST', name: 'History', kind: 'elective', group: 'Humanities & Arts' },
  { code: 'LIT', name: 'Literature in English', kind: 'elective', group: 'Humanities & Arts' },
  { code: 'CRS', name: 'Christian Religious Studies (CRS)', kind: 'elective', group: 'Humanities & Arts' },
  { code: 'GEO', name: 'Geography', kind: 'elective', group: 'Humanities & Arts' },
  { code: 'FRE', name: 'French', kind: 'elective', group: 'Humanities & Arts' },
  { code: 'TWI', name: 'Twi (Ghanaian Language)', kind: 'elective', group: 'Humanities & Arts' },
  { code: 'PERF', name: 'Performing Arts', kind: 'elective', group: 'Humanities & Arts' },

  // Vocational & Creative
  { code: 'MGTLIV', name: 'Management in Living', kind: 'elective', group: 'Vocational & Creative' },
  { code: 'FOODNUT', name: 'Food and Nutrition', kind: 'elective', group: 'Vocational & Creative' },
  { code: 'CLOTEX', name: 'Clothing and Textiles', kind: 'elective', group: 'Vocational & Creative' },
  { code: 'ARTSTU', name: 'Art and Design Studio', kind: 'elective', group: 'Vocational & Creative' },
];

export const SUBJECTS: readonly SubjectDef[] = [...CORE, ...ELECTIVES, ...INTERNAL];

const BY_CODE = new Map(SUBJECTS.map((s) => [s.code, s]));

export const CORE_SUBJECTS: readonly SubjectDef[] = CORE;
export const INTERNAL_SUBJECTS: readonly SubjectDef[] = INTERNAL;
export const ELECTIVE_SUBJECTS: readonly SubjectDef[] = ELECTIVES;

export function getSubject(code: string): SubjectDef | null {
  return BY_CODE.get(String(code || '').trim().toUpperCase()) ?? null;
}

/** 1, 2 or 3 — parsed from a class name such as "2 Science 1". */
export function formOf(className: string): 1 | 2 | 3 | null {
  const match = /^\s*([123])(?!\d)/.exec(className || '');
  return match ? (Number(match[1]) as 1 | 2 | 3) : null;
}

/** Internal subjects stop after Form 2. Unknown classes keep them visible. */
export function takesInternalSubjects(className: string): boolean {
  return formOf(className) !== 3;
}

/** Core subjects, plus the internal three unless the student is in Form 3. */
export function mandatorySubjectsFor(className: string): SubjectDef[] {
  return takesInternalSubjects(className) ? [...CORE, ...INTERNAL] : [...CORE];
}

export function electiveSubjectsByGroup(): Array<{ group: ElectiveGroup; subjects: SubjectDef[] }> {
  return ELECTIVE_GROUPS.map((group) => ({
    group,
    subjects: ELECTIVES.filter((s) => s.group === group),
  }));
}

function toUserSubject(def: SubjectDef): UserSubject {
  return { code: def.code, name: def.name, kind: def.kind, group: def.group };
}

const KIND_RANK: Record<SubjectKind, number> = { core: 0, elective: 1, internal: 2 };

/** Core first in catalog order, then electives by group, then internal. */
export function sortSubjects(subjects: UserSubject[]): UserSubject[] {
  return [...subjects].sort((a, b) => {
    if (KIND_RANK[a.kind] !== KIND_RANK[b.kind]) return KIND_RANK[a.kind] - KIND_RANK[b.kind];
    if (a.kind === 'core') {
      return CORE.findIndex((s) => s.code === a.code) - CORE.findIndex((s) => s.code === b.code);
    }
    if (a.kind === 'elective') {
      const ga = ELECTIVE_GROUPS.indexOf(a.group as ElectiveGroup);
      const gb = ELECTIVE_GROUPS.indexOf(b.group as ElectiveGroup);
      if (ga !== gb) return ga - gb;
    }
    return a.name.localeCompare(b.name);
  });
}

/** Display order for a student's subject list. */
export function groupUserSubjects(subjects: UserSubject[]) {
  const sorted = sortSubjects(subjects);
  return {
    core: sorted.filter((s) => s.kind === 'core'),
    electives: sorted.filter((s) => s.kind === 'elective'),
    internal: sorted.filter((s) => s.kind === 'internal'),
  };
}

export type SelectionResult =
  | { ok: true; subjects: UserSubject[] }
  | { ok: false; error: string };

/**
 * Build the full subject list from a class and the student's selection.
 * - Core subjects are the student's choice (at least one is required).
 * - FORM 1–2 school subjects are fixed by the school and always added.
 * - Electives are free choice.
 */
export function normalizeSubjectSelection(className: string, selectedCodes: readonly string[]): SelectionResult {
  const chosenCore: string[] = [];
  const chosenElectives: string[] = [];

  for (const raw of selectedCodes ?? []) {
    const code = String(raw || '').trim().toUpperCase();
    if (!code) continue;

    const def = getSubject(code);
    if (!def) {
      return { ok: false, error: `"${code}" is not a subject in the list.` };
    }
    // Internal (school) subjects are fixed by the school; ignore them if sent.
    if (def.kind === 'internal') continue;

    const bucket = def.kind === 'core' ? chosenCore : chosenElectives;
    if (!bucket.includes(code)) bucket.push(code);
  }

  if (chosenCore.length === 0) {
    return { ok: false, error: 'Choose at least one core subject.' };
  }

  // School subjects are fixed, never user-controlled.
  const fixedSchool = INTERNAL_SUBJECTS.filter((s) => takesInternalSubjects(className)).map(toUserSubject);
  const mandatoryCore = CORE_SUBJECTS.filter((s) => chosenCore.includes(s.code)).map(toUserSubject);
  const electives = chosenElectives.map((code) => toUserSubject(getSubject(code) as SubjectDef));

  return { ok: true, subjects: sortSubjects([...mandatoryCore, ...electives, ...fixedSchool]) };
}
