import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  VAULT_FOLDERS,
  VAULT_SORTS,
  parseFolder,
  parseSort,
  orderByFor,
  likePattern,
  isSearchable,
  cleanFileName,
  cleanSubject,
  cleanDescription,
  cleanNotes,
  cleanIdList,
  parseBulkAction,
  folderLabel,
  formatBytes,
  MAX_FILE_NAME,
  MAX_BULK_IDS,
  MAX_NOTES_CHARS,
} from '../src/shared/vaultQuery.ts';

// ---------------------------------------------------------------- folders

test('Vault folders: a known folder passes through unchanged', () => {
  for (const folder of VAULT_FOLDERS) {
    assert.equal(parseFolder(folder), folder);
  }
});

test('Vault folders: anything unknown becomes "other", never an error', () => {
  // A bad value must not turn a listing into a 500.
  assert.equal(parseFolder('does-not-exist'), 'other');
  assert.equal(parseFolder(''), 'other');
  assert.equal(parseFolder(null), 'other');
  assert.equal(parseFolder(undefined), 'other');
  assert.equal(parseFolder('NOTES'), 'notes', 'case should not lose the folder');
  assert.equal(parseFolder(' notes '), 'notes');
});

test('Vault folders: SQL fragments cannot be smuggled in as a folder', () => {
  const attack = "notes'; DROP TABLE vault_files; --";
  assert.equal(parseFolder(attack), 'other');
});

test('Vault folders: every folder has a readable label', () => {
  for (const folder of VAULT_FOLDERS) {
    const label = folderLabel(folder);
    assert.ok(label.length > 0, `${folder} needs a label`);
    // A label is never the raw machine value, so the UI never shows "past_papers".
    assert.doesNotMatch(label, /_/, `${folder} label "${label}" should be words, not a slug`);
  }
  assert.equal(folderLabel('past_papers'), 'Past Papers');
  assert.equal(folderLabel('unknown' as any), 'Other');
});

// ---------------------------------------------------------------- sorting

test('Vault sort: unknown sorts fall back to newest', () => {
  assert.equal(parseSort('nonsense'), 'newest');
  assert.equal(parseSort(undefined), 'newest');
  for (const sort of VAULT_SORTS) assert.equal(parseSort(sort), sort);
});

test('Vault sort: ORDER BY is always a fixed fragment from a closed set', () => {
  const fragments = new Set([...VAULT_SORTS.map((s) => orderByFor(s)), orderByFor('bogus'), orderByFor(undefined)]);
  // Five real sorts plus the default share fragments; nothing is ever built from input.
  assert.ok(fragments.size >= 4);

  for (const fragment of fragments) {
    // A semicolon is what ends a statement; parentheses are legitimate here
    // (LOWER(display_name)) and cannot terminate one.
    assert.doesNotMatch(fragment, /;/, 'ORDER BY must never contain a statement separator');
    assert.doesNotMatch(fragment, /--|\/\*/, 'ORDER BY must never contain a comment');
    assert.match(fragment, /^(created_at|LOWER\(display_name\)|size_bytes|subject_code)/);
  }
});

test('Vault sort: an injected sort string is ignored, not interpolated', () => {
  const attack = 'created_at; DROP TABLE vault_files';
  assert.equal(orderByFor(attack), orderByFor('newest'));
  assert.doesNotMatch(orderByFor(attack), /DROP/i);
});

// ---------------------------------------------------------------- search

test('Search: LIKE wildcards are escaped so text is matched literally', () => {
  // "50%" must find files containing "50%", not every file.
  assert.equal(likePattern('50%'), '%50\\%%');
  assert.equal(likePattern('a_b'), '%a\\_b%');
  assert.equal(likePattern('back\\slash'), '%back\\\\slash%');
});

test('Search: ordinary text is wrapped, not altered', () => {
  assert.equal(likePattern('vectors'), '%vectors%');
  assert.equal(likePattern('  Vectors  '), '%Vectors%');
});

test('Search: an over-long query is capped before it reaches the database', () => {
  const pattern = likePattern('x'.repeat(500));
  assert.ok(pattern.length <= 130, `pattern was ${pattern.length} chars`);
});

test('Search: blank queries are not sent at all', () => {
  assert.equal(isSearchable(''), false);
  assert.equal(isSearchable('   '), false);
  assert.equal(isSearchable(null), false);
  assert.equal(isSearchable(undefined), false);
  assert.equal(isSearchable('a'), true);
  assert.equal(likePattern(''), '%%');
});

// ---------------------------------------------------------------- editing

test('Rename: a normal name is accepted and trimmed', () => {
  const result = cleanFileName('  Calculus Notes.md  ');
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.value, 'Calculus Notes.md');
});

test('Rename: an empty name is refused rather than saved', () => {
  const result = cleanFileName('   ');
  assert.equal(result.ok, false);
});

test('Rename: slashes and control characters are refused', () => {
  assert.equal(cleanFileName('../../etc/passwd').ok, false);
  assert.equal(cleanFileName('a/b.pdf').ok, false);
  assert.equal(cleanFileName('.').ok, false);
  assert.equal(cleanFileName('..').ok, false);
});

test('Rename: an over-long name is refused, with a message naming the limit', () => {
  const result = cleanFileName('a'.repeat(MAX_FILE_NAME + 1));
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.error : '', new RegExp(String(MAX_FILE_NAME)));
});

test('Subject: is upper-cased, trimmed, and an empty value clears it', () => {
  assert.deepEqual(cleanSubject(' math '), { ok: true, value: 'MATH' });
  assert.deepEqual(cleanSubject(''), { ok: true, value: null });
  const long = cleanSubject('x'.repeat(200));
  assert.equal(long.ok && long.value?.length, 40);
});

test('Description: is trimmed and capped at 500 characters', () => {
  assert.deepEqual(cleanDescription('  hello  '), { ok: true, value: 'hello' });
  assert.deepEqual(cleanDescription(''), { ok: true, value: null });
  const long = cleanDescription('x'.repeat(900));
  assert.equal(long.ok && long.value?.length, 500);
});

test('Notes: keep their layout, cap their size, and clear when empty', () => {
  const written = 'Line one\n\n- point a\n- point b';
  assert.deepEqual(cleanNotes(written), { ok: true, value: written });
  assert.deepEqual(cleanNotes('   '), { ok: true, value: null });
  const huge = cleanNotes('x'.repeat(MAX_NOTES_CHARS + 5000));
  assert.equal(huge.ok && huge.value?.length, MAX_NOTES_CHARS);
});

// ---------------------------------------------------------------- bulk

test('Bulk: only real positive integer ids survive, de-duplicated', () => {
  assert.deepEqual(cleanIdList([3, 1, 3, '2']), [3, 1, 2]);
  assert.deepEqual(cleanIdList([0, -1, 2.5, 'abc', null]), []);
  assert.deepEqual(cleanIdList('not an array'), []);
});

test('Bulk: a huge selection is capped so one tap cannot lock the database', () => {
  const many = Array.from({ length: 500 }, (_, i) => i + 1);
  assert.equal(cleanIdList(many).length, MAX_BULK_IDS);
});

test('Bulk: unknown actions are rejected', () => {
  assert.equal(parseBulkAction('delete'), 'delete');
  assert.equal(parseBulkAction('RESTORE'), 'restore');
  assert.equal(parseBulkAction('drop table'), null);
  assert.equal(parseBulkAction(undefined), null);
  assert.equal(parseBulkAction(''), null);
});

test('Bytes: sizes read the way a student expects', () => {
  assert.equal(formatBytes(500), '500 B');
  assert.equal(formatBytes(2048), '2 KB');
  assert.equal(formatBytes(5 * 1024 * 1024), '5.0 MB');
  assert.equal(formatBytes(0), '0 B');
});
