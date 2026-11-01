/**
 * Note viewer — and the student's own notes on a file.
 *
 * Renders the saved Markdown with the app's academic formatter on a reading column, and
 * carries the "My notes" drawer that used to live in the deleted DocumentReaderModal.
 * Notes are stored on the server with the file, so they survive a reinstall and follow
 * the student between devices instead of living in one browser.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ALargeSmall, Check, Minus, NotebookPen, Plus, RotateCw, Save, X } from 'lucide-react';
import { FormattedContent } from '../FormattedContent';
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
import { updateVaultFile } from '../../services/vaultApi';
import { MAX_NOTES_CHARS } from '../../shared/vaultQuery';

const downloadUrl = (id: string) => `/api/vault/files/${id}/stream?download=1`;

interface Props extends ViewerFileProps {
  theme: ReadingTheme;
  /** Notes already loaded for this file, if the caller has them. */
  initialNotes?: string | null;
}

const TextView: React.FC<Props> = ({ fileId, displayName, theme, initialNotes }) => {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState(15);

  // My notes
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState<string>(initialNotes ?? '');
  const [savedNotes, setSavedNotes] = useState<string>(initialNotes ?? '');
  const [notesStatus, setNotesStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [notesError, setNotesError] = useState<string | null>(null);

  useEffect(() => {
    setNotes(initialNotes ?? '');
    setSavedNotes(initialNotes ?? '');
  }, [fileId, initialNotes]);

  useEffect(() => {
    let cancelled = false;
    setText(null);
    setError(null);

    (async () => {
      try {
        const response = await fetch(`/api/vault/files/${fileId}/content`);
        if (!response.ok) throw new Error('Could not read this note.');
        const data = await response.json();
        if (!cancelled) setText(typeof data.text === 'string' ? data.text : '');
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not read this note.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fileId]);

  const saveNotes = useCallback(async () => {
    setNotesStatus('saving');
    setNotesError(null);
    try {
      await updateVaultFile(Number(fileId), { notes });
      setSavedNotes(notes);
      setNotesStatus('saved');
      setTimeout(() => setNotesStatus('idle'), 2000);
    } catch (err) {
      setNotesStatus('error');
      setNotesError(err instanceof Error ? err.message : 'Could not save your notes.');
    }
  }, [fileId, notes]);

  const stats = useMemo(() => {
    const body = (text || '').replace(/[#*`>_|-]/g, ' ').trim();
    const words = body ? body.split(/\s+/).length : 0;
    return { words, minutes: Math.max(1, Math.round(words / 200)) };
  }, [text]);

  const palette = READING_PALETTES[theme];
  const dirty = notes !== savedNotes;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewerToolbar>
        <ToolGroup label="Text size">
          <ToolButton
            label="Smaller text"
            onClick={() => setFontSize((size) => Math.max(12, size - 1))}
            disabled={fontSize <= 12}
          >
            <Minus className="h-4 w-4" />
          </ToolButton>
          <span className="flex items-center gap-1 px-1 font-mono text-[11px] tabular-nums text-neutral-500 dark:text-neutral-400">
            <ALargeSmall className="h-3.5 w-3.5" />
            {fontSize}
          </span>
          <ToolButton
            label="Larger text"
            onClick={() => setFontSize((size) => Math.min(24, size + 1))}
            disabled={fontSize >= 24}
          >
            <Plus className="h-4 w-4" />
          </ToolButton>
        </ToolGroup>

        <ToolDivider />

        <ToolButton
          label={notesOpen ? 'Close my notes' : 'My notes'}
          onClick={() => setNotesOpen((v) => !v)}
          active={notesOpen}
        >
          <NotebookPen className="h-4 w-4" />
        </ToolButton>

        <div className="ml-auto flex shrink-0 items-center gap-3 pl-3 font-mono text-[11px] tabular-nums text-neutral-500 dark:text-neutral-400">
          {stats.words > 0 && (
            <>
              <span>{stats.words.toLocaleString()} words</span>
              <span className="hidden sm:inline">≈ {stats.minutes} min read</span>
            </>
          )}
        </div>
      </ViewerToolbar>

      <div className="flex min-h-0 flex-1">
        <div
          className="min-h-0 flex-1 overflow-auto overscroll-contain"
          style={{ background: palette.surface }}
        >
          {error ? (
            <ViewerError
              title="Cannot read this note"
              message={error}
              downloadHref={downloadUrl(fileId)}
              downloadName={displayName}
            />
          ) : text === null ? (
            <ViewerSpinner label="Loading note…" />
          ) : (
            <div className="flex justify-start px-0 py-3 sm:justify-center sm:px-6 sm:py-7">
              <article
                className="w-full max-w-[760px] px-5 py-6 shadow-[0_1px_2px_rgba(0,0,0,0.12),0_18px_44px_-28px_rgba(0,0,0,0.5)] ring-1 ring-black/5 dark:ring-white/5 sm:rounded-[3px] sm:px-12 sm:py-12"
                style={{
                  background: palette.page,
                  color: palette.text,
                  fontSize: `${fontSize}px`,
                  lineHeight: 1.75,
                }}
              >
                <FormattedContent content={text} className="note-reading" />
              </article>
            </div>
          )}
        </div>

        {/* My notes: written alongside the document, saved with the file. */}
        {notesOpen && (
          <aside className="flex w-72 shrink-0 flex-col border-l border-neutral-500/15 bg-white dark:border-white/10 dark:bg-neutral-900 sm:w-80">
            <div className="flex items-center justify-between gap-2 border-b border-neutral-500/15 px-3 py-2 dark:border-white/10">
              <span className="text-xs font-semibold text-neutral-900 dark:text-white">My notes</span>
              <button
                onClick={() => setNotesOpen(false)}
                aria-label="Close my notes"
                className="rounded p-1 text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <textarea
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value.slice(0, MAX_NOTES_CHARS));
                setNotesStatus('idle');
              }}
              placeholder={'Write what you want to remember…\nThese notes save with the file and sync to your other devices.'}
              className="min-h-0 flex-1 resize-none bg-transparent p-3 font-mono text-xs leading-relaxed text-neutral-900 placeholder-neutral-400 focus:outline-none dark:text-white"
            />

            <div className="flex items-center justify-between gap-2 border-t border-neutral-500/15 px-3 py-2 dark:border-white/10">
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                {notesStatus === 'saving'
                  ? 'Saving…'
                  : notesStatus === 'error'
                    ? notesError || 'Could not save'
                    : notesStatus === 'saved'
                      ? 'Saved'
                      : dirty
                        ? 'Unsaved changes'
                        : 'All changes saved'}
              </span>
              <button
                onClick={saveNotes}
                disabled={!dirty || notesStatus === 'saving'}
                className="flex min-h-[32px] items-center gap-1.5 rounded-lg bg-neutral-900 px-3 text-[11px] font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
              >
                {notesStatus === 'saving' ? (
                  <RotateCw className="h-3.5 w-3.5 animate-spin" />
                ) : savedNotes && !dirty ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                <span>{notesStatus === 'saving' ? 'Saving' : 'Save'}</span>
              </button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};

export default TextView;
