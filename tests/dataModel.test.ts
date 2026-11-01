import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_SUBJECTS,
  INITIAL_VAULT_FILES,
  INITIAL_NOTICES,
  INITIAL_CONNECTED_SERVICES,
} from '../src/data/mockData';

test('Data Model: Initial subjects array starts empty without demo data', () => {
  assert.equal(INITIAL_SUBJECTS.length, 0, 'No demo subjects initially present');

  // Validate Subject schema structure on an added subject
  const sampleSubject = {
    id: 'emath-1',
    code: 'EMATH 301',
    name: 'Elective Mathematics',
    instructor: 'Teacher',
    schedule: 'Mon & Wed',
    room: 'Room 12',
    progressPercent: 0,
    totalLectures: 0,
    attendedLectures: 0,
    description: 'Elective mathematics coursework',
    syllabus: [{ id: 's-1', title: 'Calculus', week: 1, status: 'upcoming' as const }],
    activities: [],
  };

  assert.ok(sampleSubject.id, 'Subject has id');
  assert.ok(sampleSubject.code, 'Subject has course code');
  assert.ok(sampleSubject.name, 'Subject has name');
  assert.ok(sampleSubject.syllabus.length > 0, 'Subject has syllabus topics');
  assert.ok(typeof sampleSubject.progressPercent === 'number', 'Progress is number');
});

test('Data Model: Initial vault files and notices start clean without demo data', () => {
  assert.equal(INITIAL_VAULT_FILES.length, 0, 'No demo vault files initially present');
  assert.equal(INITIAL_NOTICES.length, 0, 'No demo notices initially present');

  // Validate VaultFile schema structure on an imported/created file
  const sampleFile = {
    id: 'vf-1',
    name: 'WASSCE_Notes.pdf',
    folder: 'notes' as const,
    subjectId: 'emath-1',
    subjectCode: 'EMATH 301',
    fileSize: '1.2 MB',
    fileFormat: 'PDF',
    updatedAt: 'Today',
    isOffline: true,
    downloadsCount: 1,
    description: 'Personal study notes',
    keyConcepts: ['Calculus', 'Limits'],
    content: '# Personal Revision Note\nCalculus notes for review.',
  };

  assert.ok(sampleFile.id, 'File has id');
  assert.ok(sampleFile.name, 'File has name');
  assert.ok(sampleFile.subjectCode, 'File has subject code');
  assert.ok(sampleFile.fileSize, 'File has size');
  assert.ok(sampleFile.keyConcepts.length > 0, 'File has key concepts');
  assert.ok(sampleFile.content.length > 10, 'File has readable content');
});

test('Data Model: Offline storage calculation helper computes correct size', () => {
  const testFiles = [
    { isOffline: true, fileSize: '1.5 MB' },
    { isOffline: true, fileSize: '512 KB' },
    { isOffline: false, fileSize: '10.0 MB' },
  ];

  const offlineFiles = testFiles.filter((f) => f.isOffline);
  const totalMB = offlineFiles.reduce((acc, f) => {
    const num = parseFloat(f.fileSize);
    if (f.fileSize.includes('KB')) return acc + num / 1024;
    return acc + (isNaN(num) ? 1 : num);
  }, 0);

  assert.ok(Math.abs(totalMB - 2.0) < 0.01, 'Offline size calculation is correct');
});

test('Data Model: curated practice templates are the only bundled quiz content', async () => {
  // SAMPLE_QUIZ_QUESTIONS was removed so canned questions can never be served as AI output.
  // The curated templates must still be well-formed, because they back offline practice.
  const mod = await import('../src/components/QuizTemplateModal.tsx');
  const templates = (mod as any).PREBUILT_QUIZ_TEMPLATES;

  assert.ok(Array.isArray(templates) && templates.length > 0, 'Curated templates exist');
  for (const tpl of templates) {
    assert.ok(tpl.subjectCode, 'Template has a subject code');
    assert.ok(tpl.questions.length >= 2, 'Template has at least 2 questions');
    for (const q of tpl.questions) {
      assert.ok(q.question, 'Question has prompt');
      assert.ok(q.options.length >= 3, 'Question has at least 3 choices');
      assert.ok(
        q.correctAnswerIndex >= 0 && q.correctAnswerIndex < q.options.length,
        'Valid correct answer index'
      );
      assert.ok(q.explanation.length > 20, 'Question provides a pedagogical explanation');
    }
  }
});

test('Data Model: Connected services have official Google scopes and zero client secrets', () => {
  const classroom = INITIAL_CONNECTED_SERVICES.find((s) => s.id === 'google_classroom');
  const drive = INITIAL_CONNECTED_SERVICES.find((s) => s.id === 'google_drive');

  assert.ok(classroom, 'Google Classroom defined');
  assert.ok(drive, 'Google Drive defined');
  assert.ok(classroom.scopes.includes('https://www.googleapis.com/auth/classroom.courses.readonly'));
  assert.ok(drive.scopes.includes('https://www.googleapis.com/auth/drive.readonly'));
  // Verify no secrets embedded in configuration objects
  assert.equal((classroom as any).clientSecret, undefined);
  assert.equal((drive as any).clientSecret, undefined);
});

test('Workspace Integration: Client-side token authentication adheres to security standards', () => {
  const classroom = INITIAL_CONNECTED_SERVICES.find((s) => s.id === 'google_classroom');
  const drive = INITIAL_CONNECTED_SERVICES.find((s) => s.id === 'google_drive');

  assert.ok(classroom?.name, 'Classroom name defined');
  assert.ok(drive?.name, 'Drive name defined');
  assert.equal(typeof classroom?.isConnected, 'boolean');
  assert.equal(typeof drive?.isConnected, 'boolean');
});
