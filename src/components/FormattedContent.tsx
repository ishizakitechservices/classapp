import React, { memo, useMemo, useState } from 'react';
import katex from 'katex';
import { Copy, Check } from 'lucide-react';

interface FormattedContentProps {
  content: string;
  className?: string;
  /** True while the answer is still streaming in (half-written markdown must stay stable). */
  streaming?: boolean;
}

/** KaTeX HTML cache: streaming re-renders re-parse the same lines many times per second. */
const mathCache = new Map<string, string>();
const MATH_CACHE_MAX = 600;

/** Strip any thinking/scratchpad tags that might slip past the server. */
function stripThinking(text: string): string {
  return text
    .replace(/<thinking[\s\S]*?<\/thinking>/gi, '')
    .replace(/<thought[\s\S]*?<\/thought>/gi, '')
    .replace(/<reasoning[\s\S]*?<\/reasoning>/gi, '')
    .replace(/```thinking[\s\S]*?```/gi, '')
    .trim();
}

/**
 * Safely renders LaTeX math using KaTeX.
 * Returns HTML string or fallback text on error.
 */
function renderMath(latex: string, displayMode: boolean): string {
  const key = `${displayMode ? 'D' : 'I'}:${latex}`;
  const cached = mathCache.get(key);
  if (cached !== undefined) return cached;

  let html: string;
  try {
    html = katex.renderToString(latex.trim(), {
      displayMode,
      throwOnError: false,
      output: 'htmlAndMathml',
      strict: false,
    });
  } catch (err) {
    console.warn('[KaTeX Error]:', err);
    html = `<span class="font-mono text-xs text-rose-500">${escapeHtml(latex)}</span>`;
  }
  if (mathCache.size >= MATH_CACHE_MAX) mathCache.clear();
  mathCache.set(key, html);
  return html;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Component to display a code block with copy button
 */
const CodeBlock: React.FC<{ language: string; code: string }> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div
      data-block="code"
      className="my-2.5 rounded-lg border border-neutral-500/15 dark:border-white/10 bg-neutral-900 text-neutral-100 overflow-hidden text-xs"
    >
      <div className="flex items-center justify-between px-3 py-1.5 bg-neutral-800/80 border-b border-neutral-800 text-[11px] font-mono text-neutral-400">
        <span>{language || 'code'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-white transition-colors focus:outline-none"
          title="Copy code to clipboard"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto font-mono text-xs leading-relaxed text-neutral-200">
        <code>{code}</code>
      </pre>
    </div>
  );
};

/**
 * Renders inline text, handling inline LaTeX ($...$), bold, italic, code, strikethrough,
 * links, images and chemistry notation.
 *
 * Two rules that keep streaming safe:
 * - Nothing across a newline is matched, so a half-written answer never swallows a paragraph.
 * - An unclosed `**`, `*` or backtick is only treated as literal text (handled upstream),
 *   never as an unterminated span that would eat the rest of the message.
 */
function parseInlineContent(text: string, depth = 0): React.ReactNode[] {
  const tokens: React.ReactNode[] = [];
  const remaining = text;
  let keyIndex = 0;

  // Pattern matches (in priority order):
  // 1. Math: $...$          2. Images  ![alt](url)
  // 3. Links [text](url)    4. Code `...`
  // 5. Bold **...**         6. Strikethrough ~~...~~
  // 7. Italic *...*  (underscores only, so ~~ and ** cannot be misread)
  const pattern =
    /(\$([^$\n]+?)\$)|(!\[([^\]\n]*)\]\(([^)\n]+)\))|(\[([^\]\n]+)\]\(([^)\n]+)\))|(`([^`\n]+?)`)|(\*\*([^*\n]+?)\*\*)|(~~([^~\n]+?)~~)|(\*([^*\n]+?)\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(remaining)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(remaining.substring(lastIndex, match.index));
    }

    if (match[1] && match[2]) {
      const mathHtml = renderMath(match[2], false);
      tokens.push(
        <span
          key={`m-${keyIndex++}`}
          className="inline-math px-0.5"
          dangerouslySetInnerHTML={{ __html: mathHtml }}
        />
      );
    } else if (match[3] && match[5]) {
      const altText = match[4] || 'Image';
      const imgUrl = match[5];
      tokens.push(
        <span key={`img-${keyIndex++}`} className="inline-block my-2 max-w-full">
          <img
            src={imgUrl}
            alt={altText}
            className="max-h-72 rounded-lg border border-neutral-200 dark:border-neutral-700 object-contain shadow-xs cursor-pointer hover:opacity-95"
            loading="lazy"
            onClick={() => window.open(imgUrl, '_blank')}
          />
          {altText && (
            <span className="block text-[11px] text-neutral-500 dark:text-neutral-400 mt-1 italic">
              {altText}
            </span>
          )}
        </span>
      );
    } else if (match[6] && match[7] && match[8]) {
      tokens.push(
        <a
          key={`link-${keyIndex++}`}
          href={match[8]}
          target="_blank"
          rel="noreferrer"
          className="text-blue-600 dark:text-blue-400 hover:underline font-medium inline-flex items-center gap-0.5"
        >
          {match[7]}
        </a>
      );
    } else if (match[9] && match[10]) {
      tokens.push(
        <code
          key={`c-${keyIndex++}`}
          className="px-1 py-0.5 mx-0.5 rounded bg-neutral-900/[0.07] dark:bg-white/10 text-neutral-900 dark:text-neutral-100 font-mono text-[11px] border border-neutral-200 dark:border-neutral-700/60"
        >
          {match[10]}
        </code>
      );
    } else if (match[11] && match[12]) {
      tokens.push(
        <strong key={`b-${keyIndex++}`} className="font-semibold text-neutral-900 dark:text-white">
          {depth < 3 ? parseInlineContent(match[12], depth + 1) : match[12]}
        </strong>
      );
    } else if (match[13] && match[14]) {
      tokens.push(
        <del key={`s-${keyIndex++}`} className="line-through opacity-70">
          {match[14]}
        </del>
      );
    } else if (match[15] && match[16]) {
      tokens.push(
        <em key={`i-${keyIndex++}`} className="italic text-neutral-800 dark:text-neutral-200">
          {depth < 3 ? parseInlineContent(match[16], depth + 1) : match[16]}
        </em>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < remaining.length) {
    tokens.push(remaining.substring(lastIndex));
  }

  return tokens;
}

/** Callout headings Adom AI is told to use, plus the common equivalents. */
const CALLOUT_RE =
  /^\*\*\s*(Definition|Formula|Theorem|Proof|Key Invariant|Core Invariant|Exam Tip|WASSCE Tip|Exam Note|Note|Important|Warning|Caution|Remember|Summary)\s*:?\s*\*\*\s*:?\s*(.*)$/i;

/** Matches a line that is exactly a callout heading such as "**Definition:**". */
const CALLOUT_HEADING_ONLY_RE =
  /^\*\*\s*(Definition|Formula|Theorem|Proof|Key Invariant|Core Invariant|Exam Tip|WASSCE Tip|Exam Note|Note|Important|Warning|Caution|Remember|Summary)\s*:?\s*\*\*\s*:?\s*$/i;

const LIST_ITEM_RE = /^([-*•]|\d+[.)])\s+(.*)$/;

/**
 * Main parser component that transforms raw markdown with math formulas, tables,
 * science definitions, and code into debloated, beautifully styled React elements.
 */
export const FormattedContent: React.FC<FormattedContentProps> = memo(
  function FormattedContent({ content, className = '', streaming = false }) {
    const elements = useMemo(() => {
      if (!content) return null;

      const clean = stripThinking(content);
      const lines = clean.split('\n');
      const nodes: React.ReactNode[] = [];
      let i = 0;
      let nodeKey = 0;

      while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();

        // 0. While streaming, an unterminated opening fence belongs to the answer still
        //    arriving: render it as a code block in progress instead of a stray ``` line.
        const isOpenFence = trimmed.startsWith('```') && trimmed.replace(/```/g, '').length > 0;
        const closesFence = (from: number) => {
          for (let k = from; k < lines.length; k++) {
            if (lines[k].trim().startsWith('```')) return k;
          }
          return -1;
        };

        // 1. Block Math: $$ ... $$
        if (trimmed.startsWith('$$')) {
          let mathContent = '';
          if (trimmed.endsWith('$$') && trimmed.length > 2) {
            mathContent = trimmed.slice(2, -2);
            i++;
          } else {
            mathContent = trimmed.slice(2);
            i++;
            while (i < lines.length && !lines[i].trim().endsWith('$$')) {
              mathContent += '\n' + lines[i];
              i++;
            }
            if (i < lines.length) {
              mathContent += '\n' + lines[i].trim().replace(/\$\$$/, '');
              i++;
            }
          }
          const rendered = renderMath(mathContent, true);
          nodes.push(
            <div
              key={`block-math-${nodeKey++}`}
              className="my-3 py-2 px-3 overflow-x-auto text-center rounded-lg bg-white/60 dark:bg-white/5 border border-neutral-500/10 dark:border-white/10"
              dangerouslySetInnerHTML={{ __html: rendered }}
            />
          );
          continue;
        }

        // 2. Fenced Code Block: ```lang ... ```
        if (trimmed.startsWith('```')) {
          const language = trimmed.slice(3).trim();
          i++;
          const codeLines: string[] = [];
          while (i < lines.length && !lines[i].trim().startsWith('```')) {
            codeLines.push(lines[i]);
            i++;
          }
          if (i < lines.length) i++; // Skip closing ```
          nodes.push(
            <CodeBlock
              key={`code-block-${nodeKey++}`}
              language={language}
              code={codeLines.join('\n')}
            />
          );
          continue;
        }
        // While streaming the closing fence has not arrived yet: show the code so far.
        if (streaming && isOpenFence && closesFence(i) === -1) {
          const language = trimmed.slice(3).trim();
          i++;
          const codeLines: string[] = [];
          while (i < lines.length) {
            codeLines.push(lines[i]);
            i++;
          }
          nodes.push(
            <CodeBlock key={`code-block-${nodeKey++}`} language={language} code={codeLines.join('\n')} />
          );
          continue;
        }

        // Standalone Image: ![alt](url)
        const imageBlockMatch = trimmed.match(/^!\[([^\]\n]*)\]\(([^)\n]+)\)$/);
        if (imageBlockMatch) {
          const altText = imageBlockMatch[1] || 'Image';
          const imgUrl = imageBlockMatch[2];
          nodes.push(
            <figure key={`fig-${nodeKey++}`} className="my-4 flex flex-col items-center">
              <img
                src={imgUrl}
                alt={altText}
                className="max-h-96 w-auto max-w-full rounded-xl border border-neutral-500/15 dark:border-white/10 shadow-sm object-contain cursor-zoom-in"
                loading="lazy"
                onClick={() => window.open(imgUrl, '_blank')}
              />
              {altText && (
                <figcaption className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-2 text-center italic">
                  {altText}
                </figcaption>
              )}
            </figure>
          );
          i++;
          continue;
        }

        // 3. Headings
        if (trimmed.startsWith('### ')) {
          nodes.push(
            <h4
              key={`h3-${nodeKey++}`}
              className="text-xs font-bold text-neutral-900 dark:text-white uppercase tracking-wider mt-3.5 mb-1.5"
            >
              {parseInlineContent(trimmed.slice(4))}
            </h4>
          );
          i++;
          continue;
        }
        if (trimmed.startsWith('## ')) {
          nodes.push(
            <h3
              key={`h2-${nodeKey++}`}
              className="text-sm font-bold text-neutral-900 dark:text-white mt-4 mb-2 pb-1 border-b border-neutral-500/10 dark:border-white/10"
            >
              {parseInlineContent(trimmed.slice(3))}
            </h3>
          );
          i++;
          continue;
        }
        if (trimmed.startsWith('# ')) {
          nodes.push(
            <h2
              key={`h1-${nodeKey++}`}
              className="text-sm font-black text-neutral-900 dark:text-white mt-4 mb-2 pb-1 border-b border-neutral-500/15 dark:border-white/10"
            >
              {parseInlineContent(trimmed.slice(2))}
            </h2>
          );
          i++;
          continue;
        }

        // 4. Markdown Table: lines with |
        if (trimmed.startsWith('|') && trimmed.includes('|', 1)) {
          const tableLines: string[] = [];
          while (
            i < lines.length &&
            lines[i].trim().startsWith('|') &&
            lines[i].trim().includes('|', 1)
          ) {
            tableLines.push(lines[i].trim());
            i++;
          }

          if (tableLines.length >= 2) {
            const splitRow = (row: string) =>
              row
                .replace(/^\|/, '')
                .replace(/\|$/, '')
                .split('|')
                .map((c) => c.trim());

            const headerCols = splitRow(tableLines[0]);
            // Line 1 may be the separator |---|---| (or the stream may not have reached it).
            const isSeparator = /^\|?(\s*:?-{2,}:?\s*\|?)+$/.test(tableLines[1]);
            const bodyRows = (isSeparator ? tableLines.slice(2) : tableLines.slice(1)).map(splitRow);

            nodes.push(
              <div
                key={`table-${nodeKey++}`}
                className="my-3 overflow-x-auto rounded-lg border border-neutral-500/15 dark:border-white/10"
              >
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-neutral-900/[0.07] dark:bg-white/10 border-b border-neutral-200 dark:border-neutral-700">
                      {headerCols.map((h, colIdx) => (
                        <th
                          key={colIdx}
                          className="px-3 py-2 font-semibold text-neutral-900 dark:text-white align-top"
                        >
                          {parseInlineContent(h)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {bodyRows.map((cols, rowIdx) => (
                      <tr
                        key={rowIdx}
                        className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors"
                      >
                        {cols.map((c, colIdx) => (
                          <td
                            key={colIdx}
                            className="px-3 py-2 text-neutral-700 dark:text-neutral-300 align-top"
                          >
                            {parseInlineContent(c)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
            continue;
          }
        }

        // 5. Academic Callout Cards.
        //    Handle both "**Definition:** text" and the two-line form where the model puts
        //    the heading on its own line and the body underneath.
        const calloutMatch = trimmed.match(CALLOUT_RE);
        if (calloutMatch) {
          let type = calloutMatch[1];
          let body = calloutMatch[2].trim();
          i++;
          if (!body) {
            const bodyLines: string[] = [];
            while (i < lines.length && lines[i].trim() && !LIST_ITEM_RE.test(lines[i].trim())) {
              if (CALLOUT_HEADING_ONLY_RE.test(lines[i].trim())) break;
              bodyLines.push(lines[i].trim());
              i++;
            }
            body = bodyLines.join(' ');
          }
          nodes.push(
            <div
              key={`callout-${nodeKey++}`}
              className="my-2.5 p-3 rounded-lg border-l-2 border-neutral-900 dark:border-white bg-neutral-50 dark:bg-neutral-800/50 text-xs space-y-1"
            >
              <span className="font-mono text-[11px] font-bold text-neutral-900 dark:text-white uppercase tracking-wider block">
                {type}
              </span>
              {body ? (
                <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                  {parseInlineContent(body)}
                </p>
              ) : null}
            </div>
          );
          continue;
        }

        // 6. Blockquote
        if (trimmed.startsWith('> ')) {
          nodes.push(
            <blockquote
              key={`quote-${nodeKey++}`}
              className="my-2 pl-3 border-l-2 border-neutral-500/25 dark:border-white/20 italic text-neutral-600 dark:text-neutral-400 text-xs"
            >
              {parseInlineContent(trimmed.slice(2))}
            </blockquote>
          );
          i++;
          continue;
        }

        // 7. Bullet or Ordered Lists (ordered lists keep their real starting number,
        //    and a hard-wrapped line continues the item above it)
        const bulletMatch = trimmed.match(LIST_ITEM_RE);
        if (bulletMatch) {
          const isOrdered = /^\d+[.)]$/.test(bulletMatch[1]);
          const startNumber = isOrdered ? parseInt(bulletMatch[1], 10) : 0;
          const listItems: string[] = [];

          while (i < lines.length) {
            const raw = lines[i];
            const l = raw.trim();
            if (!l) {
              // A blank line ends the list unless another item follows it.
              if (LIST_ITEM_RE.test(lines[i + 1]?.trim() || '')) {
                i++;
                continue;
              }
              break;
            }
            const m = l.match(LIST_ITEM_RE);
            if (m) {
              listItems.push(m[2]);
              i++;
            } else if (!l.startsWith('```') && !l.startsWith('$$') && !l.startsWith('|')) {
              // Wrapped continuation of the previous item (common in streamed answers).
              listItems[listItems.length - 1] += ' ' + l;
              i++;
            } else {
              break;
            }
          }

          nodes.push(
            <div key={`list-${nodeKey++}`} className="my-2 space-y-1 pl-1">
              {listItems.map((item, itemIdx) => (
                <div
                  key={itemIdx}
                  className="flex items-start gap-2 text-xs leading-relaxed text-neutral-800 dark:text-neutral-200"
                >
                  <span className="font-mono text-[11px] text-neutral-400 shrink-0 mt-0.5 tabular-nums">
                    {isOrdered ? `${startNumber + itemIdx}.` : '•'}
                  </span>
                  <span className="flex-1 min-w-0">{parseInlineContent(item)}</span>
                </div>
              ))}
            </div>
          );
          continue;
        }

        // 8. Empty lines
        if (!trimmed) {
          i++;
          continue;
        }

        // 9. Standard Paragraph
        nodes.push(
          <p
            key={`p-${nodeKey++}`}
            className="my-1.5 leading-relaxed text-xs text-neutral-800 dark:text-neutral-200 break-words"
          >
            {parseInlineContent(trimmed)}
          </p>
        );
        i++;
      }

      return nodes;
    }, [content, streaming]);

    return <div className={`formatted-academic-content ${className}`}>{elements}</div>;
  }
);
