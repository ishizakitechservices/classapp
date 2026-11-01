import assert from 'node:assert/strict';
import test from 'node:test';
import { DeepSeekProvider, stripThinking } from '../src/server/deepseekProvider.ts';

const encoder = new TextEncoder();
const originalFetch = globalThis.fetch;

function sse(chunks: string[], finish = 'stop'): Response {
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: finish }] })}\n\n`)
        );
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    }),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
  );
}

function tokenEvents(tokens: string[]): string[] {
  return tokens.map(
    (token) => `data: ${JSON.stringify({ choices: [{ delta: { content: token } }] })}\n\n`
  );
}

function provider() {
  process.env.DEEPSEEK_API_KEY = 'test-key';
  process.env.DEEPSEEK_MODEL = 'deepseek-flash';
  return new DeepSeekProvider();
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('streaming preserves the spaces between provider chunks', async () => {
  globalThis.fetch = (async () => sse(tokenEvents(['Hello', ' world', '.', ' How', ' are', ' you?']))) as typeof fetch;

  const deltas: string[] = [];
  const result = await provider().chatStream({ message: 'say hello' }, (delta) => deltas.push(delta));

  assert.equal(deltas.join(''), 'Hello world. How are you?');
  assert.equal(result.text, 'Hello world. How are you?');
});

test('a TITLE line is withheld from the answer and returned as the title', async () => {
  globalThis.fetch = (async () =>
    sse(tokenEvents(['TITLE: Photosynthesis basics', '\n', 'Plants', ' make', ' food.']))) as typeof fetch;

  const deltas: string[] = [];
  const result = await provider().chatStream({ message: 'teach me', wantTitle: true }, (delta) =>
    deltas.push(delta)
  );

  assert.equal(deltas.join(''), 'Plants make food.');
  assert.equal(result.text, 'Plants make food.');
  assert.equal(result.nudge, 'Photosynthesis basics');
});

test('reasoning_content is never streamed as the answer', async () => {
  globalThis.fetch = (async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: 'secret scratchpad' } }] })}\n\n`
            )
          );
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`
            )
          );
          controller.close();
        },
      }),
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
    )) as typeof fetch;

  const deltas: string[] = [];
  await assert.rejects(
    provider().chatStream({ message: 'hard question' }, (delta) => deltas.push(delta)),
    /no answer text/i
  );
  assert.deepEqual(deltas, []);
});

test('chat reports an honest error when the model returns no content', async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(
      JSON.stringify({ choices: [{ message: { content: '', reasoning_content: 'only thinking' }, finish_reason: 'stop' }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }) as typeof fetch;

  await assert.rejects(provider().chat({ message: 'teach me' }), /no answer text/i);
  assert.equal(calls, 2, 'an empty reply is retried once before failing');
});

test('stripThinking keeps spacing for streaming deltas', () => {
  assert.equal(stripThinking(' world', false), ' world');
  assert.equal(stripThinking(' world'), 'world');
  assert.equal(stripThinking('a <thinking>x</thinking> b', false), 'a  b');
});
