import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('AdminHelpAssistant Component Contracts & UI Invariants (Batch 2F / DEF-02-I)', () => {
  const componentPath = path.resolve(process.cwd(), 'src/components/assistant/AdminHelpAssistant.tsx');
  const componentSource = fs.readFileSync(componentPath, 'utf8');

  describe('1. Open / Close State and Launch Behavior', () => {
    it('initializes in closed state and toggles open state via launcher button', () => {
      assert.match(componentSource, /const \[open, setOpen\] = useState\(false\);/);
      assert.match(componentSource, /onClick=\{\(\) => setOpen\(\(value\) => !value\)\}/);
      assert.match(componentSource, /onClick=\{\(\) => setOpen\(false\)\}/);
    });

    it('launcher button exposes dynamic aria-expanded state', () => {
      assert.match(componentSource, /aria-expanded=\{open\}/);
    });

    it('renders read-only badge in admin assistant header', () => {
      assert.match(componentSource, /<span className=\{styles\.badge\}>Read-only<\/span>/);
    });
  });

  describe('2. Quick Prompts & User Interaction', () => {
    it('exposes approved operational quick prompts', () => {
      assert.match(componentSource, /const QUICK_PROMPTS = \[/);
      assert.match(componentSource, /'Inventory overview'/);
      assert.match(componentSource, /'Pending orders'/);
      assert.match(componentSource, /'Manual payment queue'/);
      assert.match(componentSource, /'Refund overview'/);
      assert.match(componentSource, /'Provider availability'/);
      assert.match(componentSource, /'System health help'/);
    });

    it('clicking a quick prompt triggers send action', () => {
      assert.match(componentSource, /onClick=\{\(\) => void send\(prompt\)\}/);
      assert.match(componentSource, /aria-label="Quick prompts"/);
    });
  });

  describe('3. Message Input, Validation, and Send Contract', () => {
    it('trims input and validates canonical single-turn { message } admin contract', () => {
      assert.match(componentSource, /const normalized = message\.trim\(\);/);
      assert.match(componentSource, /if \(!normalized \|\| loading \|\| !capability\?\.enabled\) return;/);
      assert.match(componentSource, /await api\.post\('\/assistant\/admin\/chat',\s*\{\s*message:\s*normalized,?\s*\}\);/);
      assert.doesNotMatch(componentSource, /history:\s*\[\]/);
    });

    it('bounds textarea input to a maximum of 2000 characters', () => {
      assert.match(componentSource, /maxLength=\{2000\}/);
      assert.match(componentSource, /setInput\(event\.target\.value\.slice\(0, 2000\)\)/);
    });

    it('disables input, prompts, and send button during loading or when disabled', () => {
      assert.match(componentSource, /disabled=\{!capability\?\.enabled \|\| loading\}/);
      assert.match(componentSource, /disabled=\{!input\.trim\(\) \|\| !capability\?\.enabled \|\| loading\}/);
    });
  });

  describe('4. Response Processing, Evidence Cards, and Notices', () => {
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

  describe('5. Error Handling, Resilience, and Outage Recovery', () => {
    it('handles capability load failure with accessible status error', () => {
      assert.match(componentSource, /setError\('Assistant status is unavailable\.'\)/);
    });

    it('handles admin chat request failures (401, 403, 429, 503, timeout) with safe user message', () => {
      assert.match(componentSource, /catch\s*\{[^}]*setError\('The read-only assistant request failed\. Please retry\.'\);[^}]*\}/s);
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

  describe('6. Accessibility, Keyboard Navigation, and Focus Behavior', () => {
    it('dialog panel uses role="dialog", aria-modal="false", and aria-labelledby', () => {
      assert.match(componentSource, /role="dialog"/);
      assert.match(componentSource, /aria-modal="false"/);
      assert.match(componentSource, /aria-labelledby="admin-assistant-title"/);
    });

    it('messages container has polite live region and aria-busy state', () => {
      assert.match(componentSource, /aria-live="polite"/);
      assert.match(componentSource, /aria-busy=\{loading\}/);
    });

    it('error banner has role="alert"', () => {
      assert.match(componentSource, /<p className=\{styles\.error\} role="alert">\{error\}<\/p>/);
    });

    it('supports Enter key to submit and Shift+Enter for newline in textarea', () => {
      assert.match(componentSource, /event\.key === 'Enter' && !event\.shiftKey/);
      assert.match(componentSource, /event\.preventDefault\(\);/);
    });
  });

  describe('7. Security, Privacy, and Data Minimization Invariants', () => {
    it('XSS prevention: renders all messages and sources as React text nodes without dangerouslySetInnerHTML', () => {
      assert.doesNotMatch(componentSource, /dangerouslySetInnerHTML/);
      assert.doesNotMatch(componentSource, /innerHTML/);
    });

    it('does not display raw internal tools or system prompts in UI', () => {
      assert.doesNotMatch(componentSource, /getInventorySummary/);
      assert.doesNotMatch(componentSource, /getManualPaymentQueueSummary/);
      assert.doesNotMatch(componentSource, /getProviderAvailabilitySummary/);
    });

    it('does not render card, password, or financial credential inputs', () => {
      assert.doesNotMatch(componentSource, /type="password"/);
      assert.doesNotMatch(componentSource, /name="cardNumber"/);
      assert.doesNotMatch(componentSource, /name="cvv"/);
    });
  });
});
