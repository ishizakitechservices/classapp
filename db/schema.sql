-- ClassApp schema (Neon Postgres)
-- Run once against your Neon database: node --import tsx scripts/migrate.ts

CREATE TABLE IF NOT EXISTS users (
  id                SERIAL PRIMARY KEY,
  student_id        TEXT NOT NULL,                 -- normalised lowercase, e.g. 'm162'
  display_name      TEXT NOT NULL,
  class_name        TEXT NOT NULL,                 -- one of the 30 OLAG classes
  password_hash     TEXT NOT NULL,
  role              TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'prefect', 'admin')),
  is_verified       BOOLEAN NOT NULL DEFAULT FALSE,
  verified_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  verified_at       TIMESTAMPTZ,
  prefect_of_class  TEXT,                          -- only set for role='prefect'
  storage_used_bytes BIGINT NOT NULL DEFAULT 0,    -- authoritative quota counter
  google_access_token TEXT,                         -- Google OAuth access token (classroom + drive scopes)
  google_token_expires_at TIMESTAMPTZ,              -- when it expires; null = none stored
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_student_id_unique UNIQUE (student_id),
  CONSTRAINT users_student_id_format CHECK (student_id ~ '^[a-z][0-9]{1,3}$')
);

-- Backfill for existing databases.
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_access_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_token_expires_at TIMESTAMPTZ;

-- Links a student's Classapp subject to one Google Classroom course they chose.
-- One subject → one classroom course; the student picks the match manually
-- (teachers often name their Google Classrooms differently from Classapp).
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

-- Backfill for existing databases.
ALTER TABLE classroom_links ADD COLUMN IF NOT EXISTS classroom_course_name TEXT;
CREATE INDEX IF NOT EXISTS users_class_idx ON users (class_name);
CREATE INDEX IF NOT EXISTS users_role_idx  ON users (role);

-- Subjects a student studies. Core and internal subjects are stored too, so the
-- Classes tab never has to recompute them and older accounts can be topped up.
CREATE TABLE IF NOT EXISTS user_subjects (
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_code  TEXT NOT NULL,                     -- code from src/shared/subjects.ts
  kind          TEXT NOT NULL CHECK (kind IN ('core', 'elective', 'internal')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, subject_code)
);
CREATE INDEX IF NOT EXISTS user_subjects_code_idx ON user_subjects (subject_code);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash    TEXT PRIMARY KEY,                  -- SHA-256 of the cookie value, never the raw token
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);

CREATE TABLE IF NOT EXISTS vault_files (
  id            SERIAL PRIMARY KEY,
  owner_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name  TEXT NOT NULL,
  object_key    TEXT NOT NULL UNIQUE,              -- B2 key; never user-controlled
  mime_type     TEXT NOT NULL,
  size_bytes    BIGINT NOT NULL CHECK (size_bytes > 0),
  subject_code  TEXT,
  description   TEXT,
  folder        TEXT NOT NULL DEFAULT 'other',
  notes         TEXT,                              -- the student's own notes on this file
  starred       BOOLEAN NOT NULL DEFAULT FALSE,    -- revision priority
  deleted_at    TIMESTAMPTZ,                       -- NULL = live; set = in trash
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS vault_files_owner_idx ON vault_files (owner_id);
CREATE INDEX IF NOT EXISTS vault_files_live_idx ON vault_files (owner_id, deleted_at);
CREATE INDEX IF NOT EXISTS vault_files_starred_idx ON vault_files (owner_id, starred);

CREATE TABLE IF NOT EXISTS password_reset_codes (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash   TEXT NOT NULL,                       -- SHA-256; the plaintext code is shown once
  issued_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS prc_user_idx ON password_reset_codes (user_id);

-- Per-user daily AI usage, used to enforce the unverified-account cap.
CREATE TABLE IF NOT EXISTS ai_usage_daily (
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day       DATE NOT NULL DEFAULT CURRENT_DATE,
  requests  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

-- Whole-school daily AI fuse (cost shield), one row per day.
CREATE TABLE IF NOT EXISTS school_usage_daily (
  day       DATE PRIMARY KEY DEFAULT CURRENT_DATE,
  requests  INTEGER NOT NULL DEFAULT 0
);

-- School notices: admin posts school-wide (class_name NULL), prefects post to their class.
CREATE TABLE IF NOT EXISTS notices (
  id            SERIAL PRIMARY KEY,
  author_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  class_name    TEXT,                              -- NULL = school-wide
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  is_pinned     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notices_class_idx ON notices (class_name);

-- Adom AI conversations: saved per signed-in student and kept in the cloud until
-- the student deletes them. Threads and messages mirror what the UI holds, so a
-- reload or a new device never loses a conversation.
CREATE TABLE IF NOT EXISTS chat_threads (
  id          TEXT PRIMARY KEY,                      -- t-<first user message id>
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  title_is_ai BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS chat_threads_user_idx ON chat_threads (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
  id            TEXT PRIMARY KEY,                    -- u-<ts> or a-<ts>
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

-- Shared study library: one AI generation reused by the whole school for free.
-- The key carries the curriculum version, topic, subject, strand, form, clamped size
-- and (only for an explicit "new set") the variant, so a corrected syllabus or a fresh
-- request can never be served from an older entry.
CREATE TABLE IF NOT EXISTS shared_studies (
  key         TEXT PRIMARY KEY,                    -- kind + version + topic + subject + strand + form + count (+ variant)
  kind        TEXT NOT NULL CHECK (kind IN ('quiz', 'flashcards')),
  subject_code TEXT,
  payload     JSONB NOT NULL,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS shared_studies_created_idx ON shared_studies (created_at);
