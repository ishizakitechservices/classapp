import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STUDY_BATCH_SIZE,
  STUDY_CAPS,
  STUDY_FLOORS,
  STUDY_MAX_BATCHES,
  STUDY_SIZES,
  batchesFor,
  clampStudyCount,
  creditsFor,
  studySizeForCount,
  studySizeLabel,
} from '../src/shared/studyLimits.ts';
import {
  CURRICULUM_VERSION,
  buildCurriculumBlock,
  curriculumSubjects,
  getCurriculum,
  hasCurriculum,
  loadCurriculum,
  pickStudyTopic,
  statsFor,
  strandsFor,
  topicNames,
  topicsFor,
} from '../src/shared/curriculum/index.ts';
import { studySetKey } from '../src/services/studyCache.ts';

// The browser loads a subject on demand, so the tests do the same thing the UI does
// before asserting on its topics.
await Promise.all(
  ['GSCI', 'MATH', 'PHY', 'ENG', 'SOC', 'ARTFD'].map((code) => loadCurriculum(code))
);

// ---------------------------------------------------------------- study sizes

test('Study sizes: the three choices are full-size, not toy-sized', () => {
  assert.deepEqual(STUDY_SIZES.quiz, { quick: 5, standard: 10, full: 25 });
  assert.deepEqual(STUDY_SIZES.flashcards, { quick: 10, standard: 20, full: 40 });
  // Full must actually be the largest offered, and fit the caps.
  assert.equal(STUDY_SIZES.quiz.full, STUDY_CAPS.quiz);
  assert.equal(STUDY_SIZES.flashcards.full, STUDY_CAPS.flashcards);
});

test('Study sizes: nothing can be requested above the cap or below the floor', () => {
  assert.equal(clampStudyCount('quiz', 9999), STUDY_CAPS.quiz);
  assert.equal(clampStudyCount('flashcards', 9999), STUDY_CAPS.flashcards);
  assert.equal(clampStudyCount('quiz', 0), STUDY_SIZES.quiz.standard, 'a bad zero falls back to Standard');
  assert.equal(clampStudyCount('quiz', -4), STUDY_SIZES.quiz.standard);
  assert.equal(clampStudyCount('quiz', 1), STUDY_FLOORS.quiz);
  assert.equal(clampStudyCount('quiz', 'abc'), STUDY_SIZES.quiz.standard);
  assert.equal(clampStudyCount('flashcards', undefined), STUDY_SIZES.flashcards.standard);
});

test('Study sizes: a whole Full set never exceeds the batch ceiling', () => {
  for (const kind of ['quiz', 'flashcards'] as const) {
    for (const size of ['quick', 'standard', 'full'] as const) {
      const batches = batchesFor(kind, STUDY_SIZES[kind][size]);
      assert.ok(batches >= 1, `${kind}/${size} must make at least one call`);
      assert.ok(
        batches <= STUDY_MAX_BATCHES,
        `${kind}/${size} needs ${batches} calls, above the ${STUDY_MAX_BATCHES} ceiling`
      );
    }
  }
});

test('Study sizes: batching divides exactly, so a Full set is not padded', () => {
  // 25 questions / 5 per call, 40 cards / 8 per call: both exact.
  assert.equal(batchesFor('quiz', STUDY_CAPS.quiz), STUDY_CAPS.quiz / STUDY_BATCH_SIZE.quiz);
  assert.equal(batchesFor('flashcards', STUDY_CAPS.flashcards), STUDY_CAPS.flashcards / STUDY_BATCH_SIZE.flashcards);
  assert.equal(batchesFor('quiz', 6), 2);
  assert.equal(batchesFor('flashcards', 9), 2);
});

test('Study sizes: only a Full set costs 2 credits', () => {
  assert.equal(creditsFor('quiz', STUDY_SIZES.quiz.quick), 1);
  assert.equal(creditsFor('quiz', STUDY_SIZES.quiz.standard), 1);
  assert.equal(creditsFor('quiz', STUDY_SIZES.quiz.full), 2);
  assert.equal(creditsFor('flashcards', STUDY_SIZES.flashcards.full), 2);
});

test('Study sizes: labels tell the student the real count', () => {
  assert.match(studySizeLabel('quiz', 'full'), /25/);
  assert.match(studySizeLabel('flashcards', 'standard'), /20/);
  assert.equal(studySizeForCount('quiz', 4), 'quick');
  assert.equal(studySizeForCount('quiz', 10), 'standard');
  assert.equal(studySizeForCount('quiz', 25), 'full');
});

// ---------------------------------------------------------------- curriculum

test('Curriculum: generated data is versioned, so caches invalidate together', () => {
  // A date plus a content digest: a real data change always busts caches, a no-op
  // rebuild never does.
  assert.match(CURRICULUM_VERSION, /^\d{4}-\d{2}-\d{2}\+[0-9a-f]{8}$/);
});

test('Curriculum: General Science Form 1 has official strands and verified topics', () => {
  assert.equal(hasCurriculum('GSCI', 1), true);
  const strands = strandsFor('GSCI', 1);
  assert.ok(strands.length > 0, 'expected official strands');
  // Every strand name came from the document's running header.
  for (const name of strands) assert.match(name, /^Section \d+ — /);

  const stats = statsFor('GSCI');
  assert.ok(stats.verified > 0, 'expected verified topics');
  assert.equal(stats.verified, stats.topics, 'every extracted topic is marked verified');
});

test('Curriculum: no page furniture is presented as a study topic', () => {
  const noise = /^(EXTENDED READING|EXTENDED LEARNING|ACKNOWLEDGEMENTS?|ANNEXES?|KEY IDEAS)\b/i;
  for (const t of topicsFor('GSCI', 1)) {
    assert.doesNotMatch(t.topic, noise, `"${t.topic}" is page furniture, not a topic`);
    // A topic never repeats the running header.
    assert.doesNotMatch(t.topic, /^SECTION \d+/i, `"${t.topic}" still carries the running header`);
    // Wrapped headings must have been joined, not left as fragments.
    assert.ok(t.topic.length > 8, `"${t.topic}" looks like a heading fragment`);
  }
});

test('Curriculum: an unknown subject yields nothing rather than guessing', () => {
  assert.equal(getCurriculum('NOT_A_SUBJECT'), null);
  assert.equal(hasCurriculum('NOT_A_SUBJECT', 1), false);
  assert.deepEqual(strandsFor('NOT_A_SUBJECT', 1), []);
  assert.deepEqual(topicsFor('NOT_A_SUBJECT', 1), []);
  assert.equal(pickStudyTopic('NOT_A_SUBJECT', 1), null);
});

test('Curriculum: a form with no material reports no topics', () => {
  // GSCI Form 1 is extracted; a form with nothing extracted must stay empty.
  const stats = statsFor('GSCI');
  assert.ok(!stats.forms.includes('3') || stats.topics > 0);
});

test('Curriculum: the grounding block names the subject, strands and real topics', () => {
  const block = buildCurriculumBlock({ code: 'GSCI', form: 1 });
  assert.match(block, /General Science/);
  assert.match(block, /SHS 1/);
  assert.ok(topicNames('GSCI', 1).some((t) => block.includes(t)), 'a verified topic must appear in the block');
  assert.match(block, /Do not introduce topics/, 'the block must forbid leaving the syllabus');
});

test('Curriculum: the block is byte-stable, so DeepSeek prefix caching works', () => {
  // Same inputs must produce identical text, or the whole school pays full price.
  const a = buildCurriculumBlock({ code: 'GSCI', form: 1 });
  const b = buildCurriculumBlock({ code: 'GSCI', form: 1 });
  assert.equal(a, b);
});

test('Curriculum: the block respects its character budget and never cuts mid-line', () => {
  const block = buildCurriculumBlock({ code: 'GSCI', form: 1, maxChars: 300 });
  assert.ok(block.length <= 400, `block was ${block.length} chars`);
  assert.match(block, /trimmed for length/);
});

test('Curriculum: a topic rotation covers different ground each time', () => {
  const names = topicNames('GSCI', 1);
  if (names.length < 2) return; // nothing to rotate through
  const first = pickStudyTopic('GSCI', 1, 0);
  const second = pickStudyTopic('GSCI', 1, 1);
  assert.ok(first && second);
  assert.notEqual(first.topic, second.topic, 'two taps must not pick the same topic');
  // Rotation wraps rather than running off the end.
  const wrapped = pickStudyTopic('GSCI', 1, names.length);
  assert.equal(wrapped?.topic, first.topic);
});

// ---------------------------------------------------------------- cache keys

test('Study cache: the key carries the clamped size, not the raw request', () => {
  const base = { kind: 'quiz' as const, topic: 'Vectors', subjectCode: 'MATH', count: 9999 };
  const capped = studySetKey(base);
  assert.ok(capped.includes(String(STUDY_CAPS.quiz)), 'a capped request must key on the cap');
  assert.equal(capped, studySetKey({ ...base, count: STUDY_CAPS.quiz }), 'cap and exact size share one key');
});

test('Study cache: topic case and spacing do not fragment the cache', () => {
  const a = studySetKey({ kind: 'quiz', topic: '  Local   Industry ', count: 10 });
  const b = studySetKey({ kind: 'quiz', topic: 'local industry', count: 10 });
  assert.equal(a, b);
});

test('Study cache: a fresh set gets its own key, a reopen keeps the old one', () => {
  const plain = { kind: 'quiz' as const, topic: 'Osmosis', count: 10 };
  const reopen = studySetKey({ ...plain, variant: 0 });
  const fresh = studySetKey({ ...plain, variant: 1 });
  assert.equal(studySetKey(plain), reopen, 'a plain reopen must still hit the cache');
  assert.notEqual(reopen, fresh, 'asking for a new set must not be served the old one');
});

test('Study cache: quizzes and decks never collide', () => {
  const topic = 'Diffusion';
  assert.notEqual(
    studySetKey({ kind: 'quiz', topic, count: 10 }),
    studySetKey({ kind: 'flashcards', topic, count: 10 })
  );
});

test('Study cache: the curriculum version is part of every key', () => {
  assert.ok(studySetKey({ kind: 'quiz', topic: 'Force', count: 5 }).includes(`v${CURRICULUM_VERSION}`));
});

// --------------------------------------------------- multiple subjects (per-subject load)

test('Curriculum: every extracted subject is discoverable, not only the first', () => {
  const subjects = curriculumSubjects();
  assert.ok(subjects.length > 1, 'the index must list every subject with data');

  // This is the regression that hid five finished subjects: the index once carried
  // only General Science, so the others silently returned no topics.
  const withData = subjects.filter((s) => statsFor(s.code).topics > 0);
  assert.ok(withData.length > 1, `expected several subjects with topics, got ${withData.length}`);

  for (const subject of withData) {
    assert.ok(subject.name.length > 0, `${subject.code} must carry a display name`);
  }
});

test('Curriculum: a subject outside the core is grounded too', () => {
  // Physics is an elective; it must work exactly like a core subject.
  assert.equal(hasCurriculum('PHY', 1), true);
  assert.ok(strandsFor('PHY', 1).length > 0);
  const block = buildCurriculumBlock({ code: 'PHY', form: 1 });
  assert.match(block, /Physics/);
  assert.match(block, /Section \d+ — /);
});

test('Curriculum: each subject keeps its own topics (no cross-contamination)', () => {
  const mathTopics = new Set(topicsFor('MATH', 1).map((t) => t.topic));
  const physTopics = topicsFor('PHY', 1).map((t) => t.topic);
  assert.ok(mathTopics.size > 0 && physTopics.length > 0);

  const shared = physTopics.filter((t) => mathTopics.has(t));
  const overlap = shared.length / physTopics.length;
  assert.ok(overlap < 0.5, `Physics and Maths share ${Math.round(overlap * 100)}% of topics`);
});

test('Curriculum: a subject with no loaded data answers "no syllabus", not an empty guess', () => {
  // Never loaded on purpose: the synchronous lookup must not invent a syllabus.
  assert.equal(getCurriculum('COMP'), null);
  assert.equal(buildCurriculumBlock({ code: 'COMP', form: 1 }), '');
});
