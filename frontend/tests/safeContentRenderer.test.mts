import { describe, test, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SafeContentRendererComponent from '../src/components/content/SafeContentRenderer.tsx';

const SafeContentRenderer = (
  typeof SafeContentRendererComponent === 'function'
    ? SafeContentRendererComponent
    : (SafeContentRendererComponent as unknown as { default: React.ComponentType<{ content?: string | null; className?: string }> }).default
) as React.ComponentType<{ content?: string | null; className?: string }>;

describe('SafeContentRenderer Custom Structured Markdown Parser Contracts', () => {
  test('returns null for empty, undefined or null content', () => {
    expect(renderToStaticMarkup(React.createElement(SafeContentRenderer, { content: null }))).toBe('');
    expect(renderToStaticMarkup(React.createElement(SafeContentRenderer, { content: undefined }))).toBe('');
    expect(renderToStaticMarkup(React.createElement(SafeContentRenderer, { content: '' }))).toBe('');
  });

  test('renders semantic headings (h1, h2, h3, h4)', () => {
    const markdown = '# Main Heading\n## Secondary Heading\n### Tertiary Heading\n#### Quaternary Heading';
    const html = renderToStaticMarkup(React.createElement(SafeContentRenderer, { content: markdown }));

    expect(html.includes('<h1')).toBe(true);
    expect(html.includes('Main Heading</h1>')).toBe(true);
    expect(html.includes('<h2')).toBe(true);
    expect(html.includes('Secondary Heading</h2>')).toBe(true);
    expect(html.includes('<h3')).toBe(true);
    expect(html.includes('Tertiary Heading</h3>')).toBe(true);
    expect(html.includes('<h4')).toBe(true);
    expect(html.includes('Quaternary Heading</h4>')).toBe(true);
  });

  test('renders blockquotes with amber styling', () => {
    const markdown = '> Important notice: Organic harvest is certified non-GMO.';
    const html = renderToStaticMarkup(React.createElement(SafeContentRenderer, { content: markdown }));

    expect(html.includes('<blockquote')).toBe(true);
    expect(html.includes('Important notice: Organic harvest is certified non-GMO.</blockquote>')).toBe(true);
  });

  test('renders code blocks inside <pre><code>', () => {
    const markdown = '```\nconst store = "MevaPur";\nconsole.log(store);\n```';
    const html = renderToStaticMarkup(React.createElement(SafeContentRenderer, { content: markdown }));

    expect(html.includes('<pre')).toBe(true);
    expect(html.includes('<code')).toBe(true);
    expect(html.includes('const store = &quot;MevaPur&quot;;')).toBe(true);
  });

  test('renders unordered lists from - and * items', () => {
    const markdown = '- Premium Almonds\n- Walnuts\n* Dried Figs';
    const html = renderToStaticMarkup(React.createElement(SafeContentRenderer, { content: markdown }));

    expect(html.includes('<ul')).toBe(true);
    expect(html.includes('<li class="mb-1.5">Premium Almonds</li>')).toBe(true);
    expect(html.includes('<li class="mb-1.5">Walnuts</li>')).toBe(true);
    expect(html.includes('<li class="mb-1.5">Dried Figs</li>')).toBe(true);
  });

  test('renders ordered lists from 1. 2. items', () => {
    const markdown = '1. Select fresh dry fruits\n2. Add to cart\n3. Complete secure checkout';
    const html = renderToStaticMarkup(React.createElement(SafeContentRenderer, { content: markdown }));

    expect(html.includes('<ol')).toBe(true);
    expect(html.includes('<li class="mb-1.5">Select fresh dry fruits</li>')).toBe(true);
    expect(html.includes('<li class="mb-1.5">Add to cart</li>')).toBe(true);
    expect(html.includes('<li class="mb-1.5">Complete secure checkout</li>')).toBe(true);
  });

  test('renders inline formatting (bold, italic, inline code)', () => {
    const markdown = 'This is **bold text**, this is *italic text*, and this is `code snippet`.';
    const html = renderToStaticMarkup(React.createElement(SafeContentRenderer, { content: markdown }));

    expect(html.includes('<strong class="font-bold text-[#0b132b]">bold text</strong>')).toBe(true);
    expect(html.includes('<em class="italic text-slate-800">italic text</em>')).toBe(true);
    expect(html.includes('<code class="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800 border border-slate-200">code snippet</code>')).toBe(true);
  });

  test('renders safe internal links with Next.js navigation and safe external links with security attributes', () => {
    const markdown = 'Visit our [Catalogue](/products) or read [External Guide](https://example.com/guide).';
    const html = renderToStaticMarkup(React.createElement(SafeContentRenderer, { content: markdown }));

    expect(html.includes('href="/products"')).toBe(true);
    expect(html.includes('Catalogue</a>')).toBe(true);
    expect(html.includes('href="https://example.com/guide"')).toBe(true);
    expect(html.includes('target="_blank"')).toBe(true);
    expect(html.includes('rel="noopener noreferrer"')).toBe(true);
  });

  test('renders safe mailto: and tel: contact action links', () => {
    const markdown = 'Contact us at [support@mevapur.com](mailto:support@mevapur.com) or [Call](tel:+923001234567).';
    const html = renderToStaticMarkup(React.createElement(SafeContentRenderer, { content: markdown }));

    expect(html.includes('href="mailto:support@mevapur.com"')).toBe(true);
    expect(html.includes('href="tel:+923001234567"')).toBe(true);
  });

  test('strictly neutralizes dangerous link schemes (javascript:, data:, vbscript:, //) to safe plain text', () => {
    const markdown = 'Click [Malicious](javascript:alert(document.cookie)) or [XSS](data:text/html;base64,PHNjcmlwdD4=) or [Protocol Relative](//evil.com).';
    const html = renderToStaticMarkup(React.createElement(SafeContentRenderer, { content: markdown }));

    expect(html.includes('javascript:')).toBe(false);
    expect(html.includes('data:text/html')).toBe(false);
    expect(html.includes('href="//evil.com"')).toBe(false);
    expect(html.includes('Malicious')).toBe(true);
    expect(html.includes('XSS')).toBe(true);
  });

  test('safely escapes raw HTML injection attempts without executing scripts or injecting tags', () => {
    const markdown = '<script>alert(1)</script>\n<img src="x" onerror="alert(2)" />\n<div onclick="evil()">text</div>';
    const html = renderToStaticMarkup(React.createElement(SafeContentRenderer, { content: markdown }));

    expect(html.includes('<script>')).toBe(false);
    expect(html.includes('<img')).toBe(false);
    expect(html.includes('<div onclick')).toBe(false);
    expect(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;')).toBe(true);
    expect(html.includes('&lt;img src=&quot;x&quot; onerror=&quot;alert(2)&quot; /&gt;')).toBe(true);
    expect(html.includes('&lt;div onclick=&quot;evil()&quot;&gt;text&lt;/div&gt;')).toBe(true);
  });

  test('handles malformed / unclosed formatting gracefully without breaking', () => {
    const unclosedBold = 'Here is **unclosed bold without pair';
    const htmlBold = renderToStaticMarkup(React.createElement(SafeContentRenderer, { content: unclosedBold }));
    expect(htmlBold.includes('Here is **unclosed bold without pair')).toBe(true);

    const unclosedCode = 'Here is `unclosed code without pair';
    const htmlCode = renderToStaticMarkup(React.createElement(SafeContentRenderer, { content: unclosedCode }));
    expect(htmlCode.includes('Here is `unclosed code without pair')).toBe(true);

    const unclosedLink = 'Here is [unclosed link without pair';
    const htmlLink = renderToStaticMarkup(React.createElement(SafeContentRenderer, { content: unclosedLink }));
    expect(htmlLink.includes('Here is [unclosed link without pair')).toBe(true);
  });

  test('processes large bounded input (500 lines) deterministically and quickly', () => {
    const lines: string[] = [];
    for (let i = 0; i < 500; i++) {
      if (i % 5 === 0) lines.push(`## Section ${i}`);
      else if (i % 5 === 1) lines.push(`Paragraph ${i} with **bold** and *italic* and [link](/products/${i}).`);
      else if (i % 5 === 2) lines.push(`- Item ${i}A\n- Item ${i}B`);
      else if (i % 5 === 3) lines.push(`> Blockquote notice ${i}`);
      else lines.push(`1. Step ${i}\n2. Step ${i + 1}`);
    }

    const t0 = performance.now();
    const html = renderToStaticMarkup(React.createElement(SafeContentRenderer, { content: lines.join('\n') }));
    const duration = performance.now() - t0;

    expect(duration < 500).toBe(true);
    expect(html.includes('Section 0')).toBe(true);
    expect(html.includes('Section 495')).toBe(true);
  });
});
