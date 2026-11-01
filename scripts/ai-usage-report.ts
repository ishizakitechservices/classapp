/** Read-only diagnostic: today's AI usage for the admin + school fuse row. */
import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const people = await pool.query(
  `SELECT u.student_id, a.requests FROM ai_usage_daily a JOIN users u ON u.id = a.user_id
   WHERE a.day = CURRENT_DATE ORDER BY a.requests DESC`
);
const fuse = await pool.query(`SELECT requests FROM school_usage_daily WHERE day = CURRENT_DATE`);
const shared = await pool.query(`SELECT kind, count(*) AS n FROM shared_studies GROUP BY kind`);
const rows = await pool.query(`SELECT count(*)::int AS n FROM vault_files`);
const notices = await pool.query(`SELECT count(*)::int AS n FROM notices`);
console.log('people=' + JSON.stringify(people.rows));
console.log('fuse=' + JSON.stringify(fuse.rows));
console.log('shared=' + JSON.stringify(shared.rows));
console.log('vault_rows=' + rows.rows[0].n + ' notices=' + notices.rows[0].n);
await pool.end();
