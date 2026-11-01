/** Verifies AI-written chat titles on awkwardly phrased questions. */
const base = 'http://localhost:3000';

const login = await fetch(`${base}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ studentId: 'm162', password: 'asdfqwerzxcv' }),
});
const cookie = (login.headers.get('set-cookie') || '').split(';')[0];

const questions = [
  'what is the difference between ionic and covalent bonding',
  'i do not understand how to do partial fractions in add maths',
];

for (const q of questions) {
  const res = await fetch(`${base}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ message: q, wantTitle: true }),
  });
  const data: any = await res.json();
  console.log(`Q: ${q}`);
  console.log(`   TITLE: ${JSON.stringify(data.nudge)}`);
  console.log(`   TITLE_LEAKED_IN_ANSWER: ${/TITLE:/.test(data.text)}`);
}
