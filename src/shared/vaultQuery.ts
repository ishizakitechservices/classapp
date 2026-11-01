/**
 * Vault query helpers, shared by the browser and the server.
 *
 * Everything here is pure: no database, no network. That matters because these values
 * end up in SQL. Sort keys and folders are mapped through fixed whitelists — a caller
 * can never introduce a fragment of SQL — and search text is always parameterised, with
 * LIKE wildcards escaped so a student searching for "50%" does not match everything.
 */

export const VAULT_FOLDERS = ['notes', 'worksheets', 'past_papers', 'readings', 'slides', 'other'] as const;
export type VaultFolder = (typeof VAULT_FOLDERS)[number];

/** Anything unknown becomes 'other', never an error: a bad value must not 500 a list. */
export function parseFolder(raw: unknown): VaultFolder {
  const value = String(raw ?? 'other')
    .trim()
    .toLowerCase();
  return (VAULT_FOLDERS as readonly string[]).includes(value) ? (value as VaultFolder) : 'other';
}

export function folderLabel(folder: string): string {
  const map: Record<string, string> = {
    notes: 'Notes',
    worksheets: 'Worksheets',
    past_papers: 'Past Papers',
    readings: 'Readings',
    slides: 'Slides',
    other: 'Other',
  };
  return map[parseFolder(folder)] ?? 'Other';
}

export const VAULT_SORTS = ['newest', 'oldest', 'name', 'size', 'subject'] as const;
export type VaultSort = (typeof VAULT_SORTS)[number];

/**
 * ORDER BY for a vault list. The result is a complete, fixed SQL fragment chosen from a
 * closed set — the caller's string is only ever used to pick one, never to build it.
 */
export function orderByFor(sort: unknown): string {
  switch (String(sort ?? '').trim().toLowerCase()) {
    case 'oldest':
      return 'created_at ASC, id ASC';
    case 'name':
      // Case-insensitive so "algebra" and "Algebra" sort together on a phone.
      return 'LOWER(display_name) ASC, id ASC';
    case 'size':
      return 'size_bytes DESC, id DESC';
    case 'subject':
      return 'subject_code ASC NULLS LAST, LOWER(display_name) ASC';
    case 'newest':
    default:
      return 'created_at DESC, id DESC';
  }
}

export function parseSort(raw: unknown): VaultSort {
  const value = String(raw ?? 'newest')
    .trim()
    .toLowerCase();
  return (VAULT_SORTS as readonly string[]).includes(value) ? (value as VaultSort) : 'newest';
}

/**
 * Turn a search box into a safe LIKE pattern.
 *
 * `%` and `_` are LIKE wildcards, and a backslash is LIKE's escape character. All three
 * are escaped so the text is matched literally: searching "100%" finds files containing
 * "100%", not every file.
 */
export function likePattern(query: unknown): string {
  const text = String(query ?? '').trim().slice(0, 120);
  const escaped = text.replace(/[\\%_]/g, (c) => `\\${c}`);
  return `%${escaped}%`;
}

/** True when a search is worth sending to the server at all. */
export function isSearchable(query: unknown): boolean {
  return String(query ?? '').trim().length > 0;
}

/** Longest allowed file name, matching the upload route. */
export const MAX_FILE_NAME = 200;

/**
 * Validate a rename/edit. Returns the cleaned value or a message the UI can show.
 * An empty name is rejected rather than silently saved, because a nameless file is
 * indistinguishable from every other nameless file.
 */
export type FieldResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function cleanFileName(raw: unknown): FieldResult<string> {
  const value = String(raw ?? '')
    .replace(/[\u0000-\u001f]/g, '')
    .trim();
  if (!value) return { ok: false, error: 'A file name is required.' };
  if (value.length > MAX_FILE_NAME) {
    return { ok: false, error: `File names can be at most ${MAX_FILE_NAME} characters.` };
  }
  if (/[/\\]/.test(value)) return { ok: false, error: 'File names cannot contain slashes.' };
  if (value === '.' || value === '..') return { ok: false, error: 'That file name is not allowed.' };
  return { ok: true, value };
}

/** Subject codes are short labels; an empty value clears the subject. */
export function cleanSubject(raw: unknown): FieldResult<string | null> {
  const value = String(raw ?? '').trim().toUpperCase().slice(0, 40);
  return { ok: true, value: value || null };
}

export function cleanDescription(raw: unknown): FieldResult<string | null> {
  const value = String(raw ?? '').trim().slice(0, 500);
  return { ok: true, value: value || null };
}

/** Notes are the student's own writing: keep newlines, cap the size. */
export const MAX_NOTES_CHARS = 20000;
export function cleanNotes(raw: unknown): FieldResult<string | null> {
  const value = String(raw ?? '').slice(0, MAX_NOTES_CHARS);
  return { ok: true, value: value.trim() ? value : null };
}

/** How long a trashed file can still be restored. */
export const TRASH_RETENTION_DAYS = 30;

export type BulkAction = 'delete' | 'restore' | 'move' | 'star' | 'unstar';
export const BULK_ACTIONS: readonly BulkAction[] = ['delete', 'restore', 'move', 'star', 'unstar'];

export function parseBulkAction(raw: unknown): BulkAction | null {
  const value = String(raw ?? '').trim().toLowerCase();
  return (BULK_ACTIONS as readonly string[]).includes(value) ? (value as BulkAction) : null;
}

/** A bulk request is capped so one tap cannot lock the database for minutes. */
export const MAX_BULK_IDS = 200;

export function cleanIdList(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const ids = raw
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0);
  return [...new Set(ids)].slice(0, MAX_BULK_IDS);
}

export function formatBytes(bytes: number): string {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
