/**
 * Diagnostic: repeat a batch several times and report the token usage and validity of
 * each reply, so an intermittent truncation can be seen rather than guessed at.
 *
 *   node --import tsx scripts/diag-json.ts --repeat 6
 */
import 'dotenv/config';
import { DeepSeekProvider, BATCH_TOKEN_BUDGET } from '../src/server/deepseekProvider.ts';
import { loadAllCurricula } from '../src/server/curriculumLoader.ts';
import { buildCurriculumBlock, topicsFor } from '../src/shared/curriculum/index.ts';

await loadAllCurricula();

const repeat = Number(/--repeat\s+(\d+)/.exec(process.argv.join(' '))?.[1] ?? 4);
const provider = new DeepSeekProvider() as any;
// Default to the provider's REAL per-batch budget, so this measures production behaviour.
const maxTokens = Number(/--tokens\s+(\d+)/.exec(process.argv.join(' '))?.[1] ?? BATCH_TOKEN_BUDGET.quiz);

const topic = topicsFor('GSCI', 1)[0];
const block = buildCurriculumBlock({ code: 'GSCI', form: 1, focusTopic: topic?.topic });

// Same system prompt shape the real builder uses, including the full response schema.
const systemPrompt = `Write rigorous multiple-choice WASSCE-standard questions. Output valid JSON only, with this exact schema:
{
  "quizTitle": "Descriptive Topic Title",
  "questions": [
    {
      "id": "q-1",
      "question": "Clear conceptual question stem?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswerIndex": 0,
      "explanation": "Why this answer is correct and why the other options fail.",
      "strand": "Official strand this question examines",
      "subStrand": "Official sub-strand"
    }
  ]
}
Requirements:
1. Exactly 4 options per question, one unambiguously correct.
2. correctAnswerIndex is an integer 0-3.
3. Use only topics from the curriculum block supplied in the next message.
4. Never repeat a question stem already generated earlier in this set.
5. Finish every object. Output JSON only — no markdown, no commentary.`;

let failures = 0;
let worst = 0;

for (let i = 1; i <= repeat; i++) {
  const from = (i - 1) * 5 + 1;
  const payload = {
    model: provider.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'system', content: block },
      {
        role: 'user',
        content: `Write questions ${from} to ${from + 4} of a 25-question set on "${topic?.topic}".\nSubject code: GSCI.\nReturn exactly 5 question objects.`,
      },
    ],
    temperature: 0.6,
    max_tokens: maxTokens,
    response_format: { type: 'json_object' },
  };

  const res = await provider.callApiWithRetry('/chat/completions', payload);
  const choice = res?.choices?.[0];
  const text = String(choice?.message?.content ?? '');
  const tokens = Number(res?.usage?.completion_tokens ?? 0);
  worst = Math.max(worst, tokens);

  let verdict: string;
  // Use the provider's REAL parser, so this measures the salvager too.
  try {
    const parsed = provider.parseJsonFromOutput(text);
    const items = Array.isArray(parsed?.questions) ? parsed.questions.length : 0;
    verdict = `parsed ${items} question(s)${res?.choices?.[0]?.finish_reason === 'length' ? ' [salvaged]' : ''}`;
    if (items === 0) failures += 1;
  } catch (err) {
    failures += 1;
    verdict = `LOST (${(err as Error).message.slice(0, 50)})`;
  }

  console.log(
    `run ${i}: finish=${String(choice?.finish_reason).padEnd(6)} tokens=${String(tokens).padStart(4)}/${maxTokens} chars=${String(text.length).padStart(4)}  ${verdict}`
  );
}

console.log(`\n${failures}/${repeat} batch(es) lost content, worst token use ${worst}/${maxTokens}`);
if (failures > 0) process.exitCode = 1;
