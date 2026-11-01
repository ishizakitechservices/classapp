/**
 * Shared chrome for the file viewer: toolbar primitives, file-type glyphs,
 * reading palettes and the loading / error states every surface uses.
 * Keeping these here is what makes PDF, Word, Sheet, Slides, image and media
 * previews feel like one application instead of seven different screens.
 */
import React from 'react';
import {
  AlertTriangle,
  Download,
  FileQuestion,
  FileSpreadsheet,
  FileText,
  FileType2,
  Film,
  Image as ImageIcon,
  Loader2,
  Music,
  Presentation,
  type LucideIcon,
} from 'lucide-react';
import type { ViewableKind } from './fileKind';

/** Every document surface receives the same two identifiers. */
export interface ViewerFileProps {
  fileId: string;
  displayName: string;
}

export type ReadingTheme = 'light' | 'sepia' | 'night';

export interface ReadingPalette {
  page: string;
  text: string;
  heading: string;
  muted: string;
  border: string;
  surface: string;
}

/** Page colours, modelled on the reading themes office suites and e-readers offer. */
export const READING_PALETTES: Record<ReadingTheme, ReadingPalette> = {
  light: {
    page: '#ffffff',
    text: '#27272a',
    heading: '#111113',
    muted: '#71717a',
    border: '#e4e4e7',
    surface: '#f4f4f5',
  },
  sepia: {
    page: '#f7eedb',
    text: '#3b2f21',
    heading: '#2a2117',
    muted: '#8b7a5e',
    border: '#e0d1b4',
    surface: '#efe4cd',
  },
  night: {
    page: '#1b1b1f',
    text: '#e4e4e7',
    heading: '#fafafa',
    muted: '#a1a1aa',
    border: '#33333a',
    surface: '#242429',
  },
};

interface KindMeta {
  icon: LucideIcon;
  label: string;
  tile: string;
  glyph: string;
}

export const KIND_META: Record<ViewableKind, KindMeta> = {
  pdf: {
    icon: FileText,
    label: 'PDF document',
    tile: 'bg-rose-500/12',
    glyph: 'text-rose-500 dark:text-rose-400',
  },
  text: {
    icon: FileType2,
    label: 'Note',
    tile: 'bg-indigo-500/12',
    glyph: 'text-indigo-500 dark:text-indigo-400',
  },
  image: {
    icon: ImageIcon,
    label: 'Image',
    tile: 'bg-violet-500/12',
    glyph: 'text-violet-500 dark:text-violet-400',
  },
  video: {
    icon: Film,
    label: 'Video',
    tile: 'bg-fuchsia-500/12',
    glyph: 'text-fuchsia-500 dark:text-fuchsia-400',
  },
  audio: {
    icon: Music,
    label: 'Audio',
    tile: 'bg-amber-500/12',
    glyph: 'text-amber-500 dark:text-amber-400',
  },
  office: {
    icon: FileText,
    label: 'Document',
    tile: 'bg-sky-500/12',
    glyph: 'text-sky-500 dark:text-sky-400',
  },
  'download-only': {
    icon: FileQuestion,
    label: 'File',
    tile: 'bg-neutral-500/12',
    glyph: 'text-neutral-500 dark:text-neutral-400',
  },
};

/** Office tiles get their own colour so Word, Excel and PowerPoint are distinguishable. */
export const OFFICE_META: Record<'docx' | 'xlsx' | 'pptx', KindMeta> = {
  docx: { icon: FileText, label: 'Word document', tile: 'bg-sky-500/12', glyph: 'text-sky-500 dark:text-sky-400' },
  xlsx: {
    icon: FileSpreadsheet,
    label: 'Spreadsheet',
    tile: 'bg-emerald-500/12',
    glyph: 'text-emerald-600 dark:text-emerald-400',
  },
  pptx: {
    icon: Presentation,
    label: 'Presentation',
    tile: 'bg-orange-500/12',
    glyph: 'text-orange-500 dark:text-orange-400',
  },
};

const TOOL_BASE =
  'inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-lg px-2 text-[12px] font-medium ' +
  'text-neutral-600 transition-colors dark:text-neutral-300 ' +
  'hover:bg-neutral-900/[0.06] hover:text-neutral-900 dark:hover:bg-white/10 dark:hover:text-white ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 ' +
  'disabled:pointer-events-none disabled:opacity-35';

const TOOL_ACTIVE = 'bg-neutral-900/[0.08] text-neutral-900 dark:bg-white/15 dark:text-white';

interface ToolButtonProps {
  label: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}

export const ToolButton: React.FC<ToolButtonProps> = ({ label, onClick, active, disabled, className = '', children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={label}
    aria-label={label}
    aria-pressed={active === undefined ? undefined : active}
    className={`${TOOL_BASE} ${active ? TOOL_ACTIVE : ''} ${className}`}
  >
    {children}
  </button>
);

/** Grouped controls, the way office suites cluster related tools. */
export const ToolGroup: React.FC<{ children: React.ReactNode; label?: string }> = ({ children, label }) => (
  <div
    role="group"
    aria-label={label}
    className="inline-flex items-center gap-0.5 rounded-xl bg-neutral-900/[0.04] p-0.5 dark:bg-white/[0.06]"
  >
    {children}
  </div>
);

export const ToolDivider: React.FC = () => (
  <span aria-hidden className="mx-0.5 hidden h-5 w-px shrink-0 bg-neutral-500/20 sm:block dark:bg-white/15" />
);

/** One contextual toolbar row. Scrolls sideways on phones instead of wrapping into a wall of icons. */
export const ViewerToolbar: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <div
    className={`shrink-0 border-b border-neutral-500/15 bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-neutral-950/80 ${className}`}
  >
    <div className="no-scrollbar flex items-center gap-1 overflow-x-auto px-2 py-1.5">{children}</div>
  </div>
);

/** Compact numeric readout used for zoom, page and slide counters. */
export const ToolReadout: React.FC<{ value: string; title?: string }> = ({ value, title }) => (
  <span
    title={title}
    className="min-w-[52px] shrink-0 px-1 text-center font-mono text-[11px] tabular-nums text-neutral-600 dark:text-neutral-300"
  >
    {value}
  </span>
);

export const ViewerSpinner: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 text-neutral-500 dark:text-neutral-400">
    <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
    <p className="text-xs font-medium">{label}</p>
  </div>
);

interface ErrorProps {
  title: string;
  message: string;
  downloadHref: string;
  downloadName: string;
  hint?: string;
}

export const ViewerError: React.FC<ErrorProps> = ({ title, message, downloadHref, downloadName, hint }) => (
  <div className="flex h-full min-h-[280px] items-center justify-center p-5">
    <div className="glass w-full max-w-sm rounded-2xl p-6 text-center">
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/12 text-amber-500">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">{title}</h3>
      <p className="mt-1.5 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">{message}</p>
      <a
        href={downloadHref}
        download={downloadName}
        className="mt-4 inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-neutral-900 px-4 text-xs font-semibold text-white dark:bg-white dark:text-neutral-900"
      >
        <Download className="h-3.5 w-3.5" />
        Download file
      </a>
      {hint && <p className="mt-3 text-[11px] text-neutral-500 dark:text-neutral-500">{hint}</p>}
    </div>
  </div>
);
