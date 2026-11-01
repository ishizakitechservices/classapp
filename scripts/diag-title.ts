/** Diagnostic: raw JSON body of one Adom AI chat reply, to inspect title handling. */
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
  body: JSON.stringify({ message: 'define osmosis', wantTitle: true }),
});
const raw = await res.text();
console.log('STATUS=' + res.status);
console.log('KEYS=' + Object.keys(JSON.parse(raw)).join(','));
console.log('RAW_TAIL=' + raw.slice(-320));
