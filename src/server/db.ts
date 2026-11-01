/**
 * Neon Postgres access. Server-only: never import this from client code.
 */
import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
import path from 'node:path';

let sqlClient: ReturnType<typeof neon> | null = null;

export function getSql() {
  if (sqlClient) return sqlClient;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not configured on the server.');
  }
  sqlClient = neon(url);
  return sqlClient;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * Apply db/schema.sql. Statements are idempotent (IF NOT EXISTS), so this is safe to rerun.
 *
 * Uses the `pg` TCP driver rather than the HTTP driver, because a schema file is a
 * multi-statement script and the HTTP endpoint only accepts one statement per request.
 */
export async function migrate(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured on the server.');

  const file = path.resolve(process.cwd(), 'db', 'schema.sql');
  const schema = fs.readFileSync(file, 'utf8');

  // Loaded lazily so `pg` is not bundled into any serverless path that only needs the HTTP client.
  const { Client } = await import('pg');
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

  await client.connect();
  try {
    await client.query(schema);
  } finally {
    await client.end();
  }
}
