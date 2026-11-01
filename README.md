# ClassApp

A mobile-first student learning app: **Home**, **Classes**, **Vault**, **Adom AI**, and **Notices**.

## AI provider policy

DeepSeek is the **only** cloud AI provider. There is no Gemini fallback and no secondary
cloud model. When DeepSeek is unavailable the app says so and offers a retry — it never
invents study content and presents it as AI output.

## Google Classroom

Sign in, open **Classes**, and tap **Connect Google Classroom**. Google returns a short-lived
Classroom/Drive access token; it stays in memory and is saved server-side against the
student's account so a reload does not need another popup. **Disconnect** deletes the stored
token and the subject links. If the popup is blocked or the site is not authorised in
Firebase, the app shows the exact setting to change instead of failing silently.

The same button also appears inside each subject. There, a Google Classroom course is
**merged** into that ClassApp subject: the page and the classroom view use the ClassApp
subject name, while the Google course name is kept only as the source label.

## Run locally

**Prerequisite:** Node.js 20.19+ or 22.12+.

1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env` and set `DEEPSEEK_API_KEY` to your DeepSeek API key
   (create one at <https://platform.deepseek.com/api_keys>). The key is read by the server
   only and is never sent to the browser.
3. Start the dev server:
   `npm run dev`

The app runs at <http://localhost:3000>.

Without a key the app still loads and offline study tools work; Adom AI shows an
"unavailable" state instead of generating answers.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Express server with Vite middleware mode |
| `npm run build` | Production client build into `dist/` |
| `npm start` | Build, then serve `dist/` from Express in production mode |
| `npm run lint` | Type check with `tsc --noEmit` |
| `npm test` | Run the Node test suite |

## Environment variables

See `.env.example`. Only `DEEPSEEK_API_KEY` is required for live AI.
`DEEPSEEK_MODEL` is optional and must be a verified DeepSeek model ID
(`deepseek-flash` or `deepseek-v4-pro`); any other value fails loudly with a 503 rather
than silently switching models.

## Security notes

- API keys are server-side only. Do not create `VITE_`-prefixed AI secrets.
- Google OAuth access tokens are held in memory only, never in `localStorage`.
- Firestore access rules are default-deny and owner-scoped; see `firestore.rules` and
  `security_spec.md`.

## Deployment

See **DEPLOYMENT.md** for the full production deploy guide.

Short version:

1. `cp .env.example .env` and fill in `DEEPSEEK_API_KEY`, `DATABASE_URL`, and the B2 variables.
2. `node --import tsx scripts/migrate.ts` to apply the schema.
3. `node --import tsx scripts/setup.ts <ADMIN_PASSWORD>` to create the admin account.
4. `npm run build` then `npm start` to serve.

`npm start` builds the client and serves it from Express on `PORT` (default 3000).
`.env` and `firebase-applet-config.json` are gitignored — never commit them.

