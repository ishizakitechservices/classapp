# ClassApp — Deployment Guide

ClassApp is a Node.js + Express + Vite app. It runs as a single server process that
serves the built React client and provides the API routes. It needs **Neon Postgres**
for accounts and **Backblaze B2** for file storage. DeepSeek is the only AI provider.

## 1. Prerequisites

- Node.js 20.19+ or 22.12+
- A Neon Postgres project (`DATABASE_URL`)
- A Backblaze B2 bucket (`B2_ENDPOINT`, `B2_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET_NAME`)
- A DeepSeek API key (`DEEPSEEK_API_KEY`)
- A Firebase project with Google sign-in enabled (for optional Google Classroom sync)

## 2. Clone and install

```bash
git clone <your-repo>
cd classapp
npm install
```

## 3. Configure environment

Copy `.env.example` to `.env` and fill in the real values:

```bash
cp .env.example .env
```

| Variable | Required | Notes |
|---|---|---|
| `DEEPSEEK_API_KEY` | Yes | From https://platform.deepseek.com/api_keys |
| `DEEPSEEK_MODEL` | No | Default `deepseek-flash`. Only `deepseek-flash` or `deepseek-v4-pro` accepted. |
| `DATABASE_URL` | Yes | Neon pooled connection string, `?sslmode=require` |
| `B2_ENDPOINT` | Yes | e.g. `https://s3.us-east-005.backblazeb2.com` |
| `B2_REGION` | Yes | Must match your bucket's region |
| `B2_KEY_ID` | Yes | Backblaze application key ID |
| `B2_APPLICATION_KEY` | Yes | Backblaze application key |
| `B2_BUCKET_NAME` | Yes | Default in example: `classapp-vault` |
| `APP_URL` | No | Public URL of the deployed app |

The key is read by the server only and never sent to the browser.

## 4. Set up the database

```bash
node --import tsx scripts/migrate.ts
```

This is idempotent — safe to re-run.

## 5. Create the admin account

```bash
node --import tsx scripts/setup.ts <ADMIN_PASSWORD>
```

This creates the admin account (`studentId: m162`, name: Johnson Bediako Ametsitsi,
class: 2 Science 1) if it doesn't exist, or promotes an existing account to admin.
The password is never written to disk.

## 6. Google Classroom (optional)

ClassApp can sync with Google Classroom for assignments and materials. This requires:

1. A Firebase project with the **Google sign-in provider enabled**.
2. Add your deployed domain to **Firebase Console → Authentication → Settings → Authorized domains**.
3. Create `firebase-applet-config.json` in the project root from your Firebase project's
   app config. This file is **not committed** (see `.gitignore`). Example shape:

```json
{
  "projectId": "your-firebase-project",
  "appId": "1:...:web:...",
  "apiKey": "AIza...",
  "authDomain": "your-project.firebaseapp.com",
  "firestoreDatabaseId": "default",
  "storageBucket": "your-project.appspot.com",
  "messagingSenderId": "...",
  "measurementId": "",
  "oAuthClientId": "...apps.googleusercontent.com",
  "recaptchaSiteKey": ""
}
```

Without this file, Google Classroom features are unavailable but the rest of the app works.

## 7. Build and start

```bash
npm run build      # builds the React client into dist/
npm start          # serves dist/ from Express
```

`npm start` runs `npm run build` first, then starts the server with `node --env-file-if-exists=.env`.
The app listens on `PORT` (default `3000`).

## 8. Platform notes

- **Render / Railway / Fly / Cloud Run:** Set the environment variables in the platform dashboard,
  run `npm run build` as the build command, and `npm start` as the start command.
- The server binds to `0.0.0.0:$PORT`.
- Do **not** commit `.env` or `firebase-applet-config.json` — both are gitignored.
- The first student to sign up gets an unverified account with a limited AI allowance. The admin
  (or a class prefect) verifies students via the Account & Settings panel.

## 9. Verify

```bash
npm test          # 105/105
npm run lint      # tsc --noEmit
curl http://<your-host>:<port>/api/health   # should return { "status": "ok" }
```

## 10. Security

- API keys are server-side only. No `VITE_`-prefixed secrets.
- Session tokens are HttpOnly cookies.
- Firestore rules are default-deny and owner-scoped (`firestore.rules`).
- B2 credentials never reach the browser; uploads go through presigned URLs.
