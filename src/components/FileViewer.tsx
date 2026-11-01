/**
 * Full-screen file viewer — the app's equivalent of Preview or the Acrobat
 * viewer. One shell (title bar, secure file badge, theme, download) with a
 * purpose-built surface per file type:
 *
 *   PDF   → continuous pages, lazy rendering, selectable text, thumbnails
 *   Word  → paper sheet with Word-like typography
 *   Excel → grid with frozen headers, formula bar and sheet tabs
 *   PPT   → 16:9 slide stage with a thumbnail grid
 *   Image → fit / 1:1 zoom, pan, rotate
 *   Media → native player on a black stage
 *   Note  → reading column with theme and text size
 *
 * Heavy formats are lazy-loaded, so opening a photo never downloads pdf.js.
 */
import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, Download, ExternalLink, Moon, Sun } from 'lucide-react';
import {
  KIND_META,
  OFFICE_META,
  ViewerSpinner,
  type ReadingTheme,
} from './viewer/viewerUi';
import { fileExtension, formatBytes, kindForFile, officeFormatFor, type ViewableKind } from './viewer/fileKind';
import { ImageView, TextView, MediaView } from './viewer';

export { kindForFile, formatBytes };
export type { ViewableKind };

const PdfView = lazy(() => import('./viewer/PdfView'));
const DocxView = lazy(() => import('./viewer/DocxView'));
const SpreadsheetView = lazy(() => import('./viewer/SpreadsheetView'));
const SlidesView = lazy(() => import('./viewer/SlidesView'));

const streamUrl = (id: string) => `/api/vault/files/${id}/stream`;
const downloadUrl = (id: string) => `/api/vault/files/${id}/stream?download=1`;

const THEME_KEY = 'classapp:viewer-theme';

function readStoredTheme(): ReadingTheme {
  try {
    const value = localStorage.getItem(THEME_KEY);
    if (value === 'light' || value === 'sepia' || value === 'night') return value;
  } catch {
    /* private mode */
  }
  return 'light';
}

const THEME_LABEL: Record<ReadingTheme, string> = {
  light: 'Light page',
  sepia: 'Sepia page',
  night: 'Night page',
};

interface Props {
  fileId: string;
  displayName: string;
  mimeType: string;
  subjectCode?: string | null;
  sizeBytes?: number;
  /** The student's saved notes for this file, so the drawer opens already filled. */
  notes?: string | null;
  onClose: () => void;
}

export const FileViewer: React.FC<Props> = ({
  fileId,
  displayName,
  mimeType,
  subjectCode,
  sizeBytes,
  notes,
  onClose,
}) => {
  const kind = kindForFile(displayName, mimeType);
  const officeFormat = kind === 'office' ? officeFormatFor(displayName, mimeType) : null;
  const meta = officeFormat ? OFFICE_META[officeFormat] : KIND_META[kind];
  const Icon = meta.icon;

  const [theme, setTheme] = useState<ReadingTheme>(readStoredTheme);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const themeable = kind === 'text' || kind === 'office';

  // Escape closes; the page behind never scrolls.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    // Move focus into the dialog without drawing a focus ring on the toolbar.
    dialogRef.current?.focus({ preventScroll: true });

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* private mode */
    }
  }, [theme]);

  const cycleTheme = () => setTheme((value) => (value === 'light' ? 'sepia' : value === 'sepia' ? 'night' : 'light'));

  const extension = fileExtension(displayName);
  const sizeLabel = formatBytes(sizeBytes);
  const metaLine = [extension || meta.label, sizeLabel].filter(Boolean).join(' · ');

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="viewer-enter fixed inset-0 z-[60] flex flex-col bg-neutral-100 outline-none dark:bg-[#0b0b0e]"
      role="dialog"
      aria-modal="true"
      aria-label={`${displayName} preview`}
    >
      {/* ---------------- Title bar ---------------- */}
      <header className="glass-nav shrink-0 border-b border-neutral-500/15 pt-safe dark:border-white/10">
        <div className="flex items-center gap-2 px-2 py-2 sm:px-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close viewer"
            title="Close viewer (Esc)"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-neutral-600 transition-colors hover:bg-neutral-900/[0.06] hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </button>

          <div
            className={`hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:flex ${meta.tile} ${meta.glyph}`}
            aria-hidden
          >
            <Icon className="h-4.5 w-4.5" />
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[13px] font-semibold leading-tight text-neutral-900 dark:text-white">
              {displayName}
            </h2>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-[10.5px] text-neutral-500 dark:text-neutral-400">
              <span className="truncate">{metaLine || meta.label}</span>
              {subjectCode && (
                <>
                  <span aria-hidden className="h-1 w-1 shrink-0 rounded-full bg-neutral-400/70" />
                  <span className="shrink-0 font-mono uppercase tracking-wide">{subjectCode}</span>
                </>
              )}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {themeable && (
              <button
                type="button"
                onClick={cycleTheme}
                title={`${THEME_LABEL[theme]} — switch page colour`}
                aria-label={`Page colour: ${THEME_LABEL[theme]}`}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-neutral-600 transition-colors hover:bg-neutral-900/[0.06] hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-white"
              >
                {theme === 'light' ? (
                  <Sun className="h-4 w-4" />
                ) : theme === 'sepia' ? (
                  <BookOpen className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </button>
            )}

            {(kind === 'pdf' || kind === 'image') && (
              <a
                href={streamUrl(fileId)}
                target="_blank"
                rel="noreferrer"
                title="Open in a new tab"
                aria-label="Open in a new tab"
                className="hidden h-9 w-9 items-center justify-center rounded-xl text-neutral-600 transition-colors hover:bg-neutral-900/[0.06] hover:text-neutral-900 sm:inline-flex dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-white"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}

            <a
              href={downloadUrl(fileId)}
              download={displayName}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-neutral-900 px-2.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-neutral-900 sm:px-3.5"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Download</span>
            </a>
          </div>
        </div>
      </header>

      {/* ---------------- Document surface ---------------- */}
      <div className="relative min-h-0 flex-1">
        {kind === 'pdf' && (
          <Suspense fallback={<ViewerSpinner label="Preparing the page…" />}>
            <PdfView fileId={fileId} displayName={displayName} />
          </Suspense>
        )}

        {kind === 'office' && officeFormat === 'docx' && (
          <Suspense fallback={<ViewerSpinner label="Opening document…" />}>
            <DocxView fileId={fileId} displayName={displayName} theme={theme} />
          </Suspense>
        )}

        {kind === 'office' && officeFormat === 'xlsx' && (
          <Suspense fallback={<ViewerSpinner label="Reading workbook…" />}>
            <SpreadsheetView fileId={fileId} displayName={displayName} />
          </Suspense>
        )}

        {kind === 'office' && officeFormat === 'pptx' && (
          <Suspense fallback={<ViewerSpinner label="Opening presentation…" />}>
            <SlidesView fileId={fileId} displayName={displayName} />
          </Suspense>
        )}

        {kind === 'text' && <TextView fileId={fileId} displayName={displayName} theme={theme} initialNotes={notes} />}

        {kind === 'image' && <ImageView fileId={fileId} displayName={displayName} />}

        {(kind === 'video' || kind === 'audio') && (
          <MediaView fileId={fileId} displayName={displayName} kind={kind} sizeBytes={sizeBytes} />
        )}

        {kind === 'download-only' && (
          <div className="flex h-full items-center justify-center p-5">
            <div className="glass w-full max-w-sm rounded-2xl p-6 text-center">
              <div className={`mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl ${meta.tile} ${meta.glyph}`}>
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">No preview for this format</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
                {extension ? `${extension} files` : 'This file type'} open outside the app. Download it and it will open in the
                right application on your device.
              </p>
              <a
                href={downloadUrl(fileId)}
                download={displayName}
                className="mt-4 inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-neutral-900 px-4 text-xs font-semibold text-white dark:bg-white dark:text-neutral-900"
              >
                <Download className="h-3.5 w-3.5" />
                Download file
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
