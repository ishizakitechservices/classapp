import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CORE_SUBJECTS,
  ELECTIVE_SUBJECTS,
  INTERNAL_SUBJECTS,
  SUBJECTS,
  formOf,
  getSubject,
  normalizeSubjectSelection,
  sortSubjects,
  takesInternalSubjects,
} from '../src/shared/subjects';

test('Subjects: catalog has no duplicate codes and matches the school list', () => {
  const codes = SUBJECTS.map((s) => s.code);
  assert.equal(new Set(codes).size, codes.length, 'Codes are unique');
  assert.equal(CORE_SUBJECTS.length, 5);
  assert.equal(INTERNAL_SUBJECTS.length, 3);
  assert.equal(ELECTIVE_SUBJECTS.length, 22);
  assert.equal(SUBJECTS.length, 30);

  // Agricultural Science was removed from the catalog.
  assert.equal(SUBJECTS.some((s) => /agric/i.test(s.name)), false, 'No Agricultural Science');
});

test('Subjects: form is read from the class name', () => {
  assert.equal(formOf('1 Science 1'), 1);
  assert.equal(formOf('2 Business'), 2);
  assert.equal(formOf('3 Visual Arts'), 3);
  assert.equal(formOf(''), null);
});

test('Subjects: internal subjects exist in Form 1 and 2 only', () => {
  assert.equal(takesInternalSubjects('1 Science 1'), true);
  assert.equal(takesInternalSubjects('2 Art 3'), true);
  assert.equal(takesInternalSubjects('3 Science 1'), false);
});

test('Subjects: students choose their own core subjects', () => {
  const result = normalizeSubjectSelection('1 Science 1', ['MATH', 'ENG', 'PHY', 'CHEM']);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const cores = result.subjects.filter((s) => s.kind === 'core').map((s) => s.code);
  assert.deepEqual(new Set(cores), new Set(['MATH', 'ENG']), 'Only chosen core subjects appear');

  // School (internal) subjects are still added automatically.
  const internals = result.subjects.filter((s) => s.kind === 'internal').map((s) => s.code);
  assert.deepEqual(new Set(internals), new Set(INTERNAL_SUBJECTS.map((s) => s.code)));
});

test('Subjects: at least one core subject is required', () => {
  const none = normalizeSubjectSelection('1 Science 1', ['PHY', 'CHEM']);
  assert.equal(none.ok, false);
  if (!none.ok) assert.match(none.error, /core/i);
});

test('Subjects: internal subjects cannot be removed by the client', () => {
  // Even when a client sends no internal codes, they are always present for Form 1-2.
  const result = normalizeSubjectSelection('2 Art 1', ['MATH']);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.subjects.filter((s) => s.kind === 'internal').length, INTERNAL_SUBJECTS.length);
});

test('Subjects: a Form 3 student never gets the internal subjects', () => {
  const result = normalizeSubjectSelection('3 Science 1', ['MATH', 'PHY', 'CHEM', 'BIO']);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const kinds = result.subjects.map((s) => s.kind);
  assert.equal(kinds.includes('internal'), false);
  assert.equal(result.subjects.length, 4);
});

test('Subjects: electives are free choice across all groups', () => {
  const result = normalizeSubjectSelection('1 Science 1', ['MATH', 'PHY', 'ECON', 'GOV', 'ARTSTU']);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const electives = result.subjects.filter((s) => s.kind === 'elective');
  assert.equal(electives.length, 4);
  assert.deepEqual(new Set(electives.map((s) => s.group)), new Set(['Science', 'Business', 'Humanities & Arts', 'Vocational & Creative']));
});

test('Subjects: any number of electives is accepted, including none', () => {
  const none = normalizeSubjectSelection('2 Business', ['MATH']);
  assert.equal(none.ok, true);
  if (none.ok) assert.equal(none.subjects.length, 1 + INTERNAL_SUBJECTS.length);
});

test('Subjects: duplicates are collapsed, unknown codes are rejected', () => {
  const dupes = normalizeSubjectSelection('1 Science 1', ['MATH', 'phy', 'PHY', ' Phy ']);
  assert.equal(dupes.ok, true);
  if (dupes.ok) assert.equal(dupes.subjects.filter((s) => s.code === 'PHY').length, 1);

  const bad = normalizeSubjectSelection('1 Science 1', ['MATH', 'PHY', 'AGRIC']);
  assert.equal(bad.ok, false);
});

test('Subjects: core codes sent by a client cannot be duplicated', () => {
  const result = normalizeSubjectSelection('1 Science 1', ['ENG', 'ENG', 'MATH', 'PHY']);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.subjects.filter((s) => s.code === 'ENG').length, 1);
  assert.equal(result.subjects.filter((s) => s.kind === 'elective').length, 1);
});

test('Subjects: display order is core, then electives, then internal', () => {
  const result = normalizeSubjectSelection('2 Art 1', ['MATH', 'TWI', 'ECON', 'BIO']);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const kinds = sortSubjects(result.subjects).map((s) => s.kind);
  const firstElective = kinds.indexOf('elective');
  const firstInternal = kinds.indexOf('internal');
  assert.ok(kinds.lastIndexOf('core') < firstElective, 'Core comes first');
  assert.ok(firstElective < firstInternal, 'Internal comes last');

  // Electives are grouped Science -> Business -> Humanities.
  const groups = result.subjects.filter((s) => s.kind === 'elective').map((s) => s.group);
  assert.deepEqual(groups, ['Science', 'Business', 'Humanities & Arts']);
});

test('Subjects: every catalog entry is reachable', () => {
  for (const core of CORE_SUBJECTS) {
    const r = normalizeSubjectSelection('1 Science 1', [core.code]);
    assert.equal(r.ok, true, `${core.code} accepted`);
  }
  for (const elective of ELECTIVE_SUBJECTS) {
    const r = normalizeSubjectSelection('1 Science 1', ['MATH', elective.code]);
    assert.equal(r.ok, true, `${elective.code} accepted`);
    assert.ok(getSubject(elective.code));
  }
});
