/**
 * Word document viewer.
 *
 * A DOCX is converted to semantic HTML on the device and laid out on a paper
 * sheet with Word-like typography and margins, so it reads like the original
 * rather than a wall of unformatted text.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ALargeSmall, Minus, Plus } from 'lucide-react';
import { OfficeContent } from '../OfficeContent';
import { extractOfficeDoc } from '../../services/officeReader';
import {
  READING_PALETTES,
  ToolButton,
  ToolDivider,
  ToolGroup,
  ViewerError,
  ViewerSpinner,
  ViewerToolbar,
  type ReadingTheme,
  type ViewerFileProps,
} from './viewerUi';

const downloadUrl = (id: string) => `/api/vault/files/${id}/stream?download=1`;
const streamUrl = (id: string) => `/api/vault/files/${id}/stream`;

interface Props extends ViewerFileProps {
  theme: ReadingTheme;
}

const DocxView: React.FC<Props> = ({ fileId, displayName, theme }) => {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState(15.5);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    setError(null);

    (async () => {
      try {
        const response = await fetch(streamUrl(fileId));
        if (!response.ok) throw new Error('Could not open this document.');
        const blob = await response.blob();
        const doc = await extractOfficeDoc(blob, displayName);
        if (!cancelled) setHtml(doc.html);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error && err.message === 'Unsupported document type.'
              ? 'This document type cannot be previewed.'
              : 'This document could not be read.'
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fileId, displayName]);

  const words = useMemo(() => {
    if (!html) return 0;
    const text = html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) return 0;
    return text.split(' ').length;
  }, [html]);

  const palette = READING_PALETTES[theme];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewerToolbar>
        <ToolGroup label="Text size">
          <ToolButton
            label="Smaller text"
            onClick={() => setFontSize((size) => Math.max(12, Number((size - 1).toFixed(1))))}
            disabled={fontSize <= 12}
          >
            <Minus className="h-4 w-4" />
          </ToolButton>
          <span className="flex items-center gap-1 px-1 font-mono text-[11px] tabular-nums text-neutral-500 dark:text-neutral-400">
            <ALargeSmall className="h-3.5 w-3.5" />
            {Math.round(fontSize)}
          </span>
          <ToolButton
            label="Larger text"
            onClick={() => setFontSize((size) => Math.min(26, Number((size + 1).toFixed(1))))}
            disabled={fontSize >= 26}
          >
            <Plus className="h-4 w-4" />
          </ToolButton>
        </ToolGroup>

        <ToolDivider />

        <span className="hidden truncate pl-1 text-[11px] text-neutral-500 dark:text-neutral-400 sm:inline">
          Edited in Word? Download for the exact layout, fonts and images.
        </span>

        {words > 0 && (
          <span className="ml-auto shrink-0 pl-3 font-mono text-[11px] tabular-nums text-neutral-500 dark:text-neutral-400">
            {words.toLocaleString()} words
          </span>
        )}
      </ViewerToolbar>

      <div className="min-h-0 flex-1 overflow-auto overscroll-contain bg-neutral-200/70 dark:bg-[#0c0c0f]">
        {error ? (
          <ViewerError
            title="Cannot display this document"
            message={error}
            downloadHref={downloadUrl(fileId)}
            downloadName={displayName}
            hint="Word files keep their exact design only in Word — the download always opens normally."
          />
        ) : html === null ? (
          <ViewerSpinner label="Opening document…" />
        ) : html.trim() === '' ? (
          <ViewerError
            title="Nothing to preview"
            message="This document has no readable text on its pages."
            downloadHref={downloadUrl(fileId)}
            downloadName={displayName}
          />
        ) : (
          <div className="flex justify-center px-0 py-3 sm:px-6 sm:py-7">
            <article
              className="docx-page w-full max-w-[820px] shadow-[0_1px_2px_rgba(0,0,0,0.14),0_18px_44px_-26px_rgba(0,0,0,0.55)] ring-1 ring-black/10 transition-colors sm:rounded-[3px]"
              style={{
                background: palette.page,
                color: palette.text,
                fontSize: `${fontSize}px`,
                ['--doc-border' as any]: palette.border,
                ['--doc-muted' as any]: palette.muted,
                ['--doc-heading' as any]: palette.heading,
                ['--doc-surface' as any]: palette.surface,
              }}
            >
              <OfficeContent html={html} />
            </article>
          </div>
        )}
      </div>
    </div>
  );
};

export default DocxView;
