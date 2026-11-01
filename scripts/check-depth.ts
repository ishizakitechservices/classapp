import { classifyReplyDepth } from '../src/server/deepseekProvider.ts';

const cases: Array<[string, string]> = [
  ['Yo', 'greeting'],
  ['yo!', 'greeting'],
  ['hi there', 'greeting'],
  ['Good morning', 'greeting'],
  ['thanks', 'greeting'],
  ['ok cool', 'greeting'],
  ['What is photosynthesis?', 'brief'],
  ['Define oxidation', 'brief'],
  ['give me the formula for Ohm law', 'brief'],
  ['Explain why ionic compounds conduct when molten', 'detailed'],
  ['Derive the quadratic formula', 'detailed'],
  ['Compare mitosis and meiosis', 'detailed'],
  ['solve 2x + 5 = 17 with steps', 'detailed'],
  ['I have a test on organic chemistry next week and I am struggling with naming alkanes, alkenes and IUPAC rules', 'standard'],
];

let failures = 0;
for (const [input, expected] of cases) {
  const got = classifyReplyDepth(input);
  const ok = got === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${JSON.stringify(input).padEnd(60)} ${got}${ok ? '' : ` (expected ${expected})`}`);
}
console.log(failures === 0 ? '\nAll depth classifications correct.' : `\n${failures} mismatch(es).`);
