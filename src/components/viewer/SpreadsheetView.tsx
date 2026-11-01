/**
 * Spreadsheet viewer.
 *
 * Mirrors what Excel (and Sheets) show: a lettered header rail, numbered rows,
 * frozen headers while scrolling, a formula bar for the selected cell, sheet
 * tabs at the bottom and the workbook's own column widths.
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Grid3x3, Minus, Plus } from 'lucide-react';
import { extractOfficeDoc, type OfficeDocument } from '../../services/officeReader';
import {
  ToolButton,
  ToolDivider,
  ToolGroup,
  ViewerError,
  ViewerSpinner,
  ViewerToolbar,
  type ViewerFileProps,
} from './viewerUi';

const downloadUrl = (id: string) => `/api/vault/files/${id}/stream?download=1`;
const streamUrl = (id: string) => `/api/vault/files/${id}/stream`;

const DEFAULT_COL_WIDTH = 104;
const MIN_ROWS = 26;
const MIN_COLS = 10;

function columnLetter(index: number): string {
  let value = index;
  let label = '';
  do {
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return label;
}

const isNumeric = (value: string) => value !== '' && /^[+-]?[\d,]*\.?\d+%?$/.test(value.trim());

const SpreadsheetView: React.FC<ViewerFileProps> = ({ fileId, displayName }) => {
  const [doc, setDoc] = useState<OfficeDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<{ row: number; col: number } | null>(null);
  const [stageWidth, setStageWidth] = useState(0);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const measure = () => setStageWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [doc]);

  useEffect(() => {
    let cancelled = false;
    setDoc(null);
    setError(null);

    (async () => {
      try {
        const response = await fetch(streamUrl(fileId));
        if (!response.ok) throw new Error('Could not open this workbook.');
        const blob = await response.blob();
        const parsed = await extractOfficeDoc(blob, displayName);
        if (cancelled) return;
        if (!parsed.sheets || parsed.sheets.length === 0) throw new Error('empty');
        setDoc(parsed);
      } catch {
        if (!cancelled) setError('This workbook could not be read in the viewer.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fileId, displayName]);

  const sheet = doc?.sheets?.[sheetIndex];

  const grid = useMemo(() => {
    if (!sheet) return { rows: [] as string[][], colCount: 0, widths: [] as number[] };

    const usedCols = Math.max(
      1,
      sheet.rows.reduce((max, row) => Math.max(max, row.length), 0),
      sheet.widths.length
    );
    const baseWidths = Array.from({ length: usedCols }, (_, index) => sheet.widths[index] || DEFAULT_COL_WIDTH);
    const usedWidth = 52 + baseWidths.reduce((total, width) => total + width, 0);
    // Empty columns continue the grid to the edge of the window, the way a
    // spreadsheet does instead of stopping at the last used cell.
    const filler = stageWidth > 0 ? Math.min(24, Math.max(0, Math.ceil((stageWidth - usedWidth) / DEFAULT_COL_WIDTH))) : 0;
    const colCount = Math.max(usedCols, MIN_COLS) + filler;

    const rows = sheet.rows.map((row) => {
      const copy = row.slice(0, colCount);
      while (copy.length < colCount) copy.push('');
      return copy;
    });
    while (rows.length < MIN_ROWS) rows.push(new Array(colCount).fill(''));

    const widths = Array.from({ length: colCount }, (_, index) => baseWidths[index] || DEFAULT_COL_WIDTH);
    return { rows, colCount, widths };
  }, [sheet, stageWidth]);

  const selectedValue = selected ? grid.rows[selected.row]?.[selected.col] ?? '' : '';
  const selectedRef = selected ? `${columnLetter(selected.col)}${selected.row + 1}` : '';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewerToolbar>
        <ToolGroup label="Zoom">
          <ToolButton label="Zoom out" onClick={() => setZoom((value) => Math.max(0.6, value - 0.1))} disabled={zoom <= 0.6}>
            <Minus className="h-4 w-4" />
          </ToolButton>
          <button
            type="button"
            onClick={() => setZoom(1)}
            title="Reset zoom to 100%"
            className="min-w-[48px] rounded-md px-1 py-1 font-mono text-[11px] tabular-nums text-neutral-600 hover:bg-neutral-900/[0.06] hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-white"
          >
            {Math.round(zoom * 100)}%
          </button>
          <ToolButton label="Zoom in" onClick={() => setZoom((value) => Math.min(1.8, value + 0.1))} disabled={zoom >= 1.8}>
            <Plus className="h-4 w-4" />
          </ToolButton>
        </ToolGroup>

        <ToolDivider />

        <span className="flex shrink-0 items-center gap-1.5 pl-1 text-[11px] text-neutral-500 dark:text-neutral-400">
          <Grid3x3 className="h-3.5 w-3.5" />
          {sheet ? `${sheet.rows.length} rows · ${grid.colCount} columns` : 'Reading workbook…'}
        </span>

        <span className="ml-auto hidden shrink-0 pl-3 text-[11px] text-neutral-500 dark:text-neutral-400 sm:block">
          Formulas show their values here; download for the live workbook.
        </span>
      </ViewerToolbar>

      {/* Formula bar, exactly where Excel puts it */}
      <div className="flex shrink-0 items-stretch border-b border-neutral-500/15 bg-white text-neutral-900 dark:border-white/10 dark:bg-neutral-950 dark:text-white">
        <div className="flex w-16 shrink-0 items-center justify-center border-r border-neutral-500/15 font-mono text-[11px] font-semibold dark:border-white/10">
          {selectedRef || '—'}
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5">
          <span className="text-[11px] italic text-neutral-400 dark:text-neutral-500">fx</span>
          <span className="truncate font-mono text-[11px]">{selectedValue}</span>
        </div>
      </div>

      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-auto overscroll-contain bg-white dark:bg-neutral-950">
        {error ? (
          <ViewerError
            title="Cannot display this workbook"
            message={error}
            downloadHref={downloadUrl(fileId)}
            downloadName={displayName}
            hint="Excel formatting, charts and formulas stay intact in the downloaded file."
          />
        ) : !doc ? (
          <ViewerSpinner label="Reading workbook…" />
        ) : (
          <div style={{ zoom } as React.CSSProperties}>
            <table className="border-separate border-spacing-0 text-left" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: 52 }} />
                {grid.widths.map((width, index) => (
                  <col key={index} style={{ width }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-30 h-7 w-[52px] border-b border-r border-neutral-500/25 bg-neutral-100 text-center dark:border-white/15 dark:bg-neutral-800" />
                  {Array.from({ length: grid.colCount }, (_, index) => {
                    const active = selected?.col === index;
                    return (
                      <th
                        key={index}
                        className={`sticky top-0 z-20 h-7 border-b border-r border-neutral-500/25 text-center text-[11px] font-medium ${
                          active
                            ? 'bg-indigo-500/15 font-semibold text-indigo-700 dark:text-indigo-300'
                            : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400'
                        }`}
                      >
                        {columnLetter(index)}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {grid.rows.map((row, rowIndex) => {
                  const rowActive = selected?.row === rowIndex;
                  return (
                    <tr key={rowIndex}>
                      <th
                        className={`sticky left-0 z-10 h-7 w-[52px] border-b border-r border-neutral-500/25 text-center text-[11px] font-medium ${
                          rowActive
                            ? 'bg-indigo-500/15 font-semibold text-indigo-700 dark:text-indigo-300'
                            : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400'
                        }`}
                      >
                        {rowIndex + 1}
                      </th>
                      {row.map((value, colIndex) => {
                        const isSelected = selected?.row === rowIndex && selected?.col === colIndex;
                        const numeric = isNumeric(value);
                        return (
                          <td
                            key={colIndex}
                            onClick={() => setSelected({ row: rowIndex, col: colIndex })}
                            title={value || undefined}
                            className={`h-7 cursor-cell truncate border-b border-r border-neutral-500/20 px-1.5 text-[12px] leading-7 dark:border-white/10 ${
                              isSelected
                                ? 'bg-indigo-500/10 ring-2 ring-inset ring-indigo-500'
                                : 'hover:bg-neutral-900/[0.03] dark:hover:bg-white/[0.04]'
                            } ${numeric ? 'text-right tabular-nums' : ''}`}
                          >
                            {value}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {doc.truncated && (
              <p className="px-3 py-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                Large workbook: the preview shows the first sheets and rows. Download for everything.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Sheet tabs, like the real thing */}
      {doc && doc.sheets && doc.sheets.length > 0 && (
        <div className="no-scrollbar flex shrink-0 items-center gap-1 overflow-x-auto border-t border-neutral-500/20 bg-neutral-100 px-1.5 py-1 dark:border-white/10 dark:bg-neutral-900">
          {doc.sheets.map((item, index) => {
            const active = index === sheetIndex;
            return (
              <button
                key={`${item.name}-${index}`}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setSheetIndex(index);
                  setSelected(null);
                }}
                className={`shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  active
                    ? 'bg-white text-emerald-700 shadow-sm ring-1 ring-black/5 dark:bg-neutral-800 dark:text-emerald-300'
                    : 'text-neutral-500 hover:bg-white/70 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white'
                }`}
              >
                {item.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SpreadsheetView;
