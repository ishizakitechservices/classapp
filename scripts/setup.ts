/**
 * One-time setup: apply the schema and create the admin account.
 *
 * Usage:
 *   node --import tsx scripts/setup.ts <ADMIN_PASSWORD>
 *
 * The password is taken from the command line, hashed immediately, and never
 * written to disk or to source. Re-running is safe: an existing admin is left alone.
 */
import dotenv from 'dotenv';
import { migrate, getSql } from '../src/server/db.ts';
import { hashPassword } from '../src/server/auth.ts';
import { normaliseStudentId, isValidStudentId, OLAG_CLASSES } from '../src/shared/constants.ts';

dotenv.config();

const ADMIN_STUDENT_ID = 'm162';
const ADMIN_NAME = 'Johnson Bediako Ametsitsi';
const ADMIN_CLASS = '2 Science 1';

async function main() {
  const password = process.argv[2];
  if (!password || password.length < 8) {
    console.error('Usage: node --import tsx scripts/setup.ts <ADMIN_PASSWORD>');
    console.error('The password must be at least 8 characters and is not stored in any file.');
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Add it to .env first.');
    process.exit(1);
  }
  if (!isValidStudentId(ADMIN_STUDENT_ID) || !(OLAG_CLASSES as readonly string[]).includes(ADMIN_CLASS)) {
    console.error('Admin ID or class is invalid.');
    process.exit(1);
  }

  console.log('Applying schema…');
  await migrate();

  const sql = getSql();
  const id = normaliseStudentId(ADMIN_STUDENT_ID);
  const existing = (await sql`SELECT id FROM users WHERE student_id = ${id} LIMIT 1`) as any[];

  if (existing.length > 0) {
    // Promote rather than overwrite, so rerunning never resets a changed password.
    await sql`
      UPDATE users
      SET role = 'admin', is_verified = TRUE, prefect_of_class = NULL
      WHERE student_id = ${id}
    `;
    console.log(`Admin ${id} already existed; role ensured. Password unchanged.`);
    return;
  }

  const hash = await hashPassword(password);
  await sql`
    INSERT INTO users (student_id, display_name, class_name, password_hash, role, is_verified, verified_at)
    VALUES (${id}, ${ADMIN_NAME}, ${ADMIN_CLASS}, ${hash}, 'admin', TRUE, NOW())
  `;
  console.log(`Admin created: ${id} (${ADMIN_NAME}, ${ADMIN_CLASS}).`);
}

main().catch((err) => {
  console.error('Setup failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
