/**
 * Lightweight renderer for DOCX content converted by mammoth.
 * No dangerouslySetInnerHTML: HTML from mammoth is parsed into React elements.
 * Styling lives in `.docx-content` (index.css) so the page can pick a reading
 * theme and a text size without the component knowing about either.
 */
import React from 'react';

const ALLOWED_TAGS = new Set([
  'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'STRONG', 'B', 'EM', 'I', 'U', 'UL', 'OL', 'LI',
  'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'BR', 'SECTION', 'DIV', 'A', 'BLOCKQUOTE', 'HR',
]);

function toReact(node: ChildNode, key: string): React.ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;

  if (node.nodeType !== Node.ELEMENT_NODE) return null;

  const el = node as HTMLElement;
  const tag = el.tagName;

  if (!ALLOWED_TAGS.has(tag)) {
    const inner = Array.from(el.childNodes).map((child, i) => toReact(child, `${key}-${i}`));
    return <React.Fragment key={key}>{inner.length ? inner : el.textContent}</React.Fragment>;
  }

  // Void elements: must have no children.
  if (tag === 'BR' || tag === 'HR') return React.createElement(tag.toLowerCase(), { key });

  const children = Array.from(el.childNodes).map((child, i) => toReact(child, `${key}-${i}`));
  const Tag = tag.toLowerCase();

  const common: Record<string, unknown> = { key };
  if (tag === 'A') {
    common.href = (el as HTMLAnchorElement).getAttribute('href') || '#';
    common.target = '_blank';
    common.rel = 'noopener noreferrer';
  }

  return React.createElement(Tag, common, children);
}

export const OfficeContent: React.FC<{ html: string; readingTheme?: string }> = ({ html }) => {
  const nodes = React.useMemo(() => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return Array.from(doc.body.childNodes).map((child, i) => toReact(child, `n-${i}`));
  }, [html]);

  return <div className="docx-content">{nodes}</div>;
};
