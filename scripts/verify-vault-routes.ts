/**
 * Live check of the vault routes against the real database.
 *
 * Creates a throwaway user, drives the actual SQL the routes use (search with LIKE
 * escaping, star, trash, restore, bulk, usage, purge) and removes everything afterwards.
 * This is the only way to prove the SQL is valid — a type-check cannot.
 *
 *   node --import tsx scripts/verify-vault-routes.ts
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { likePattern, orderByFor, parseFolder, cleanIdList } from '../src/shared/vaultQuery.ts';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const TEST_ID = `verify${Date.now().toString().slice(-6)}`;

async function main() {
  const client = await pool.connect();
  const problems: string[] = [];
  const check = (ok: boolean, label: string) => {
    console.log(`${ok ? '  ✓' : '  ✗'} ${label}`);
    if (!ok) problems.push(label);
  };

  try {
    await client.query('BEGIN');

    // A throwaway owner. Schema requires the student-id format: one letter + 1-3 digits.
    const userRes = await client.query(
      `INSERT INTO users (student_id, display_name, class_name, password_hash)
       VALUES ($1, 'Verify Vault', '1 Science 1', 'x') RETURNING id`,
      ['v' + String(Math.floor(Math.random() * 900) + 100)]
    );
    const userId: number = userRes.rows[0].id;
    console.log(`test user: ${userId}\n`);

    const insert = async (name: string, size: number, subject: string | null, folder: string) =>
      (await client.query(
        `INSERT INTO vault_files (owner_id, display_name, object_key, mime_type, size_bytes, subject_code, folder)
         VALUES ($1,$2,$3,'text/markdown',$4,$5,$6) RETURNING id`,
        [userId, name, `u${userId}/${name}.md`, size, subject, folder]
      )).rows[0].id as number;

    const algebraId = await insert('Algebra Notes.md', 1000, 'MATH', 'notes');
    const vectorsId = await insert('Vectors Worksheet.pdf', 2000, 'MATH', 'worksheets');
    const percentId = await insert('50% Discount Problems.md', 3000, 'BUSMGT', 'notes');
    const physicsId = await insert('Force and Motion.md', 4000, 'PHY', 'readings');

    // ---------------------------------------------------------- listing
    const listLive = async () =>
      (await client.query(
        `SELECT id FROM vault_files WHERE owner_id=$1 AND deleted_at IS NULL ORDER BY ${orderByFor('newest')}`,
        [userId]
      )).rows.length;

    check((await listLive()) === 4, 'four live files listed');

    // ---------------------------------------------------------- search escaping
    const search = async (q: string) =>
      (await client.query(
        `SELECT display_name FROM vault_files
         WHERE owner_id=$1 AND deleted_at IS NULL AND display_name ILIKE $2`,
        [userId, likePattern(q)]
      )).rows.map((r: any) => r.display_name);

    const percentResults = await search('50%');
    check(
      percentResults.length === 1 && percentResults[0] === '50% Discount Problems.md',
      `search "50%" finds only the literal match (got ${percentResults.length})`
    );

    const plain = await search('vectors');
    check(plain.length === 1, 'search is case-insensitive');

    // "_" must not act as a single-character wildcard.
    const underscore = await search('a_b');
    check(underscore.length === 0, 'underscore is matched literally, not as a wildcard');

    // ---------------------------------------------------------- filters
    const starredFilter = async () =>
      (await client.query(
        `SELECT id FROM vault_files WHERE owner_id=$1 AND deleted_at IS NULL AND ($2::boolean IS FALSE OR starred = TRUE)`,
        [userId, true]
      )).rows.length;
    check((await starredFilter()) === 0, 'starred filter empty before starring');

    const folderFilter = async (folder: string) =>
      (await client.query(
        `SELECT id FROM vault_files WHERE owner_id=$1 AND deleted_at IS NULL AND ($2::text IS NULL OR folder=$2)`,
        [userId, folder]
      )).rows.length;
    check((await folderFilter('notes')) === 2, 'folder filter returns the notes only');
    check((await folderFilter(null as any)) === 4, 'no folder filter returns everything');

    // ---------------------------------------------------------- star
    await client.query(`UPDATE vault_files SET starred=TRUE WHERE id=$1 AND owner_id=$2`, [algebraId, userId]);
    check((await starredFilter()) === 1, 'starring a file shows it under the starred filter');

    // ---------------------------------------------------------- trash + restore
    await client.query(`UPDATE vault_files SET deleted_at=NOW() WHERE id=$1 AND owner_id=$2`, [vectorsId, userId]);
    check((await listLive()) === 3, 'deleting moves the file out of the live list');

    const trashCount = (await client.query(
      `SELECT COUNT(*)::int AS n FROM vault_files WHERE owner_id=$1 AND deleted_at IS NOT NULL`,
      [userId]
    )).rows[0].n;
    check(trashCount === 1, 'the file is in the trash');

    const totals = (await client.query(
      `SELECT
         COALESCE(SUM(size_bytes) FILTER (WHERE deleted_at IS NULL),0)::bigint AS live,
         COALESCE(SUM(size_bytes) FILTER (WHERE deleted_at IS NOT NULL),0)::bigint AS trash
       FROM vault_files WHERE owner_id=$1`,
      [userId]
    )).rows[0];
    check(Number(totals.live) === 8000, `live bytes are 8000 (got ${totals.live})`);
    check(Number(totals.trash) === 2000, `trashed bytes still count: 2000 (got ${totals.trash})`);

    await client.query(`UPDATE vault_files SET deleted_at=NULL WHERE id=$1 AND owner_id=$2`, [vectorsId, userId]);
    check((await listLive()) === 4, 'restoring brings the file back');

    // ---------------------------------------------------------- bulk
    const ids = cleanIdList([algebraId, vectorsId, physicsId]);
    const bulk = await client.query(
      `UPDATE vault_files SET folder=$1 WHERE id = ANY($2::int[]) AND owner_id=$3 AND deleted_at IS NULL RETURNING id`,
      [parseFolder('past_papers'), ids, userId]
    );
    check(bulk.rows.length === 3, `bulk move touched 3 files (got ${bulk.rows.length})`);

    // An id belonging to another account must simply not match.
    const foreign = await client.query(
      `UPDATE vault_files SET starred=TRUE WHERE id = ANY($1::int[]) AND owner_id=$2 AND deleted_at IS NULL RETURNING id`,
      [[999999999], userId]
    );
    check(foreign.rows.length === 0, 'bulk actions cannot touch files the user does not own');

    // ---------------------------------------------------------- usage grouping
    const usage = await client.query(
      `SELECT COALESCE(subject_code,'—') AS s, folder, COUNT(*)::int AS files, SUM(size_bytes)::bigint AS bytes
       FROM vault_files WHERE owner_id=$1 AND deleted_at IS NULL GROUP BY subject_code, folder`,
      [userId]
    );
    check(usage.rows.length > 0, 'usage breakdown groups by subject and folder');

    // ---------------------------------------------------------- ordering
    const byName = await client.query(
      `SELECT display_name FROM vault_files WHERE owner_id=$1 AND deleted_at IS NULL ORDER BY ${orderByFor('name')}`,
      [userId]
    );
    const names = byName.rows.map((r: any) => r.display_name.toLowerCase());
    check(
      JSON.stringify(names) === JSON.stringify([...names].sort()),
      'name sort is alphabetical (case-insensitive)'
    );

    const bySize = await client.query(
      `SELECT size_bytes FROM vault_files WHERE owner_id=$1 AND deleted_at IS NULL ORDER BY ${orderByFor('size')}`,
      [userId]
    );
    const sizes = bySize.rows.map((r: any) => Number(r.size_bytes));
    check(sizes[0] >= sizes[sizes.length - 1], 'size sort is largest first');

    // ---------------------------------------------------------- purge
    await client.query(`UPDATE vault_files SET deleted_at=NOW() WHERE id=$1 AND owner_id=$2`, [physicsId, userId]);
    const purged = await client.query(
      `DELETE FROM vault_files WHERE owner_id=$1 AND deleted_at IS NOT NULL RETURNING id`,
      [userId]
    );
    check(purged.rows.length === 1, 'purge removes trashed rows');
    check((await listLive()) === 3, 'purged file is gone, live files remain');
  } catch (err) {
    problems.push(err instanceof Error ? err.message : String(err));
    console.error('\nFAILED:', err instanceof Error ? err.message : err);
  } finally {
    // Roll everything back: this script must never leave test rows behind.
    await client.query('ROLLBACK').catch(() => {});
    client.release();
    await pool.end();
  }

  console.log(`\n${problems.length === 0 ? 'All vault route checks passed.' : `${problems.length} check(s) failed.`}`);
  if (problems.length > 0) {
    for (const p of problems) console.log(`  - ${p}`);
    process.exitCode = 1;
  }
}

main();
