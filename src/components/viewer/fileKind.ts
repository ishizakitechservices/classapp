/**
 * File-type detection shared by the vault screen and every viewer surface.
 * Kept in its own module so the viewer shell and the small views never need
 * to import each other just to agree on what kind of file this is.
 */

export type ViewableKind = 'text' | 'image' | 'pdf' | 'video' | 'audio' | 'office' | 'download-only';

export type OfficeFormat = 'docx' | 'xlsx' | 'pptx';

export function kindForFile(name: string, mime: string): ViewableKind {
  const lower = (name || '').toLowerCase();
  const m = (mime || '').toLowerCase();

  if (m.startsWith('text/') || /\.(md|txt|markdown)$/.test(lower)) return 'text';
  if (m.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|svg)$/.test(lower)) return 'image';
  if (m === 'application/pdf' || lower.endsWith('.pdf')) return 'pdf';
  if (m.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/.test(lower)) return 'video';
  if (m.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|aac)$/.test(lower)) return 'audio';
  if (/\.(docx|docm|xlsx|xls|xlsm|pptx|pptm)$/.test(lower)) return 'office';
  return 'download-only';
}

/** Which Office reader to use. The extension wins because browsers report poor MIME types for Office files. */
export function officeFormatFor(name: string, mime: string): OfficeFormat {
  const lower = (name || '').toLowerCase();
  const m = (mime || '').toLowerCase();
  if (/\.(xlsx|xlsm|xls)$/.test(lower) || m.includes('spreadsheet')) return 'xlsx';
  if (/\.(pptx|pptm)$/.test(lower) || m.includes('presentation')) return 'pptx';
  return 'docx';
}

export function fileExtension(name: string): string {
  const match = /\.([a-z0-9]{1,6})$/i.exec(name || '');
  return match ? match[1].toUpperCase() : '';
}

export function formatBytes(bytes?: number | null): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
