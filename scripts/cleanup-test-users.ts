/** Remove the throwaway accounts created during testing. Safe to run repeatedly. */
import dotenv from 'dotenv';
import { getSql } from '../src/server/db.ts';

dotenv.config();

const sql = getSql();
const removed = await sql`
  DELETE FROM users WHERE student_id IN ('n64', 'a7', 'z8', 'z9') AND role <> 'admin'
  RETURNING student_id
`;
console.log('test accounts removed:', (removed as any[]).length);
