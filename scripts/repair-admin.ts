/** One-off repair: ensure the admin account is verified. Safe to run repeatedly. */
import dotenv from 'dotenv';
import { getSql } from '../src/server/db.ts';

dotenv.config();

const sql = getSql();
const rows = (await sql`
  UPDATE users SET is_verified = TRUE, verified_at = COALESCE(verified_at, NOW())
  WHERE student_id = 'm162' AND role = 'admin'
  RETURNING student_id, is_verified
`) as any[];
console.log('admin rows updated:', rows.length);
for (const r of rows) console.log(`  ${r.student_id} verified=${r.is_verified}`);
