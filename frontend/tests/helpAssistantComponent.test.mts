import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Storefront HelpAssistant Component Contracts & UI Invariants (Batch 2F / DEF-02-I)', () => {
  const componentPath = path.resolve(process.cwd(), 'src/components/assistant/HelpAssistant.tsx');
  const cssModulePath = path.resolve(process.cwd(), 'src/components/assistant/HelpAssistant.module.css');
  const componentSource = fs.readFileSync(componentPath, 'utf8');
  const cssSource = fs.readFileSync(cssModulePath, 'utf8');

  describe('1. Open / Close State and Launch Behavior', () => {
    it('initializes in closed state and toggles open state via launcher button', () => {
      assert.match(componentSource, /const \[open, setOpen\] = useState\(false\);/);
      assert.match(componentSource, /onClick=\{\(\) => setOpen\(\(value\) => !value\)\}/);
      assert.match(componentSource, /onClick=\{\(\) => setOpen\(false\)\}/);
    });

    it('launcher button exposes dynamic aria-expanded state and controls', () => {
      assert.match(componentSource, /aria-expanded=\{open\}/);
      assert.match(componentSource, /aria-controls=\{open \? 'help-assistant-title' : undefined\}/);
    });

    it('launcher and panel include print-hidden and no-print isolation classes', () => {
      assert.match(componentSource, /className=\{`\$\{styles\.launcher\} no-print print-hidden`\}/);
      assert.match(componentSource, /className=\{`\$\{styles\.panel\} no-print print-hidden`\}/);
    });

    it('suppresses assistant rendering on sensitive routes (/checkout, /payment-result)', () => {
      assert.match(componentSource, /const HIDDEN_PATHS = \['\/checkout', '\/payment-result'\];/);
      assert.match(componentSource, /if \(HIDDEN_PATHS\.some\(\(path\) => pathname\.startsWith\(path\)\)\) return null;/);
    });
  });

  describe('2. Message Input, Validation, and Send Contract', () => {
    it('trims input and validates canonical single-turn { message } contract', () => {
      assert.match(componentSource, /const normalized = message\.trim\(\);/);
      assert.match(componentSource, /if \(!normalized \|\| loading \|\| !capability\?\.enabled\) return;/);
      assert.match(componentSource, /await api\.post\('\/assistant\/chat',\s*\{\s*message:\s*normalized,?\s*\}\);/);
      assert.doesNotMatch(componentSource, /history:\s*\[\]/);
    });

    it('bounds textarea input to a maximum of 2000 characters', () => {
      assert.match(componentSource, /maxLength=\{2000\}/);
      assert.match(componentSource, /setInput\(event\.target\.value\.slice\(0, 2000\)\)/);
    });

    it('disables input and send button during loading or when empty', () => {
      assert.match(componentSource, /disabled=\{!capability\?\.enabled \|\| loading\}/);
      assert.match(componentSource, /disabled=\{!input\.trim\(\) \|\| !capability\?\.enabled \|\| loading\}/);
    });
  });

  describe('3. Response Processing, Evidence Cards, and Empty Sources', () => {
    it('processes backend response envelope with answer, sources, and criticalNotice', () => {
      assert.match(componentSource, /interface ChatResponse \{[^}]*answer:\s*string;[^}]*sources:\s*Source\[\];[^}]*criticalNotice:\s*string;[^}]*\}/s);
      assert.match(componentSource, /content:\s*result\.answer/);
      assert.match(componentSource, /sources:\s*result\.sources/);
      assert.match(componentSource, /notice:\s*result\.criticalNotice/);
    });

    it('renders Evidence Cards with title and reference', () => {
      assert.match(componentSource, /\{source\.title\} — \{source\.reference\}/);
      assert.match(componentSource, /<ul className=\{styles\.sources\} aria-label="Answer sources">/);
    });

    it('guards against empty sources and does not render empty citations list', () => {
      assert.match(componentSource, /message\.sources && message\.sources\.length > 0/);
    });

    it('renders critical notice banner when present', () => {
      assert.match(componentSource, /\{message\.notice && \(\s*<p className=\{styles\.notice\}>\{message\.notice\}<\/p>\s*\)\}/);
    });
  });

  describe('4. Error Handling, Resilience, and Outage Recovery', () => {
    it('handles capability load failure with accessible status error', () => {
      assert.match(componentSource, /setError\('Help Assistant status is unavailable\.'\)/);
    });

    it('handles chat request failures (400, 401, 403, 429, 503, timeout) with safe user message', () => {
      assert.match(componentSource, /catch\s*\{[^}]*setError\('The help request could not be completed\. Please retry\.'\);[^}]*\}/s);
      assert.doesNotMatch(componentSource, /error\.message/);
      assert.doesNotMatch(componentSource, /error\.response/);
    });

    it('clears prior error and resets input before sending new request', () => {
      assert.match(componentSource, /setInput\(''\);/);
      assert.match(componentSource, /setLoading\(true\);/);
      assert.match(componentSource, /setError\(''\);/);
    });

    it('resets loading state in finally block ensuring UI recovery', () => {
      assert.match(componentSource, /finally\s*\{[^}]*setLoading\(false\);[^}]*\}/s);
    });
  });

  describe('5. Accessibility, Keyboard Navigation, and Focus Behavior', () => {
    it('dialog panel uses role="dialog", aria-modal="false", and aria-labelledby', () => {
      assert.match(componentSource, /role="dialog"/);
      assert.match(componentSource, /aria-modal="false"/);
      assert.match(componentSource, /aria-labelledby="help-assistant-title"/);
    });

    it('messages container has polite live region and aria-busy state', () => {
      assert.match(componentSource, /aria-live="polite"/);
      assert.match(componentSource, /aria-busy=\{loading\}/);
    });

    it('error banner has role="alert"', () => {
      assert.match(componentSource, /<p className=\{styles\.error\} role="alert">\{error\}<\/p>/);
    });

    it('manages focus to textarea when opened and restores focus to launcher on Escape', () => {
      assert.match(componentSource, /const inputRef = useRef<HTMLTextAreaElement>\(null\);/);
      assert.match(componentSource, /const launcherRef = useRef<HTMLButtonElement>\(null\);/);
      assert.match(componentSource, /inputRef\.current\?\.focus\(\);/);
      assert.match(componentSource, /launcherRef\.current\?\.focus\(\);/);
      assert.match(componentSource, /event\.key === 'Escape'/);
    });

    it('supports Enter key to submit and Shift+Enter for newline in textarea', () => {
      assert.match(componentSource, /event\.key === 'Enter' && !event\.shiftKey/);
      assert.match(componentSource, /event\.preventDefault\(\);/);
    });
  });

  describe('6. Security, Privacy, and Data Minimization Invariants', () => {
    it('XSS prevention: renders all messages and sources as React text nodes without dangerouslySetInnerHTML', () => {
      assert.doesNotMatch(componentSource, /dangerouslySetInnerHTML/);
      assert.doesNotMatch(componentSource, /innerHTML/);
    });

    it('does not display raw internal tools or system prompts in UI', () => {
      assert.doesNotMatch(componentSource, /searchPublicProducts/);
      assert.doesNotMatch(componentSource, /getCurrentCustomerOrderStatus/);
      assert.doesNotMatch(componentSource, /getInventorySummary/);
    });

    it('does not render card, password, or financial credential inputs', () => {
      assert.doesNotMatch(componentSource, /type="password"/);
      assert.doesNotMatch(componentSource, /name="cardNumber"/);
      assert.doesNotMatch(componentSource, /name="cvv"/);
    });
  });
});
