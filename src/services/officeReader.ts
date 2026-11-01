/**
 * Free, open-source readers for files a browser can't render natively.
 * Everything runs on the student's device — no document ever leaves ClassApp.
 *
 *  - DOCX : mammoth (MIT) → semantic HTML
 *  - XLSX : SheetJS (Apache-2.0) → sheets, rows and column widths
 *  - PPTX : JSZip (MIT) → slide-by-slide text
 *
 * The readers return structure, not just a blob of HTML, so each viewer can
 * present the file the way its real application does (page, grid, slide deck).
 */
import JSZip from 'jszip';
import type { OfficeFormat } from '../components/viewer/fileKind';

export interface OfficeSheet {
  name: string;
  rows: string[][];
  /** Pixel widths derived from the workbook's own column widths, when present. */
  widths: (number | null)[];
}

export interface OfficeSlide {
  number: number;
  paragraphs: string[];
}

export interface OfficeDocument {
  kind: OfficeFormat;
  /** DOCX only: sanitised semantic HTML. */
  html: string;
  sheets?: OfficeSheet[];
  slides?: OfficeSlide[];
  /** True when very large sheets were cut down for a phone. */
  truncated: boolean;
}

const MAX_SHEETS = 12;
const MAX_ROWS = 400;
const MAX_COLS = 60;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function readDocx(blob: Blob): Promise<string> {
  const mammoth = await import('mammoth/mammoth.browser');
  const arrayBuffer = await blob.arrayBuffer();
  const result = await (mammoth as any).convertToHtml(
    { arrayBuffer },
    {
      // Keep it light: images embedded in the doc are skipped rather than bloating the page.
      convertImage: (mammoth as any).images.inline(() => Promise.resolve({})),
    }
  );
  return result.value as string;
}

async function readXlsx(blob: Blob): Promise<{ sheets: OfficeSheet[]; truncated: boolean }> {
  const XLSX = await import('xlsx');
  const arrayBuffer = await blob.arrayBuffer();
  const book = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  const sheets: OfficeSheet[] = [];
  let truncated = false;

  for (const sheetName of book.SheetNames.slice(0, MAX_SHEETS)) {
    const sheet = book.Sheets[sheetName];
    if (!sheet) continue;

    const raw = XLSX.utils.sheet_to_json<any[]>(sheet, {
      header: 1,
      blankrows: false,
      raw: false,
      defval: '',
    }) as any[][];

    if (raw.length > MAX_ROWS) truncated = true;

    const rows = raw.slice(0, MAX_ROWS).map((row) => {
      const cells = (row || []).slice(0, MAX_COLS).map((cell) => {
        if (cell === null || cell === undefined) return '';
        return String(cell);
      });
      if ((row || []).length > MAX_COLS) truncated = true;
      // Trim trailing blanks the way a spreadsheet renders an unused area.
      while (cells.length && cells[cells.length - 1] === '') cells.pop();
      return cells;
    });

    const widths = ((sheet as any)['!cols'] as any[] | undefined)?.slice(0, MAX_COLS).map((col) => {
      const wch = Number(col?.wch ?? NaN);
      if (!Number.isFinite(wch) || wch <= 0) return null;
      return Math.round(Math.min(360, Math.max(56, wch * 7.4)));
    }) ?? [];

    sheets.push({ name: sheetName || 'Sheet', rows, widths });
  }

  if (book.SheetNames.length > MAX_SHEETS) truncated = true;
  return { sheets, truncated };
}

async function readPptx(blob: Blob): Promise<OfficeSlide[]> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const slidePaths = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)\.xml$/)![1]);
      const nb = Number(b.match(/slide(\d+)\.xml$/)![1]);
      return na - nb;
    });

  const slides: OfficeSlide[] = [];
  for (let i = 0; i < slidePaths.length; i++) {
    const xml = await zip.files[slidePaths[i]].async('string');
    // Each paragraph is one <a:p>; each run of text is <a:t>.
    const paragraphs = Array.from(xml.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g))
      .map((match) =>
        Array.from(match[1].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g))
          .map((text) => text[1])
          .join('')
      )
      .map((text) => text.trim())
      .filter(Boolean)
      .map((text) => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));

    slides.push({ number: i + 1, paragraphs });
  }

  return slides;
}

export async function extractOfficeDoc(blob: Blob, name: string): Promise<OfficeDocument> {
  const lower = name.toLowerCase();

  if (/\.(docx|docm)$/.test(lower)) {
    return { kind: 'docx', html: await readDocx(blob), truncated: false };
  }
  if (/\.(xlsx|xlsm|xls)$/.test(lower)) {
    const { sheets, truncated } = await readXlsx(blob);
    return { kind: 'xlsx', html: '', sheets, truncated };
  }
  if (/\.(pptx|pptm)$/.test(lower)) {
    return { kind: 'pptx', html: '', slides: await readPptx(blob), truncated: false };
  }
  throw new Error('Unsupported document type.');
}

/** Kept for callers that only want the HTML representation of a document. */
export interface OfficeText {
  kind: 'docx' | 'xlsx' | 'pptx';
  html: string;
}

export async function extractOfficeText(blob: Blob, name: string): Promise<OfficeText> {
  const doc = await extractOfficeDoc(blob, name);
  if (doc.kind === 'docx') return { kind: 'docx', html: doc.html };

  if (doc.kind === 'xlsx') {
    const html = (doc.sheets || [])
      .map(
        (sheet) =>
          `<h3>${escapeHtml(sheet.name)}</h3><div class="ctable-wrap"><table class="ctable">${sheet.rows
            .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
            .join('')}</table></div>`
      )
      .join('');
    return { kind: 'xlsx', html };
  }

  const html = (doc.slides || [])
    .map(
      (slide) =>
        `<section><h3>Slide ${slide.number}</h3>${slide.paragraphs
          .map((text) => `<p>${escapeHtml(text)}</p>`)
          .join('')}</section>`
    )
    .join('');
  return { kind: 'pptx', html };
}
