/**
 * Vault client API.
 *
 * One place that knows the vault routes and the shape they return, so the screen only
 * deals with typed results. Every failure keeps the server's own message: a student
 * should see "Your vault is full", not "Something went wrong".
 */

import { STORAGE_QUOTA_BYTES } from '../shared/constants';
import { formatBytes, type VaultSort } from '../shared/vaultQuery';

export interface VaultEntry {
  id: number;
  displayName: string;
  mimeType: string;
  sizeBytes: number;
  subjectCode: string | null;
  description: string | null;
  folder: string;
  notes: string | null;
  starred: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface VaultUsage {
  liveBytes: number;
  trashBytes: number;
  usedBytes: number;
  quotaBytes: number;
  liveCount: number;
  trashCount: number;
}

export interface VaultListResult {
  files: VaultEntry[];
  usage: VaultUsage;
  sort: VaultSort;
}

export class VaultError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'VaultError';
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new VaultError(0, 'You appear to be offline. Reconnect and try again.');
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new VaultError(res.status, (body as any)?.error || 'The vault could not complete that request.');
  }
  return body as T;
}

export interface ListOptions {
  q?: string;
  folder?: string | null;
  subject?: string | null;
  starred?: boolean;
  trash?: boolean;
  sort?: VaultSort;
}

export async function listVaultFiles(options: ListOptions = {}): Promise<VaultListResult> {
  const params = new URLSearchParams();
  if (options.q?.trim()) params.set('q', options.q.trim());
  if (options.folder) params.set('folder', options.folder);
  if (options.subject) params.set('subject', options.subject);
  if (options.starred) params.set('starred', '1');
  if (options.trash) params.set('trash', '1');
  if (options.sort) params.set('sort', options.sort);

  const query = params.toString();
  const data = await request<Partial<VaultListResult>>(`/api/vault/files${query ? `?${query}` : ''}`);

  return {
    files: (data.files ?? []).map(normaliseEntry),
    usage: data.usage ?? {
      liveBytes: 0,
      trashBytes: 0,
      usedBytes: 0,
      quotaBytes: STORAGE_QUOTA_BYTES,
      liveCount: 0,
      trashCount: 0,
    },
    sort: (data.sort ?? 'newest') as VaultSort,
  };
}

/** Older responses omit the new fields; fill them so the UI never sees undefined. */
function normaliseEntry(raw: any): VaultEntry {
  return {
    id: Number(raw.id),
    displayName: String(raw.displayName ?? ''),
    mimeType: String(raw.mimeType ?? 'application/octet-stream'),
    sizeBytes: Number(raw.sizeBytes ?? 0),
    subjectCode: raw.subjectCode ?? null,
    description: raw.description ?? null,
    folder: String(raw.folder ?? 'other'),
    notes: raw.notes ?? null,
    starred: Boolean(raw.starred),
    createdAt: String(raw.createdAt ?? ''),
    updatedAt: String(raw.updatedAt ?? raw.createdAt ?? ''),
    deletedAt: raw.deletedAt ?? null,
  };
}

export interface UpdateFields {
  name?: string;
  description?: string | null;
  subject?: string | null;
  folder?: string;
  starred?: boolean;
  notes?: string | null;
}

export async function updateVaultFile(id: number, fields: UpdateFields): Promise<VaultEntry> {
  const data = await request<{ file: any }>(`/api/vault/files/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  return normaliseEntry(data.file);
}

/** Moves a file to the trash. Nothing is removed from storage until the trash is emptied. */
export async function deleteVaultFile(id: number): Promise<void> {
  await request(`/api/vault/files/${id}`, { method: 'DELETE' });
}

export async function restoreVaultFile(id: number): Promise<VaultEntry> {
  const data = await request<{ file: any }>(`/api/vault/files/${id}/restore`, { method: 'POST' });
  return normaliseEntry(data.file);
}

export type BulkAction = 'delete' | 'restore' | 'move' | 'star' | 'unstar';

export async function bulkVaultAction(
  ids: number[],
  action: BulkAction,
  folder?: string
): Promise<{ changed: number; action: BulkAction }> {
  return request(`/api/vault/files/bulk`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, action, folder }),
  });
}

export async function emptyVaultTrash(): Promise<{ removed: number; usage: any }> {
  return request(`/api/vault/files/trash/purge`, { method: 'POST' });
}

export interface UsageBreakdown {
  bySubject: Array<{ subjectCode: string; files: number; bytes: number }>;
  byFolder: Array<{ folder: string; files: number; bytes: number }>;
  quotaBytes: number;
}

export async function fetchVaultUsage(): Promise<UsageBreakdown> {
  return request(`/api/vault/files/usage`);
}

/** Same-origin download link: saves reliably on mobile. */
export function downloadUrl(fileId: number): string {
  return `/api/vault/files/${fileId}/stream?download=1`;
}

/** Stable, cacheable stream the viewer opens. */
export function streamUrl(fileId: number): string {
  return `/api/vault/files/${fileId}/stream`;
}

export { formatBytes };
