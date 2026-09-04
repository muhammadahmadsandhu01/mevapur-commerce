'use client';

import React from 'react';
import Link from 'next/link';
import { getSafeNavigationUrl } from '@/lib/navigation';

interface SafeContentRendererProps {
  content?: string | null;
  className?: string;
}

/**
 * Parses inline formatting: **bold**, *italic*, `code`, and [text](url)
 */
function renderInlineContent(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Regex to match links [text](url), bold **bold**, italic *italic*, code `code`
  const inlineRegex = /(\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = inlineRegex.exec(text)) !== null) {
    // Text before match
    if (match.index > lastIndex) {
      nodes.push(text.substring(lastIndex, match.index));
    }

    const [fullMatch, , linkText, linkUrl, boldText, italicText, codeText] = match;

    if (linkText && linkUrl) {
      const safeNav = getSafeNavigationUrl(linkUrl);
      if (safeNav) {
        if (safeNav.isExternal || safeNav.isAction) {
          nodes.push(
            <a
              key={`link-${match.index}`}
              href={safeNav.url}
              target={safeNav.target}
              rel={safeNav.rel}
              className="font-medium text-[#b45309] underline hover:text-[#9a3412] focus:outline-none focus:ring-1 focus:ring-[#b45309]"
            >
              {linkText}
            </a>
          );
        } else {
          nodes.push(
            <Link
              key={`link-${match.index}`}
              href={safeNav.url}
              className="font-medium text-[#b45309] underline hover:text-[#9a3412] focus:outline-none focus:ring-1 focus:ring-[#b45309]"
            >
              {linkText}
            </Link>
          );
        }
      } else {
        // Unsafe link: render linkText as plain escaped text
        nodes.push(linkText);
      }
    } else if (boldText) {
      nodes.push(<strong key={`bold-${match.index}`} className="font-bold text-[#0b132b]">{boldText}</strong>);
    } else if (italicText) {
      nodes.push(<em key={`italic-${match.index}`} className="italic text-slate-800">{italicText}</em>);
    } else if (codeText) {
      nodes.push(
        <code
          key={`code-${match.index}`}
          className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800 border border-slate-200"
        >
          {codeText}
        </code>
      );
    } else {
      nodes.push(fullMatch);
    }

    lastIndex = inlineRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.substring(lastIndex));
  }

  return nodes.length > 0 ? nodes : [text];
}

/**
 * Safe, robust structured text and markdown renderer.
 * Outputs pure semantic React JSX elements with zero dangerouslySetInnerHTML.
 */
export default function SafeContentRenderer({
  content,
  className = '',
}: SafeContentRendererProps) {
  if (!content || typeof content !== 'string') {
    return null;
  }

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];

  let currentList: { type: 'ul' | 'ol'; items: string[] } | null = null;
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];

  const flushList = () => {
    if (!currentList) return;
    const ListTag = currentList.type;
    const listIndex = elements.length;
    elements.push(
      <ListTag
        key={`list-${listIndex}`}
        className={`my-4 pl-6 text-base text-slate-800 leading-relaxed ${
          currentList.type === 'ul' ? 'list-disc' : 'list-decimal'
        }`}
      >
        {currentList.items.map((item, idx) => (
          <li key={`item-${idx}`} className="mb-1.5">
            {renderInlineContent(item)}
          </li>
        ))}
      </ListTag>
    );
    currentList = null;
  };

  const flushCodeBlock = () => {
    if (codeBlockLines.length === 0) return;
    const blockIndex = elements.length;
    elements.push(
      <pre
        key={`codeblock-${blockIndex}`}
        className="my-5 overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs font-mono text-slate-100 border border-slate-800"
      >
        <code>{codeBlockLines.join('\n')}</code>
      </pre>
    );
    codeBlockLines = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Code block toggle ```
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        flushCodeBlock();
        inCodeBlock = false;
      } else {
        flushList();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(rawLine);
      continue;
    }

    // Empty line separates blocks
    if (!trimmed) {
      flushList();
      continue;
    }

    // Headings
    if (trimmed.startsWith('# ')) {
      flushList();
      elements.push(
        <h1 key={`h1-${i}`} className="mt-8 mb-4 text-2xl font-bold tracking-tight text-[#0b132b] sm:text-3xl">
          {renderInlineContent(trimmed.slice(2))}
        </h1>
      );
      continue;
    }

    if (trimmed.startsWith('## ')) {
      flushList();
      elements.push(
        <h2 key={`h2-${i}`} className="mt-7 mb-3 text-xl font-bold tracking-tight text-[#0b132b] sm:text-2xl">
          {renderInlineContent(trimmed.slice(3))}
        </h2>
      );
      continue;
    }

    if (trimmed.startsWith('### ')) {
      flushList();
      elements.push(
        <h3 key={`h3-${i}`} className="mt-6 mb-2 text-lg font-bold text-[#0b132b] sm:text-xl">
          {renderInlineContent(trimmed.slice(4))}
        </h3>
      );
      continue;
    }

    if (trimmed.startsWith('#### ')) {
      flushList();
      elements.push(
        <h4 key={`h4-${i}`} className="mt-5 mb-2 text-base font-bold text-[#0b132b]">
          {renderInlineContent(trimmed.slice(5))}
        </h4>
      );
      continue;
    }

    // Blockquotes
    if (trimmed.startsWith('> ')) {
      flushList();
      elements.push(
        <blockquote
          key={`quote-${i}`}
          className="my-4 border-l-4 border-[#b45309] bg-amber-50/50 py-2.5 px-4 text-slate-800 italic rounded-r"
        >
          {renderInlineContent(trimmed.slice(2))}
        </blockquote>
      );
      continue;
    }

    // Unordered list items: - or *
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!currentList || currentList.type !== 'ul') {
        flushList();
        currentList = { type: 'ul', items: [] };
      }
      currentList.items.push(trimmed.slice(2));
      continue;
    }

    // Ordered list items: 1. 2. etc
    const olMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (olMatch) {
      if (!currentList || currentList.type !== 'ol') {
        flushList();
        currentList = { type: 'ol', items: [] };
      }
      currentList.items.push(olMatch[2]);
      continue;
    }

    // Standard paragraph
    flushList();
    elements.push(
      <p key={`p-${i}`} className="my-3 text-base leading-7 text-slate-800">
        {renderInlineContent(rawLine)}
      </p>
    );
  }

  flushList();
  if (inCodeBlock) flushCodeBlock();

  return (
    <div className={`prose prose-slate max-w-none ${className}`}>
      {elements}
    </div>
  );
}
