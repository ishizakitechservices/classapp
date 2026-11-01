/**
 * Renders FormattedContent with react-dom/server and checks the output for the bugs that
 * were reported: raw ** bold, swallowed text, broken tables, lost list numbers.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FormattedContent } from '../src/components/FormattedContent.tsx';

const cases: Array<{ name: string; input: string; streaming?: boolean; expect: RegExp[]; reject?: RegExp[] }> = [
  {
    name: 'callout with body on same line',
    input: '**Definition:** Photosynthesis is the process plants use to make food.',
    expect: [/Definition/i, /Photosynthesis is the process/],
    reject: [/\*\*/],
  },
  {
    name: 'callout heading alone, body on next line',
    input: '**Definition:**\nPhotosynthesis is the process plants use to make food.',
    expect: [/Definition/i, /Photosynthesis is the process/],
    reject: [/\*\*/],
  },
  {
    name: 'bold does not swallow following text',
    input: 'The answer is **bold text** and then normal text continues.',
    expect: [/<strong[^>]*>bold text<\/strong>/, /normal text continues/],
    reject: [/\*\*/],
  },
  {
    name: 'ordered list keeps real numbering from 3',
    input: '3. Third step\n4. Fourth step',
    expect: [/>3\.</, />4\.</],
  },
  {
    name: 'table renders without trailing pipe',
    input: '| Element | Symbol |\n|---|---|\n| Oxygen | O |',
    expect: [/<table/, /Element/, /Symbol/, /Oxygen/],
    reject: [/<td[^>]*>\|/],
  },
  {
    name: 'streaming: unterminated fence renders as code, not stray backticks',
    input: 'Try this:\n```python\nprint("hi")',
    streaming: true,
    expect: [/<pre/, /print\(&quot;hi&quot;\)|print\("hi"\)/],
    reject: [/```/],
  },
  {
    name: 'block math renders via KaTeX',
    input: '$$E = mc^2$$',
    expect: [/katex/],
  },
  {
    name: 'inline math inside a bullet',
    input: '- Force is $F = ma$ for constant mass',
    expect: [/katex/, /Force is/],
  },
  {
    name: 'half-written bold during streaming stays literal, no data loss',
    input: 'This is **half writ',
    streaming: true,
    expect: [/half writ/],
  },
];

let failures = 0;
for (const c of cases) {
  const html = renderToStaticMarkup(
    React.createElement(FormattedContent, { content: c.input, streaming: c.streaming })
  );
  const missed = c.expect.filter((re) => !re.test(html));
  const leaked = (c.reject || []).filter((re) => re.test(html));
  const ok = missed.length === 0 && leaked.length === 0;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}`);
  if (!ok) {
    if (missed.length) console.log('   missing:', missed.map(String));
    if (leaked.length) console.log('   leaked:', leaked.map(String));
    console.log('   html:', html.slice(0, 400));
  }
}
console.log(failures === 0 ? '\nAll render checks passed.' : `\n${failures} render check(s) failed.`);
