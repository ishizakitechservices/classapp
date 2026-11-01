/**
 * Idempotent schema migration. Safe to run any time:
 *   node --import tsx scripts/migrate.ts
 */
import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

async function main() {
  await pool.query(`
    ALTER TABLE vault_files ADD COLUMN IF NOT EXISTS description TEXT;
    ALTER TABLE vault_files ADD COLUMN IF NOT EXISTS folder TEXT NOT NULL DEFAULT 'other';
    ALTER TABLE vault_files ADD COLUMN IF NOT EXISTS notes TEXT;
    ALTER TABLE vault_files ADD COLUMN IF NOT EXISTS starred BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE vault_files ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    ALTER TABLE vault_files ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    CREATE INDEX IF NOT EXISTS vault_files_live_idx ON vault_files (owner_id, deleted_at);
    CREATE INDEX IF NOT EXISTS vault_files_starred_idx ON vault_files (owner_id, starred);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS electives TEXT[] NOT NULL DEFAULT '{}';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS google_access_token TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS google_token_expires_at TIMESTAMPTZ;
    CREATE TABLE IF NOT EXISTS classroom_links (
      id                  SERIAL PRIMARY KEY,
      user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject_code        TEXT NOT NULL,
      classroom_course_id TEXT NOT NULL,
      classroom_course_name TEXT,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, subject_code)
    );
    CREATE INDEX IF NOT EXISTS classroom_links_user_idx ON classroom_links (user_id);
    CREATE INDEX IF NOT EXISTS classroom_links_course_idx ON classroom_links (classroom_course_id);
    ALTER TABLE classroom_links ADD COLUMN IF NOT EXISTS classroom_course_name TEXT;
    CREATE TABLE IF NOT EXISTS school_usage_daily (
      day       DATE PRIMARY KEY DEFAULT CURRENT_DATE,
      requests  INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS notices (
      id            SERIAL PRIMARY KEY,
      author_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      class_name    TEXT,
      title         TEXT NOT NULL,
      body          TEXT NOT NULL,
      is_pinned     BOOLEAN NOT NULL DEFAULT FALSE,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS notices_class_idx ON notices (class_name);
    CREATE TABLE IF NOT EXISTS shared_studies (
      key         TEXT PRIMARY KEY,
      kind        TEXT NOT NULL CHECK (kind IN ('quiz', 'flashcards')),
      subject_code TEXT,
      payload     JSONB NOT NULL,
      created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS shared_studies_created_idx ON shared_studies (created_at);
    CREATE TABLE IF NOT EXISTS chat_threads (
      id          TEXT PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title       TEXT NOT NULL,
      title_is_ai BOOLEAN NOT NULL DEFAULT FALSE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS chat_threads_user_idx ON chat_threads (user_id, updated_at DESC);
    CREATE TABLE IF NOT EXISTS chat_messages (
      id            TEXT PRIMARY KEY,
      thread_id     TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
      user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sender        TEXT NOT NULL CHECK (sender IN ('user', 'assistant')),
      content       TEXT NOT NULL,
      timestamp     TEXT NOT NULL,
      mode          TEXT,
      engine        TEXT,
      streaming     BOOLEAN NOT NULL DEFAULT FALSE,
      error         TEXT,
      interactive_data JSONB,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS chat_messages_thread_idx ON chat_messages (thread_id, created_at);
    CREATE TABLE IF NOT EXISTS user_subjects (
      user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject_code  TEXT NOT NULL,
      kind          TEXT NOT NULL CHECK (kind IN ('core', 'elective', 'internal')),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, subject_code)
    );
    CREATE INDEX IF NOT EXISTS user_subjects_code_idx ON user_subjects (subject_code);
  `);
  console.log('Migration complete.');
}

main()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
