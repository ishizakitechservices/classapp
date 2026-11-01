/** Inspects whether long answers get truncated before the TITLE line is emitted. */
const base = 'http://localhost:3000';

const login = await fetch(`${base}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ studentId: 'm162', password: 'asdfqwerzxcv' }),
});
const cookie = (login.headers.get('set-cookie') || '').split(';')[0];

const res = await fetch(`${base}/api/ai/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: cookie },
  body: JSON.stringify({
    message: 'what is the difference between ionic and covalent bonding',
    wantTitle: true,
  }),
});
const data: any = await res.json();
console.log('ANSWER_CHARS=' + (data.text || '').length);
console.log('NUDGE=' + JSON.stringify(data.nudge));
console.log('TAIL=' + JSON.stringify((data.text || '').slice(-180)));
