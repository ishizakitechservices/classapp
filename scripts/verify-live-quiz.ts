/**
 * Live check: one real Full-size quiz against the real provider.
 *
 * This costs money, so it is deliberately small (one Full set = 5 provider calls) and is
 * never run automatically. It answers the only question the stubbed tests cannot: does
 * the real model, with the real curriculum block, return a complete and well-formed set?
 *
 *   node --import tsx scripts/verify-live-quiz.ts            # Full General Science, 25 questions
 *   node --import tsx scripts/verify-live-quiz.ts --quick    # 5 questions, cheaper
 *   node --import tsx scripts/verify-live-quiz.ts --subject MATH --topic "Vectors"
 */

import 'dotenv/config';
import { DeepSeekProvider } from '../src/server/deepseekProvider.ts';
import { loadAllCurricula } from '../src/server/curriculumLoader.ts';
import { buildCurriculumBlock, topicsFor } from '../src/shared/curriculum/index.ts';
import { STUDY_SIZES } from '../src/shared/studyLimits.ts';

const args = process.argv.slice(2);
function arg(name: string, fallback: string): string {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
}

const subjectCode = arg('subject', 'GSCI').toUpperCase();
const form = Number(arg('form', '1')) || 1;
const size = args.includes('--quick') ? 'quick' : 'standard';
const count = args.includes('--full') ? STUDY_SIZES.quiz.full : STUDY_SIZES.quiz[size];

async function main() {
  const provider = new DeepSeekProvider();
  if (!provider.isConfigured()) {
    console.error('DEEPSEEK_API_KEY is not set; nothing to verify.');
    process.exitCode = 1;
    return;
  }

  const { loaded, failed } = await loadAllCurricula();
  console.log(`curriculum: ${loaded} subject(s) loaded${failed.length ? `, missing: ${failed.join(',')}` : ''}`);

  // Pick a real topic from the syllabus rather than inventing one.
  const curriculumTopic = topicsFor(subjectCode, form)[0];
  const topic = arg('topic', curriculumTopic?.topic ?? 'General Science');
  const strand = arg('strand', curriculumTopic?.strand ?? '');

  console.log(`\nGenerating ${count} questions on "${topic}" (${subjectCode}, SHS ${form})…`);
  console.log(`curriculum block supplied: ${buildCurriculumBlock({ code: subjectCode, form }).length} chars\n`);

  const startedAt = Date.now();
  const result = await provider.generateQuiz({
    topic,
    subjectCode,
    formLevel: form,
    strand,
    count,
  });
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log(`done in ${seconds}s — ${result.calls} provider call(s), ${result.questions.length} question(s)\n`);

  // Honest structural checks: a set is only "complete" if every item can be answered.
  let problems = 0;
  const stems = new Set<string>();
  for (const [i, q] of result.questions.entries()) {
    const issues: string[] = [];
    if (!q.question?.trim()) issues.push('empty stem');
    if (!Array.isArray(q.options) || q.options.length !== 4) issues.push(`options=${q.options?.length}`);
    if (!Number.isInteger(q.correctAnswerIndex) || q.correctAnswerIndex < 0 || q.correctAnswerIndex > 3) {
      issues.push(`answerIndex=${q.correctAnswerIndex}`);
    }
    if (!q.explanation?.trim()) issues.push('no explanation');
    const key = String(q.question).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (stems.has(key)) issues.push('DUPLICATE stem');
    stems.add(key);
    if (issues.length) {
      problems += 1;
      console.log(`  ✗ Q${i + 1}: ${issues.join(', ')}`);
    }
  }

  console.log(`title: ${result.quizTitle}`);
  console.log(`format: ${problems === 0 ? 'all questions well-formed' : `${problems} problem(s) above`}`);
  console.log(
    `count : ${result.questions.length}/${count} ${result.questions.length === count ? '(complete)' : '(SHORT)'}`
  );

  // Show the first question so the content can be judged, not just the shape.
  const first = result.questions[0];
  if (first) {
    console.log('\n--- first question ---');
    console.log(first.question);
    first.options.forEach((opt: string, i: number) =>
      console.log(`  ${String.fromCharCode(65 + i)}${i === first.correctAnswerIndex ? ' *' : ' '} ${opt}`)
    );
    console.log(`strand: ${first.strand ?? '(none)'}`);
  }

  if (result.questions.length !== count || problems > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('live verification failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
