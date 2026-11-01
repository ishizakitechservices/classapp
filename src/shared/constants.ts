/** Shared server+client constants. Keep free of secrets and browser-only APIs. */

export const OLAG_CLASSES = [
  '1 Science 1', '1 Science 2', '1 Science 3', '1 Science 4',
  '1 Business', '1 Art 1', '1 Art 2', '1 Art 3', '1 Visual Arts', '1 Home Economics',
  '2 Science 1', '2 Science 2', '2 Science 3', '2 Science 4',
  '2 Business', '2 Art 1', '2 Art 2', '2 Art 3', '2 Visual Arts', '2 Home Economics',
  '3 Science 1', '3 Science 2', '3 Science 3', '3 Science 4',
  '3 Business', '3 Art 1', '3 Art 2', '3 Art 3', '3 Visual Arts', '3 Home Economics',
] as const;

export type OlagClass = (typeof OLAG_CLASSES)[number];

/** 200 MB per user, enforced server-side. */
export const STORAGE_QUOTA_BYTES = 200 * 1024 * 1024;

/** Single upload cap — keeps a slow request from holding a connection open. */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** AI requests per day. Verified accounts get the full allowance. */
export const AI_DAILY_LIMIT_VERIFIED = 100;
export const AI_DAILY_LIMIT_UNVERIFIED = 10;

/**
 * Cost shield: verified students and prefects get a tighter, very generous
 * daily allowance than the admin. Admin keeps 100 for diagnostics.
 */
export const AI_DAILY_LIMIT_ADMIN = 100;
export const AI_DAILY_LIMIT_STUDENT_VERIFIED = 20;

/** Whole-school daily fuse — hard ceiling protecting the shared API budget. */
export const SCHOOL_DAILY_AI_FUSE_DEFAULT = 400;

/** Student ID: one letter + 1-3 digits, case-insensitive. */
export const STUDENT_ID_PATTERN = /^[a-z][0-9]{1,3}$/;

export function normaliseStudentId(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidStudentId(raw: string): boolean {
  return STUDENT_ID_PATTERN.test(normaliseStudentId(raw));
}
