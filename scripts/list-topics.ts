/**
 * Print every extracted curriculum topic, grouped by subject and form.
 *
 *   node --import tsx scripts/list-topics.ts             # everything
 *   node --import tsx scripts/list-topics.ts --only PHY  # one subject
 *   node --import tsx scripts/list-topics.ts --counts    # per-subject totals only
 */
import 'dotenv/config';
import { loadAllCurricula } from '../src/server/curriculumLoader.ts';
import {
  GENERATED_CURRICULUM,
  strandsFor,
  topicsFor,
  type CurriculumForm,
} from '../src/shared/curriculum/index.ts';

const args = process.argv.slice(2);
const onlyArg = args.indexOf('--only');
const only = onlyArg !== -1 ? String(args[onlyArg + 1] || '').toUpperCase() : '';
const countsOnly = args.includes('--counts');

await loadAllCurricula();

let grand = 0;

for (const meta of GENERATED_CURRICULUM) {
  if (only && meta.code !== only) continue;

  const forms = ([1, 2, 3] as CurriculumForm[]).filter((f) => strandsFor(meta.code, f).length > 0);
  if (forms.length === 0) {
    console.log(`\n${meta.code} — ${meta.name}: no material`);
    continue;
  }

  const total = forms.reduce((n, f) => n + topicsFor(meta.code, f).length, 0);
  grand += total;
  console.log(`\n${meta.code} — ${meta.name}  (${total} topics, forms ${forms.join('/')})`);

  if (countsOnly) continue;

  for (const form of forms) {
    console.log(`\n  SHS ${form}`);
    const strands = strandsFor(meta.code, form);
    for (const strand of strands) {
      const topics = topicsFor(meta.code, form).filter((t) => t.strand === strand);
      if (topics.length === 0) continue;
      console.log(`    ${strand}`);
      for (const t of topics) console.log(`      - ${t.topic}`);
    }
  }
}

console.log(`\nTotal: ${grand} topics across ${GENERATED_CURRICULUM.length} subject(s)`);
