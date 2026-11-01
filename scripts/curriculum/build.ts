/**
 * Curriculum builder: official Ghana (NaCCA / MoE) SHS learner materials -> typed data.
 *
 *   node --import tsx scripts/curriculum/build.ts                  # everything, all 3 forms
 *   node --import tsx scripts/curriculum/build.ts --levels 1       # only Form 1
 *   node --import tsx scripts/curriculum/build.ts --only PHY,CHEM  # chosen subjects
 *   node --import tsx scripts/curriculum/build.ts --no-download    # use the local cache only
 *
 * What it does, in order:
 *   1. Finds each subject's page on curriculumresources.edu.gh for Year 1-3.
 *   2. Downloads the official learner-material PDFs (cached in .curriculum-cache/).
 *   3. Reads the text layer of each PDF.
 *   4. Extracts the section title, the "At the end of this section you will be able to"
 *      outcomes, and the document's own sub-headings as topics.
 *   5. Writes src/shared/curriculum/data/<CODE>.ts plus the index, and a coverage report.
 *
 * Honesty rules: only text that exists in the document is written. Nothing is invented
 * to fill a gap, and an empty result is recorded as unresolved rather than guessed.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CACHE_DIR = path.join(ROOT, '.curriculum-cache');
const DATA_DIR = path.join(ROOT, 'src/shared/curriculum/data');
const REPORT = path.join(ROOT, '.curriculum-cache/coverage.json');
const ORIGIN = 'https://curriculumresources.edu.gh';

/** Subject code -> portal page slug (as used by /year1_<slug>/, /year2_<slug>/, ...). */
const SUBJECT_SLUGS: Record<string, string> = {
  ENG: 'english-language',
  MATH: 'mathematics',
  GSCI: 'general-science',
  SOC: 'social-studies',
  ARTFD: 'art-and-design-foundation',
  RELETH: 'religious-and-moral-education',
  COREIT: 'information-and-communication-technology-ict',
  PEH: 'core-physical-education-and-health-peh',
  PHY: 'physics',
  CHEM: 'chemistry',
  BIO: 'biology',
  ADDMATH: 'additional-mathematics',
  COMP: 'computing',
  APPTECH: 'applied-technology',
  DCT: 'design-and-communication-technology',
  FINACC: 'business-studies-accounting',
  BUSMGT: 'business-studies-business-management',
  ECON: 'economics',
  GOV: 'government',
  HIST: 'history',
  LIT: 'literature-in-english',
  CRS: 'religious-studies',
  GEO: 'geography',
  FRE: 'french',
  TWI: 'ghanaian-language_asante-twi',
  PERF: 'performing-arts',
  MGTLIV: 'home-economics-management-in-living',
  FOODNUT: 'home-economics-food-and-nutrition',
  CLOTEX: 'home-economics-clothing-and-textiles',
  ARTSTU: 'arts-and-design-studio',
};

/** Files on those pages that are not subject content. */
const IGNORE = /user-guide|guidelines-on|platform|tablet|scheme-of-learning/i;

const args = process.argv.slice(2);
function arg(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : '';
}
const hasFlag = (name: string) => args.includes(`--${name}`);

const LEVELS = (arg('levels') || '1,2,3')
  .split(',')
  .map((n) => Number(n.trim()))
  .filter((n) => n === 1 || n === 2 || n === 3) as Array<1 | 2 | 3>;
const ONLY = (arg('only') || '')
  .split(',')
  .map((c) => c.trim().toUpperCase())
  .filter(Boolean);
const CONCURRENCY = Math.max(1, Math.min(12, Number(arg('concurrency') || 6)));
const NO_DOWNLOAD = hasFlag('no-download');

fs.mkdirSync(CACHE_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

const log = (...parts: unknown[]) => console.log('[curriculum]', ...parts);

async function getText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** Find all learner-material PDF links on a subject page for one year. */
async function pdfLinksFor(slug: string, level: 1 | 2 | 3): Promise<string[]> {
  for (const candidate of [`${ORIGIN}/year${level}_${slug}/`, `${ORIGIN}/year${level}_${slug}`]) {
    const html = await getText(candidate);
    if (!html) continue;
    const links = [...new Set([...html.matchAll(/href="([^"]+\.pdf)"/gi)].map((m) => m[1]))].filter(
      (u) => !IGNORE.test(u)
    );
    if (links.length > 0) return links;
  }
  return [];
}

async function download(url: string): Promise<string | null> {
  const name = `${path.basename(url).replace(/[^a-zA-Z0-9._-]+/g, '_')}`;
  const target = path.join(CACHE_DIR, name);
  if (fs.existsSync(target) && fs.statSync(target).size > 1024) return target;
  if (NO_DOWNLOAD) return null;
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1024) return null;
    fs.writeFileSync(target, buf);
    return target;
  } catch (err) {
    log('download failed', name, err instanceof Error ? err.message : err);
    return null;
  }
}

/** Run tasks with a small concurrency limit, so the portal is not hammered. */
async function pool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i]);
    }
  });
  await Promise.all(runners);
  return results;
}

// ------------------------------------------------------------------ PDF reading

type PdfText = { pages: string[] };

async function readPdf(file: string): Promise<PdfText | null> {
  try {
    const mod: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const data = new Uint8Array(fs.readFileSync(file));
    const doc = await mod.getDocument({ data, useSystemFonts: true, disableFontFace: true }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const lines: string[] = [];
      let current = '';
      for (const item of content.items as any[]) {
        current += item.str || '';
        if (item.hasEOL) {
          lines.push(current.trim());
          current = '';
        }
      }
      if (current.trim()) lines.push(current.trim());
      pages.push(lines.join('\n'));
    }
    await doc.destroy();
    return { pages };
  } catch (err) {
    log('pdf read failed', path.basename(file), err instanceof Error ? err.message : err);
    return null;
  }
}

// ------------------------------------------------------------------ extraction

const BULLET = /[ï¿½\u2022\u25cf\u25aa]/g;
// Front matter: publisher credits, ISBNs, professional associations. These are printed
// in upper case like a heading, so they slip past a case-based test.
const FRONT_MATTER =
  /(^|\s)(MINISTRY OF EDUCATION|GHANA ASSOCIATION|ASSOCATION|ASSOCIATION OF|TEACHERS ASSOCIATION|ISBN|ISSN|AUTHORS?|REVIEWERS?|PUBLISHERS?|COPYRIGHT|ALL RIGHTS RESERVED|EDITION|ACKNOWLEDGEMENT OF|DEDICATION|PREFACE|FOREWORD|CONTENTS|TABLE OF CONTENTS|MODULE \d+$)/i;
// Front matter, running titles and end matter are page furniture, not study topics.
const NOISE_HEADING =
  /^(KEY IDEA[S]?\s*:?|INTRODUCTION|SUMMARY|ACTIVITY|REVIEW QUESTIONS?\b.*|ASSESSMENT|ANSWERS?\s*:?|REFERENCES?\s*:?|GLOSSARY|SECTION \d+|LEARNING OUTCOMES?|ACKNOWLEDGEMENTS?\s*:?|EXTENDED READING\s*:?|EXTENDED LEARNING\s*:?|ANNEXE?S?\b.*|VIGOUR BEHIND LIFE|PROCESSES FOR LIVING|NAME INSTITUTION|CONTENTS?\b.*|TABLE OF CONTENTS\b.*|FOREWORD\b.*|PREFACE\b.*|APPENDIX\b.*|BIBLIOGRAPHY\b.*|INDEX)$/i;

function cleanLine(line: string): string {
  return line.replace(BULLET, '').replace(/\s+/g, ' ').trim();
}

/**
 * A page header often prints the running title twice back-to-back
 * ("SECTION 9 PRODUCTION IN LOCAL INDUSTRYSECTION 9 ..."). Keep the first copy.
 */
function collapseRepeated(text: string): string {
  const m = /^(.{6,120}?)\1+$/.exec(text.trim());
  return m ? m[1].trim() : text.trim();
}

function isHeading(line: string): boolean {
  const t = collapseRepeated(line).trim();
  if (t.length < 6 || t.length > 90) return false;
  if (!/[A-Z]{4,}/.test(t)) return false;
  if (NOISE_HEADING.test(t)) return false;
  // Front matter, not a study topic: publisher credits, ISBNs, associations, and
  // table-of-contents lines, which are uppercase and otherwise look like headings.
  // ("MINISTRY OF EDUCATION ...", "ISBN: 978-…", "CONTENTS FOREWORD ......... V")
  if (FRONT_MATTER.test(t)) return false;
  // A running header can fuse with the next heading ("SECTION 3 REVIEW QUESTIONS 3.1").
  if (/SECTION\s*\d+/.test(t)) return false;
  if (/REVIEW QUESTIONS?\s*\d/i.test(t)) return false;
  // A dotted leader is a table of contents entry, never a topic.
  if (/\.{3,}|…{1,}/.test(t)) return false;
  // A line ending in a page number is a contents entry ("NUMBERS FOR EVERYDAY LIFE 2").
  if (/\s\d{1,3}$/.test(t) && /\.{2,}|\s{3,}/.test(line)) return false;
  // Mostly upper case, few lower-case words: a real document heading.
  const letters = t.replace(/[^A-Za-z]/g, '');
  if (!letters) return false;
  const upper = t.replace(/[^A-Z]/g, '').length;
  return upper / letters.length > 0.85;
}

type LineKind = 'head' | 'body';

interface NormalisedLine {
  kind: LineKind;
  text: string;
}

/**
 * The text layer glues page numbers onto the next heading ("1CHARACTERISTICS");
 * strip the glued digits, then classify. Running titles, page numbers and year
 * labels are body lines because a heading never wraps across a "SECTION n" line —
 * they end the current heading run.
 */
function classifyLine(raw: string): NormalisedLine {
  let t = cleanLine(raw);
  if (!t) return { kind: 'body', text: '' };
  t = collapseRepeated(t).replace(/^\d{1,3}(?=[A-Z]{2,})/, '').trim();
  // A page number can also fuse to a mixed-case running header ("10Section 5DISCOURSE").
  t = t.replace(/^\d{1,3}(?=Section\s*\d)/i, '').trim();
  if (!t) return { kind: 'body', text: '' };
  // Running titles ("SECTION 9 PRODUCTION IN..."), bare "SECTION" and page numbers
  // are never content: flush the run instead of letting them merge into a heading.
  if (/^SECTION|^YEAR \d/i.test(t)) return { kind: 'body', text: t };
  if (isHeading(t)) return { kind: 'head', text: t };
  return { kind: 'body', text: t };
}

/**
 * Merge consecutive heading lines the way the document prints them: a heading that
 * wraps ("SCIENCE PROCESSES IN THE STAGES OF / PRODUCTION OF KENKEY") is one topic,
 * not two. Any body line — including page numbers and running titles — ends a run.
 */
function headingRuns(page: string): string[] {
  const out: string[] = [];
  let run: string[] = [];
  for (const raw of page.split('\n')) {
    const { kind, text } = classifyLine(raw);
    if (kind === 'head') run.push(text);
    else if (run.length) {
      out.push(run.join(' '));
      run = [];
    }
  }
  if (run.length) out.push(run.join(' '));
  return out.map(collapseRepeated).filter((t) => t.length > 0);
}

interface SectionExtract {
  sectionNumber: string | null;
  title: string;
  outcomes: string[];
  topics: string[];
}

/** Pull one section's structure out of its learner-material PDF. */
function extractSection(pages: string[], fallbackTitle: string): SectionExtract {
  // Section number and title, from the running header "SECTION 9 PRODUCTION IN
  // LOCAL INDUSTRY" printed on every content page — the document's own naming.
  let sectionNumber: string | null = null;
  let headerTitle = '';
  for (const rawLine of pages.join('\n').split('\n')) {
    // Collapse the duplicated-header artefact BEFORE the capture: cutting it first
    // leaves two unequal halves ("...INDUSTRY" + "SECTION 9 ...INDUSTRY").
    const line = collapseRepeated(cleanLine(rawLine));
    const m = /^SECTION\s+(\d{1,2})\s+(.{4,70})$/.exec(line);
    if (m) {
      // Skip the generic ones and the duplicated-header artefacts.
      const candidate = collapseRepeated(m[2].trim());
      if (/^(year|general science)\b/i.test(candidate)) continue;
      if (candidate.length > headerTitle.length) {
        headerTitle = candidate;
        if (!sectionNumber) sectionNumber = m[1];
      }
    }
  }

  // Fallback title: the longest heading run on the cover page ("PRODUCTION IN" +
  // "LOCAL INDUSTRY" print stacked, so the merged run carries the full title).
  const titleCandidates = headingRuns(pages[0] || '')
    .filter((l) => /^[A-Z][A-Z\s,&'\-/]{5,80}$/.test(l))
    .sort((a, b) => b.length - a.length);
  const title = headerTitle || collapseRepeated(titleCandidates[0] || '') || fallbackTitle;

  // Outcomes: the list that follows "At the end of this section, you will be able to".
  // Bullets wrap over several lines; keep joining until the sentence itself is done.
  const outcomes: string[] = [];
  const lines = pages.join('\n').split('\n').map(cleanLine).filter(Boolean);
  const start = lines.findIndex((l) => /at the end of this (section|unit)/i.test(l));
  if (start !== -1) {
    let buf = '';
    for (let i = start + 1; i < Math.min(lines.length, start + 40); i++) {
      const line = lines[i];
      if (/^(key ideas?|introduction|activity|section \d+)/i.test(line)) break;
      if (/^(SECTION|YEAR)\b/i.test(line)) break;
      if (line.length < 8) continue;
      buf = buf ? `${buf} ${line}` : line.replace(/^[0-9]+[.)]\s*/, '');
      if (/\.$/.test(line)) {
        outcomes.push(buf.replace(/^[0-9]+[.)]\s*/, ''));
        buf = '';
      }
      if (outcomes.length >= 8) break;
    }
  }

  // Topics: the document's own sub-headings, in order of first appearance. The
  // section title itself is not a topic: fragments of it ("PRODUCTION IN") are
  // page furniture, and listing them would make the curriculum look richer than
  // the document actually is.
  const titleWordSet = new Set(title.toLowerCase().match(/[a-z']+/g) ?? []);
  const isTitleFragment = (line: string): boolean => {
    const words = line.toLowerCase().match(/[a-z']+/g) ?? [];
    return words.length > 0 && words.every((w) => titleWordSet.has(w));
  };

  const topics: string[] = [];
  // A running header sometimes fuses with the next heading in the text layer
  // ("SECTION 2 EXPLORING MATERIALS THE PERIODIC TABLE OF ELEMENTS"); strip the
  // printed title so the heading behind it can stand alone.
  const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const titlePattern = headerTitle
    ? new RegExp(`^SECTION\\s*\\d{0,2}\\s*${headerTitle.split(/\s+/).map(escapeRe).join('\\s+')}\\s*[\\s:—-]*`, 'i')
    : null;

  topicLoop: for (const page of pages) {
    for (const run of headingRuns(page)) {
      const stripped = titlePattern ? collapseRepeated(run).replace(titlePattern, '').trim() : run;
      if (!stripped || /^SECTION|^YEAR \d/i.test(stripped)) continue;
      if (isTitleFragment(stripped)) continue;
      if (!isHeading(stripped)) continue;
      // Single generic words are page furniture, not study topics.
      if ((stripped.match(/[a-z']+/gi) ?? []).length < 2 && stripped.length < 16) continue;
      const normalised = stripped.toLowerCase();
      if (topics.some((t) => t.toLowerCase() === normalised)) continue;
      topics.push(stripped);
      if (topics.length >= 18) break topicLoop;
    }
  }

  return {
    sectionNumber,
    title: title.replace(/\s+/g, ' ').trim(),
    outcomes: outcomes.slice(0, 8),
    topics,
  };
}

const clean = (s: string) =>
  s
    .replace(/[�]+/g, '')
    .replace(/\s+/g, ' ')
    .replace(/"/g, "'")
    .trim();

function toTsString(value: string): string {
  return JSON.stringify(value);
}

// ------------------------------------------------------------------ build

async function buildSubject(code: string, name: string) {
  const slug = SUBJECT_SLUGS[code];
  const levels: Record<string, any> = {};

  for (const level of LEVELS) {
    if (!slug) break;
    const links = await pdfLinksFor(slug, level);
    if (links.length === 0) {
      levels[level] = { strands: [], sources: [], status: 'unresolved' };
      log(`${code} SHS${level}: no material found`);
      continue;
    }

    const files = await pool(links, CONCURRENCY, download);
    const sections: SectionExtract[] = [];
    for (const file of files) {
      if (!file) continue;
      const text = await readPdf(file);
      if (!text) continue;
      const fallback = path
        .basename(file, '.pdf')
        .replace(/[-_]+/g, ' ')
        .replace(/\b(lm|version|online|lv|tv|lversion)\b/gi, '')
        .trim();
      sections.push(extractSection(text.pages, fallback));
    }

    const usable = sections.filter((s) => s.title && s.title.length > 3);
    const strands = usable
      .map((s) => {
        const strandName = `Section ${s.sectionNumber ?? '?'} — ${clean(s.title)}`;
        // Topics only when the document actually has sub-headings. Outcomes are kept on
        // the strand separately; nothing is invented to fill a gap.
        const topicList = s.topics;
        return {
          name: strandName,
          outcomes: s.outcomes.map(clean).filter(Boolean),
          subStrands:
            topicList.length > 0
              ? [
                  {
                    name: '',
                    topics: topicList.map((t) => ({
                      topic: clean(t),
                      status: 'verified' as const,
                      source: links[0],
                    })),
                  },
                ]
              : [],
        };
      })
      .filter((s) => s.subStrands.length > 0 || s.outcomes.length > 0);

    levels[level] = {
      strands,
      sources: links,
      status: strands.length > 0 ? 'verified' : 'unresolved',
    };
    log(
      `${code} SHS${level}: ${links.length} file(s) -> ${strands.length} section(s), ` +
        `${strands.reduce((n, s) => n + (s.subStrands[0]?.topics.length ?? 0), 0)} topic(s)`
    );
  }

  const levelEntries = Object.entries(levels)
    .map(([lvl, value]) => `${lvl}: ${JSON.stringify(value)},`)
    .join('\n    ');

  const file = path.join(DATA_DIR, `${code}.ts`);
  fs.writeFileSync(
    file,
    `// Generated by scripts/curriculum/build.ts — do not edit by hand.\n` +
      `// Source: official Ghana MoE learner materials (curriculumresources.edu.gh).\n` +
      `import type { SubjectCurriculum } from '../types.ts';\n\n` +
      `export const ${code}_CURRICULUM: SubjectCurriculum = {\n` +
      `  code: ${toTsString(code)},\n` +
      `  name: ${toTsString(name)},\n` +
      `  levels: {\n    ${levelEntries}\n  },\n};\n`
  );

  return {
    code,
    forms: Object.entries(levels)
      .filter(([, v]: any) => v.strands.length > 0)
      .map(([k]) => k),
    strands: Object.values(levels).reduce((n: number, v: any) => n + v.strands.length, 0),
    topics: Object.values(levels).reduce(
      (n: number, v: any) => n + v.strands.reduce((m: number, s: any) => m + (s.subStrands[0]?.topics.length ?? 0), 0),
      0
    ),
  };
}

async function main() {
  const { SUBJECTS, getSubject } = await import('../../src/shared/subjects.ts');
  const subjectName = (code: string) => getSubject(code)?.name ?? code;
  const targets = SUBJECTS.filter((s) => ONLY.length === 0 || ONLY.includes(s.code));

  const report: any[] = [];
  for (const subject of targets) {
    const result = await buildSubject(subject.code, subject.name);
    report.push(result);
  }

  // Index file: imports every generated subject and stamps a version.
  // The version is a date PLUS a content digest, so re-running with identical data does
  // not invalidate every cached study set, while any real change always does.
  const crypto = await import('node:crypto');
  const hash = crypto.createHash('sha256');
  for (const r of report) {
    const file = path.join(DATA_DIR, `${r.code}.ts`);
    if (fs.existsSync(file)) {
      hash.update(r.code);
      hash.update(fs.readFileSync(file));
    }
  }
  const version = `${new Date().toISOString().slice(0, 10)}+${hash.digest('hex').slice(0, 8)}`;
  const meta = report
    .map((r) => `  { code: ${toTsString(r.code)}, name: ${toTsString(subjectName(r.code))} }`)
    .join(',\n');
  fs.writeFileSync(
    path.join(DATA_DIR, 'index.ts'),
    `// Generated by scripts/curriculum/build.ts — do not edit by hand.\n` +
      `/** Code + name for every subject with curriculum data in this build. */\n` +
      `export interface CurriculumSubjectMeta { code: string; name: string }\n\n` +
      `/** Cache-busting version of the curriculum data (date + content digest). */\n` +
      `export const GENERATED_VERSION = ${toTsString(version)};\n\n` +
      `export const GENERATED_CURRICULUM: CurriculumSubjectMeta[] = [\n${meta}\n];\n`
  );

  fs.writeFileSync(REPORT, JSON.stringify({ generatedAt: version, report }, null, 2));
  const totalTopics = report.reduce((n, r) => n + r.topics, 0);
  log(`done: ${report.filter((r) => r.topics > 0).length}/${report.length} subjects with content, ${totalTopics} topics`);
  log(`coverage report: ${path.relative(ROOT, REPORT)}`);
}

main().catch((err) => {
  console.error('[curriculum] failed:', err);
  process.exitCode = 1;
});
