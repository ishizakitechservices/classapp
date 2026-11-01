/**
 * End-to-end proof that a Full-size set is actually delivered in full.
 *
 * The DeepSeek API is stubbed at `fetch`, so this runs offline and costs nothing, but
 * it exercises the real code path: batching, the per-batch cache, duplicate rejection,
 * schema validation and the final count. If a Full set can be cut short, this fails.
 */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  DeepSeekProvider,
  BATCH_TOKEN_BUDGET,
  clearCachedResults,
  getCacheStats,
  isSameStem,
  normaliseStem,
} from '../src/server/deepseekProvider.ts';
import { loadAllCurricula } from '../src/server/curriculumLoader.ts';
import { STUDY_CAPS, STUDY_SIZES, STUDY_BATCH_SIZE } from '../src/shared/studyLimits.ts';

// The server registers every subject at startup; the tests do the same so a generated
// batch is grounded exactly as it would be in production.
await loadAllCurricula();

interface Call {
  body: any;
  url: string;
}

/** A stub DeepSeek that answers each request with a batch of well-formed items. */
function stubDeepSeek(kind: 'quiz' | 'flashcards', opts: { repeatStems?: boolean } = {}) {
  const calls: Call[] = [];
  let counter = 0;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any, init?: any) => {
    const body = init?.body ? JSON.parse(init.body) : {};
    calls.push({ url: String(url), body });

    // Read the requested item count out of the prompt ("Return exactly N ...").
    const userText = String(body.messages?.find((m: any) => m.role === 'user')?.content ?? '');
    const wanted = Number(/Return exactly (\d+) /.exec(userText)?.[1] ?? 0) || 1;

    // The app's own instruction is "do not repeat these stems", so unique text is the
    // expected behaviour. `repeatStems` simulates a disobedient model.
    const items = Array.from({ length: wanted }, (_, i) => {
      counter += 1;
      const unique = opts.repeatStems ? 1 : counter;
      return kind === 'quiz'
        ? {
            id: `q-${unique}`,
            question: `Question ${unique} about the topic?`,
            options: ['A', 'B', 'C', 'D'],
            correctAnswerIndex: 0,
            explanation: 'Because A is correct.',
          }
        : {
            id: `fc-${unique}`,
            topic: 'Subtopic',
            prompt: `Prompt ${unique} about the topic?`,
            answer: `Answer ${unique}.`,
          };
    });

    const payload =
      kind === 'quiz'
        ? { quizTitle: 'Stubbed Quiz', questions: items }
        : { topic: 'Stubbed Deck', flashcards: items };

    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(payload) }, finish_reason: 'stop' }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }) as typeof fetch;

  return {
    calls,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

beforeEach(() => {
  // Each test starts from a cold cache, so batching behaviour is measured honestly.
  clearCachedResults();
});

test('Full quiz: 25 questions arrive complete, across exactly 5 provider calls', async () => {
  const stub = stubDeepSeek('quiz');
  try {
    const provider = new DeepSeekProvider({ apiKey: 'test-key' });
    const count = STUDY_SIZES.quiz.full;

    const result = await provider.generateQuiz({ topic: 'Diffusion and Osmosis', count });

    assert.equal(result.questions.length, count, 'a Full quiz must deliver every question');
    assert.equal(result.calls, count / STUDY_BATCH_SIZE.quiz, 'one call per batch, no retries needed');
    assert.equal(stub.calls.length, count / STUDY_BATCH_SIZE.quiz);
    assert.equal(result.quizTitle, 'Stubbed Quiz');

    // Every question is answerable: 4 options and an in-range index.
    for (const q of result.questions) {
      assert.equal(q.options.length, 4);
      assert.ok(q.correctAnswerIndex >= 0 && q.correctAnswerIndex < 4);
      assert.ok(q.question.trim().length > 0);
    }
    // No duplicates slipped through.
    const stems = result.questions.map((q: any) => normaliseStem(q.question));
    assert.equal(new Set(stems).size, count, 'questions must be unique');
  } finally {
    stub.restore();
  }
});

test('Full deck: 40 cards arrive complete, across exactly 5 provider calls', async () => {
  const stub = stubDeepSeek('flashcards');
  try {
    const provider = new DeepSeekProvider({ apiKey: 'test-key' });
    const count = STUDY_SIZES.flashcards.full;

    const result = await provider.generateFlashcards({ topic: 'Local Industry', count });

    assert.equal(result.flashcards.length, count, 'a Full deck must deliver every card');
    assert.equal(result.calls, count / STUDY_BATCH_SIZE.flashcards);
    for (const card of result.flashcards) {
      assert.ok(card.prompt.trim().length > 0);
      assert.ok(card.answer.trim().length > 0);
    }
  } finally {
    stub.restore();
  }
});

test('Quick and Standard sets stay inside one or two calls', async () => {
  const stub = stubDeepSeek('quiz');
  try {
    const provider = new DeepSeekProvider({ apiKey: 'test-key' });

    const quick = await provider.generateQuiz({ topic: 'Force', count: STUDY_SIZES.quiz.quick });
    assert.equal(quick.questions.length, STUDY_SIZES.quiz.quick);
    assert.equal(quick.calls, 1);

    clearCachedResults();
    const standard = await provider.generateQuiz({ topic: 'Energy', count: STUDY_SIZES.quiz.standard });
    assert.equal(standard.questions.length, STUDY_SIZES.quiz.standard);
    assert.equal(standard.calls, 2);
  } finally {
    stub.restore();
  }
});

test('Reopening the same set costs nothing: the batch cache serves it', async () => {
  const stub = stubDeepSeek('quiz');
  try {
    const provider = new DeepSeekProvider({ apiKey: 'test-key' });
    const params = { topic: 'Reproduction in Plants', count: STUDY_SIZES.quiz.standard };

    const first = await provider.generateQuiz(params);
    assert.equal(first.calls, 2);

    const second = await provider.generateQuiz(params);
    assert.equal(second.calls, 0, 'a cached set must not make a single provider call');
    assert.equal(second.questions.length, first.questions.length);
    assert.equal(stub.calls.length, 2, 'no new HTTP requests for a cached set');
  } finally {
    stub.restore();
  }
});

test('A fresh set (new variant) does call the provider again', async () => {
  const stub = stubDeepSeek('quiz');
  try {
    const provider = new DeepSeekProvider({ apiKey: 'test-key' });
    const params = { topic: 'Solar Panels', count: STUDY_SIZES.quiz.quick };

    await provider.generateQuiz({ ...params, variant: 0 });
    const fresh = await provider.generateQuiz({ ...params, variant: 1 });

    assert.equal(fresh.calls, 1, 'asking for a new set must really generate one');
    assert.equal(stub.calls.length, 2);
  } finally {
    stub.restore();
  }
});

test('A model that repeats itself still returns no duplicate questions', async () => {
  const stub = stubDeepSeek('quiz', { repeatStems: true });
  try {
    const provider = new DeepSeekProvider({ apiKey: 'test-key' });
    const result = await provider.generateQuiz({ topic: 'Basic Electronics', count: STUDY_SIZES.quiz.standard });

    // Every batch returns the same single stem, so only the first survives. What matters
    // is that nothing duplicated is ever handed to the student.
    const stems = result.questions.map((q: any) => normaliseStem(q.question));
    assert.equal(new Set(stems).size, stems.length, 'no duplicate stems may reach the runner');
    for (let i = 0; i < stems.length; i++) {
      for (let j = i + 1; j < stems.length; j++) {
        assert.equal(isSameStem(stems[i], stems[j]), false);
      }
    }
  } finally {
    stub.restore();
  }
});

test('An oversized request is clamped, never sent as-is', async () => {
  const stub = stubDeepSeek('quiz');
  try {
    const provider = new DeepSeekProvider({ apiKey: 'test-key' });
    const result = await provider.generateQuiz({ topic: 'Exploring Materials', count: 500 });
    assert.equal(result.questions.length, STUDY_CAPS.quiz, 'cannot exceed the hard cap');
  } finally {
    stub.restore();
  }
});

test('The curriculum block travels with every generated batch', async () => {
  const stub = stubDeepSeek('quiz');
  try {
    const provider = new DeepSeekProvider({ apiKey: 'test-key' });
    await provider.generateQuiz({ topic: 'Diffusion', subjectCode: 'GSCI', formLevel: 1, count: 5 });

    const systemText = stub.calls
      .map((c) => c.body.messages.filter((m: any) => m.role === 'system').map((m: any) => m.content).join('\n'))
      .join('\n');
    assert.match(systemText, /General Science/, 'the batch must be grounded in the subject');
    assert.match(systemText, /Section \d+ — /, 'the batch must carry the official strands');
  } finally {
    stub.restore();
  }
});

test('A provider failure surfaces as an error, never a partial silent success', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: { message: 'upstream exploded' } }), { status: 500 })) as typeof fetch;
  try {
    const provider = new DeepSeekProvider({ apiKey: 'test-key' });
    await assert.rejects(() => provider.generateQuiz({ topic: 'Anything', count: 5 }), /500|exploded/i);
  } finally {
    globalThis.fetch = originalFetch;
    clearCachedResults();
  }
});

test('A truncated batch still yields its complete questions (salvage)', async () => {
  // Reproduces the live failure: the model is cut off mid-JSON. The complete objects
  // must survive; only the half-written one is dropped.
  const originalFetch = globalThis.fetch;
  const truncated =
    '{"quizTitle":"Cut Off","questions":[' +
    JSON.stringify({
      id: 'q-1',
      question: 'First complete question?',
      options: ['A', 'B', 'C', 'D'],
      correctAnswerIndex: 1,
      explanation: 'Because B.',
    }) +
    ',' +
    JSON.stringify({
      id: 'q-2',
      question: 'Second complete question?',
      options: ['A', 'B', 'C', 'D'],
      correctAnswerIndex: 2,
      explanation: 'Because C.',
    }) +
    ',{"id":"q-3","question":"This one is cut mid-str'; // no closing

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ choices: [{ message: { content: truncated }, finish_reason: 'length' }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )) as typeof fetch;

  try {
    const provider = new DeepSeekProvider({ apiKey: 'test-key' });
    const result = await provider.generateQuiz({ topic: 'Cut Off Topic', count: 3 });

    // The two finished questions are kept rather than the whole batch being thrown away.
    assert.ok(result.questions.length >= 2, `salvaged ${result.questions.length}, expected at least 2`);
    for (const q of result.questions) {
      assert.ok(q.question.trim().length > 0);
      assert.equal(q.options.length, 4);
    }
    assert.ok(!result.questions.some((q: any) => q.question.includes('cut mid-str')));
  } finally {
    globalThis.fetch = originalFetch;
    clearCachedResults();
  }
});

test('The batch budget covers reasoning plus JSON (measured, not guessed)', () => {
  // A live run spent 574-1279 tokens reasoning before writing JSON, and max_tokens caps
  // both together. A 1800 budget returned empty or cut replies; 6000 leaves headroom.
  assert.ok(
    BATCH_TOKEN_BUDGET.quiz >= 4000,
    `quiz batch budget ${BATCH_TOKEN_BUDGET.quiz} is too small to survive reasoning + JSON`
  );
  assert.ok(BATCH_TOKEN_BUDGET.flashcards >= 3500);
});

test('An empty reply is retried, not silently dropped', async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = (async (_url: any, init: any) => {
    attempts += 1;
    // First attempt: the model reasons and returns nothing. Later attempts: a normal batch.
    // "Return exactly N question object(s)" — match the phrase, not a stray number.
    const userText = String(JSON.parse(init.body).messages.find((m: any) => m.role === 'user')?.content ?? '');
    const asked = Number(/Return exactly (\d+) question/.exec(userText)?.[1] ?? 1);
    const content =
      attempts === 1
        ? ''
        : JSON.stringify({
            quizTitle: 'Retried',
            questions: Array.from({ length: asked }, (_, i) => ({
              id: `q-${attempts}-${i}`,
              question: `Question ${attempts}-${i} after retry?`,
              options: ['A', 'B', 'C', 'D'],
              correctAnswerIndex: 0,
              explanation: 'A.',
            })),
          });
    return new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const provider = new DeepSeekProvider({ apiKey: 'test-key' });
    // `count: 1` is raised to the floor of 3, so ask for exactly 3 and expect 3.
    const result = await provider.generateQuiz({ topic: 'Retry Topic', count: 3 });
    assert.equal(attempts, 2, 'the empty reply must trigger exactly one retry, then succeed');
    assert.equal(result.questions.length, 3, 'a short reply must be topped up to the full size');
  } finally {
    globalThis.fetch = originalFetch;
    clearCachedResults();
  }
});

test('The cache reports its version so stale data can be spotted', () => {
  const stats = getCacheStats();
  assert.match(stats.version, /^\d{4}-\d{2}-\d{2}\+[0-9a-f]{8}$/);
  assert.ok(stats.max > 0);
});
