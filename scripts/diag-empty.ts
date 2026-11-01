/**
 * Diagnostic: why does a batch sometimes return almost no text while using the whole
 * token budget? Inspects the raw response object, including reasoning tokens.
 *
 *   node --import tsx scripts/diag-empty.ts --repeat 5
 */
import 'dotenv/config';
import { DeepSeekProvider, BATCH_TOKEN_BUDGET } from '../src/server/deepseekProvider.ts';
import { loadAllCurricula } from '../src/server/curriculumLoader.ts';
import { buildCurriculumBlock, topicsFor } from '../src/shared/curriculum/index.ts';

await loadAllCurricula();

const provider = new DeepSeekProvider() as any;
const repeat = Number(/--repeat\s+(\d+)/.exec(process.argv.join(' '))?.[1] ?? 5);
const topic = topicsFor('GSCI', 1)[0];
const block = buildCurriculumBlock({ code: 'GSCI', form: 1, focusTopic: topic?.topic });

const systemPrompt = `Write rigorous multiple-choice questions. Output valid JSON only:
{"quizTitle":"...","questions":[{"id":"q-1","question":"...","options":["A","B","C","D"],"correctAnswerIndex":0,"explanation":"..."}]}
Exactly 4 options per question. Finish every object. JSON only.`;

for (let i = 1; i <= repeat; i++) {
  const payload = {
    model: provider.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'system', content: block },
      {
        role: 'user',
        content: `Write questions ${(i - 1) * 5 + 1} to ${i * 5} of a 25-question set on "${topic?.topic}". Return exactly 5 question objects.`,
      },
    ],
    temperature: 0.6,
    max_tokens: BATCH_TOKEN_BUDGET.quiz,
    response_format: { type: 'json_object' },
  };

  const res = await provider.callApiWithRetry('/chat/completions', payload);
  const choice = res?.choices?.[0];
  const msg = choice?.message ?? {};
  const content = String(msg.content ?? '');

  console.log(`\nrun ${i}`);
  console.log('  finish_reason      :', choice?.finish_reason);
  console.log('  usage              :', JSON.stringify(res?.usage));
  console.log('  reasoning_content  :', msg.reasoning_content ? `${String(msg.reasoning_content).length} chars` : '(none)');
  console.log('  content            :', content.length, 'chars');
  console.log('  content starts     :', JSON.stringify(content.slice(0, 60)));
  console.log('  message keys       :', Object.keys(msg).join(', '));
}
