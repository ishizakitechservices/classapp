/** One-off check: how many AI requests m162 has used today. Read-only. */
import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const r = await pool.query(
  `SELECT requests FROM ai_usage_daily
   WHERE user_id = (SELECT id FROM users WHERE student_id = 'm162') AND day = CURRENT_DATE`
);
console.log('used_today=' + ((r.rows[0] && r.rows[0].requests) || 0));
await pool.end();
