import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateStudyResponse,
  generateQuizQuestions,
  generateFlashcardDeck,
  summarizeDocument,
  checkServerHealth,
  AiUnavailableError,
} from '../src/services/aiService.ts';
import {
  DeepSeekProvider,
  DeepSeekConfigError,
  checkRateLimit,
  DEFAULT_DEEPSEEK_MODEL,
  DEEPSEEK_MODEL_IDS,
} from '../src/server/deepseekProvider.ts';

// These tests run with no server listening, so every live-AI call must fail honestly
// rather than substitute sample content.

test('AI Service: chat throws a labelled error instead of fabricating an answer', async () => {
  await assert.rejects(
    () => generateStudyResponse('Explain Integration by Parts', { contextSubject: 'MATH 201' }),
    (err: unknown) => {
      assert.ok(err instanceof AiUnavailableError, 'Error must be AiUnavailableError');
      assert.ok(err.message.length > 20, 'Error message must explain the situation to the student');
      assert.equal(typeof err.reason, 'string', 'Error must carry a machine-readable reason');
      return true;
    }
  );
});

test('AI Service: quiz generation never returns sample questions', async () => {
  await assert.rejects(
    () => generateQuizQuestions('Calculus', { subjectCode: 'MATH 201', count: 3 }),
    (err: unknown) => err instanceof AiUnavailableError
  );
});

test('AI Service: flashcard generation never returns sample cards', async () => {
  await assert.rejects(
    () => generateFlashcardDeck('Deadlocks', { subjectCode: 'CS 301', count: 3 }),
    (err: unknown) => err instanceof AiUnavailableError
  );
});

test('AI Service: document summarisation never echoes the source file as a summary', async () => {
  await assert.rejects(
    () => summarizeDocument('Lecture 04', 'Euler formula V - E + F = 2', 'CS 204'),
    (err: unknown) => err instanceof AiUnavailableError
  );
});

test('AI Service: engine is only ever reported as deepseek when a real result returns', async () => {
  // The return type no longer admits 'local_fallback': removing that union member is the
  // compile-time guarantee that client code cannot present canned content as AI output.
  await assert.rejects(
    () => generateStudyResponse('Hello'),
    (err: unknown) => err instanceof AiUnavailableError
  );
});

test('AI Service: server health check fails gracefully without crashing when offline', async () => {
  const health = await checkServerHealth();
  assert.equal(typeof health.isServerReachable, 'boolean');
  assert.equal(typeof health.hasDeepSeekKey, 'boolean');
  assert.equal(typeof health.modelValid, 'boolean');
  assert.ok(typeof health.model === 'string');
});

test('DeepSeek Provider: rate limiter allows normal traffic and reports remaining capacity', () => {
  const status1 = checkRateLimit('test-client-1');
  assert.equal(status1.allowed, true);
  assert.ok(status1.remaining >= 0);
});

test('DeepSeek Provider: defaults to the verified cheapest model', () => {
  const provider = new DeepSeekProvider({ apiKey: 'test-key' });
  assert.equal(provider.getModelName(), DEFAULT_DEEPSEEK_MODEL);
  assert.equal(DEFAULT_DEEPSEEK_MODEL, 'deepseek-flash');
  assert.equal(provider.isModelValid(), true);
});

test('DeepSeek Provider: every accepted model ID is recognised', () => {
  for (const id of DEEPSEEK_MODEL_IDS) {
    const provider = new DeepSeekProvider({ apiKey: 'test-key', model: id });
    assert.equal(provider.isModelValid(), true, `${id} must be accepted`);
    assert.equal(provider.getModelName(), id);
  }
});

test('DeepSeek Provider: retired deepseek-chat is rejected, never silently remapped', async () => {
  const provider = new DeepSeekProvider({ apiKey: 'test-key', model: 'deepseek-chat' });
  assert.equal(provider.isModelValid(), false);
  assert.equal(provider.getModelName(), 'deepseek-chat', 'Must not rewrite the requested ID');
  assert.ok(provider.getConfigError()?.includes('deepseek-flash'), 'Must name the valid options');

  await assert.rejects(
    () => provider.chat({ message: 'Hello' }),
    (err: unknown) => err instanceof DeepSeekConfigError
  );
});

test('DeepSeek Provider: missing key rejects with an informative error, not a crash', async () => {
  const provider = new DeepSeekProvider({ apiKey: '' });
  assert.equal(provider.isConfigured(), false);
  await assert.rejects(
    () => provider.chat({ message: 'Hello' }),
    /DEEPSEEK_API_KEY is not configured/
  );
});
