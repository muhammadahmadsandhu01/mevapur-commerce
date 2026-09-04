import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
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
    assert.equal(renderToStaticMarkup(React.createElement(SafeContentRenderer, { content: null })), '');
    assert.equal(renderToStaticMarkup(React.createElement(SafeContentRenderer, { content: undefined })), '');
    assert.equal(renderToStaticMarkup(React.createElement(SafeContentRenderer, { content: '' })), '');
  });

  test('renders semantic headings (h1, h2, h3, h4)', () => {
    const markdown = '# Main Heading\n## Secondary Heading\n### Tertiary Heading\n#### Quaternary Heading';
    const html = renderToStaticMarkup(React.createElement(SafeContentRenderer, { content: markdown }));

    assert.ok(html.includes('<h1'), 'Should contain <h1>');
    assert.ok(html.includes('Main Heading</h1>'), 'Should contain Main Heading text');
    assert.ok(html.includes('<h2'), 'Should contain <h2>');
    assert.ok(html.includes('Secondary Heading</h2>'), 'Should contain Secondary Heading text');
    assert.ok(html.includes('<h3'), 'Should contain <h3>');
    assert.ok(html.includes('Tertiary Heading</h3>'), 'Should contain Tertiary Heading text');
    assert.ok(html.includes('<h4'), 'Should contain <h4>');
    assert.ok(html.includes('Quaternary Heading</h4>'), 'Should contain Quaternary Heading text');
  });

  test('renders blockquotes with amber styling', () => {
    const markdown = '> Important notice: Organic harvest is certified non-GMO.';
    const html = renderToStaticMarkup(React.createElement(SafeContentRenderer, { content: markdown }));

    assert.ok(html.includes('<blockquote'), 'Should render <blockquote>');
    assert.ok(html.includes('Important notice: Organic harvest is certified non-GMO.</blockquote>'));
  });

  test('renders code blocks inside <pre><code>', () => {
    const markdown = '```\nconst store = "MevaPur";\nconsole.log(store);\n```';
    const html = renderToStaticMarkup(React.createElement(SafeContentRenderer, { content: markdown }));

    assert.ok(html.includes('<pre'), 'Should render <pre>');
    assert.ok(html.includes('<code'), 'Should render <code>');
    assert.ok(html.includes('const store = &quot;MevaPur&quot;;'));
  });

  test('renders unordered lists from - and * items', () => {
    const markdown = '- Premium Almonds\n- Walnuts\n* Dried Figs';
    const html = renderToStaticMarkup(React.createElement(SafeContentRenderer, { content: markdown }));

    assert.ok(html.includes('<ul'), 'Should render <ul>');
    assert.ok(html.includes('<li class="mb-1.5">Premium Almonds</li>'));
    assert.ok(html.includes('<li class="mb-1.5">Walnuts</li>'));
    assert.ok(html.includes('<li class="mb-1.5">Dried Figs</li>'));
  });

  test('renders ordered lists from 1. 2. items', () => {
    const markdown = '1. Select fresh dry fruits\n2. Add to cart\n3. Complete secure checkout';
    const html = renderToStaticMarkup(React.createElement(SafeContentRenderer, { content: markdown }));

    assert.ok(html.includes('<ol'), 'Should render <ol>');
    assert.ok(html.includes('<li class="mb-1.5">Select fresh dry fruits</li>'));
    assert.ok(html.includes('<li class="mb-1.5">Add to cart</li>'));
    assert.ok(html.includes('<li class="mb-1.5">Complete secure checkout</li>'));
  });

  test('renders inline formatting (bold, italic, inline code)', () => {
    const markdown = 'This is **bold text**, this is *italic text*, and this is `code snippet`.';
    const html = renderToStaticMarkup(React.createElement(SafeContentRenderer, { content: markdown }));

    assert.ok(html.includes('<strong class="font-bold text-[#0b132b]">bold text</strong>'));
    assert.ok(html.includes('<em class="italic text-slate-800">italic text</em>'));
    assert.ok(html.includes('<code class="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800 border border-slate-200">code snippet</code>'));
  });

  test('renders safe internal links with Next.js navigation and safe external links with security attributes', () => {
    const markdown = 'Visit our [Catalogue](/products) or read [External Guide](https://example.com/guide).';
    const html = renderToStaticMarkup(React.createElement(SafeContentRenderer, { content: markdown }));

    assert.ok(html.includes('href="/products"'));
    assert.ok(html.includes('Catalogue</a>'));
    assert.ok(html.includes('href="https://example.com/guide"'));
    assert.ok(html.includes('target="_blank"'));
    assert.ok(html.includes('rel="noopener noreferrer"'));
  });

  test('renders safe mailto: and tel: contact action links', () => {
    const markdown = 'Contact us at [support@mevapur.com](mailto:support@mevapur.com) or [Call](tel:+923001234567).';
    const html = renderToStaticMarkup(React.createElement(SafeContentRenderer, { content: markdown }));

    assert.ok(html.includes('href="mailto:support@mevapur.com"'));
    assert.ok(html.includes('href="tel:+923001234567"'));
  });

  test('strictly neutralizes dangerous link schemes (javascript:, data:, vbscript:, //) to safe plain text', () => {
    const markdown = 'Click [Malicious](javascript:alert(document.cookie)) or [XSS](data:text/html;base64,PHNjcmlwdD4=) or [Protocol Relative](//evil.com).';
    const html = renderToStaticMarkup(React.createElement(SafeContentRenderer, { content: markdown }));

    assert.ok(!html.includes('javascript:'), 'javascript: must not appear in HTML');
    assert.ok(!html.includes('data:text/html'), 'data: scheme must not appear in HTML');
    assert.ok(!html.includes('href="//evil.com"'), 'protocol relative must not appear in href');
    assert.ok(html.includes('Malicious'), 'Link text must be safely preserved as text');
    assert.ok(html.includes('XSS'), 'Link text must be safely preserved as text');
  });

  test('safely escapes raw HTML injection attempts without executing scripts or injecting tags', () => {
    const markdown = '<script>alert(1)</script>\n<img src="x" onerror="alert(2)" />\n<div onclick="evil()">text</div>';
    const html = renderToStaticMarkup(React.createElement(SafeContentRenderer, { content: markdown }));

    assert.ok(!html.includes('<script>'), '<script> must not be rendered as HTML element');
    assert.ok(!html.includes('<img'), '<img> must not be rendered as HTML element');
    assert.ok(!html.includes('<div onclick'), '<div onclick> must not be rendered as unescaped HTML element');
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'Raw script must be escaped entity text');
    assert.ok(html.includes('&lt;img src=&quot;x&quot; onerror=&quot;alert(2)&quot; /&gt;'), 'Raw img must be escaped entity text');
    assert.ok(html.includes('&lt;div onclick=&quot;evil()&quot;&gt;text&lt;/div&gt;'), 'Raw div must be escaped entity text');
  });

  test('handles malformed / unclosed formatting gracefully without breaking', () => {
    const unclosedBold = 'Here is **unclosed bold without pair';
    const htmlBold = renderToStaticMarkup(React.createElement(SafeContentRenderer, { content: unclosedBold }));
    assert.ok(htmlBold.includes('Here is **unclosed bold without pair'));

    const unclosedCode = 'Here is `unclosed code without pair';
    const htmlCode = renderToStaticMarkup(React.createElement(SafeContentRenderer, { content: unclosedCode }));
    assert.ok(htmlCode.includes('Here is `unclosed code without pair'));

    const unclosedLink = 'Here is [unclosed link without pair';
    const htmlLink = renderToStaticMarkup(React.createElement(SafeContentRenderer, { content: unclosedLink }));
    assert.ok(htmlLink.includes('Here is [unclosed link without pair'));
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

    assert.ok(duration < 500, `Large render took ${duration}ms, must be < 500ms`);
    assert.ok(html.includes('Section 0'));
    assert.ok(html.includes('Section 495'));
  });
});
