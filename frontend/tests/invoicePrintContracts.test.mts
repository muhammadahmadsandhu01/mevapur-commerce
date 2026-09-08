import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Storefront Invoice PDF Print Stylesheet & DOM Contract', () => {
  const globalsCssPath = path.resolve(process.cwd(), 'src/app/globals.css');
  const invoicePagePath = path.resolve(process.cwd(), 'src/app/orders/[id]/invoice/page.tsx');
  const navbarPath = path.resolve(process.cwd(), 'src/components/Navbar.tsx');
  const footerPath = path.resolve(process.cwd(), 'src/components/Footer.tsx');
  const helpAssistantPath = path.resolve(process.cwd(), 'src/components/assistant/HelpAssistant.tsx');

  it('globals.css defines @page with A4 portrait size and printable margins', () => {
    const css = fs.readFileSync(globalsCssPath, 'utf8');
    assert.match(css, /@page\s*\{[^}]*size:\s*A4\s+portrait/i);
    assert.match(css, /@page\s*\{[^}]*margin:\s*12mm\s+15mm/i);
  });

  it('globals.css resets html and body to printable overflow: visible, height: auto, and color fidelity', () => {
    const css = fs.readFileSync(globalsCssPath, 'utf8');
    assert.match(css, /@media\s+print\s*\{/i);
    assert.match(css, /overflow:\s*visible\s*!important/i);
    assert.match(css, /print-color-adjust:\s*exact\s*!important/i);
    assert.match(css, /-webkit-print-color-adjust:\s*exact\s*!important/i);
  });

  it('globals.css exclusively hides explicit screen-only markers (.no-print, .print-hidden) and omits unsafe broad element selectors', () => {
    const css = fs.readFileSync(globalsCssPath, 'utf8');
    assert.match(css, /\.no-print,\s*\n?\s*\.print-hidden\s*\{/);
    assert.match(css, /display:\s*none\s*!important/);
    assert.doesNotMatch(css, /button\[class\*="launcher"\]/);
    assert.doesNotMatch(css, /div\[class\*="panel"\]/);
  });

  it('globals.css allows invoice document to paginate (break-inside: auto) and protects atomic subsections', () => {
    const css = fs.readFileSync(globalsCssPath, 'utf8');
    assert.match(css, /\.invoice-print-root,\s*\[data-testid="invoice-print-root"\]\s*\{[^}]*break-inside:\s*auto\s*!important/s);
    assert.match(css, /\.invoice-print-root,\s*\[data-testid="invoice-print-root"\]\s*\{[^}]*page-break-inside:\s*auto\s*!important/s);
    assert.match(css, /\.invoice-header-banner,\s*\n?\s*\.invoice-details-grid,\s*\n?\s*\.invoice-totals-block,\s*\n?\s*\.invoice-notes-block,\s*\n?\s*\.invoice-table-container tbody tr\s*\{[^}]*break-inside:\s*avoid\s*!important/s);
    assert.match(css, /\.invoice-table-container\s*\{[^}]*overflow:\s*visible\s*!important/s);
  });

  it('invoice page component renders data-testid="invoice-print-root" on the printable article', () => {
    const source = fs.readFileSync(invoicePagePath, 'utf8');
    assert.match(source, /data-testid="invoice-print-root"/);
    assert.match(source, /className="[^"]*invoice-print-root/);
  });

  it('invoice page component marks screen navigation and action controls with no-print and print-hidden', () => {
    const source = fs.readFileSync(invoicePagePath, 'utf8');
    assert.match(source, /className="[^"]*no-print[^"]*print-hidden/);
    assert.match(source, /handlePrint/);
    assert.match(source, /Print Document \/ Save PDF/);
  });

  it('storefront surrounding shell components (Navbar, Footer, HelpAssistant) include print exclusion markers', () => {
    const navbar = fs.readFileSync(navbarPath, 'utf8');
    assert.match(navbar, /no-print/);

    const footer = fs.readFileSync(footerPath, 'utf8');
    assert.match(footer, /no-print/);

    const help = fs.readFileSync(helpAssistantPath, 'utf8');
    assert.match(help, /no-print/);
  });

  it('invoice DOM includes order reference, customer/address, line items, and totals', () => {
    const source = fs.readFileSync(invoicePagePath, 'utf8');
    assert.match(source, /invoice\.orderNumber/);
    assert.match(source, /invoice\.customer/);
    assert.match(source, /invoice\.shippingAddress/);
    assert.match(source, /invoice\.items\.map/);
    assert.match(source, /invoice\.subtotal/);
    assert.match(source, /invoice\.total/);
  });

  it('invoice DOM renders truthful, legally neutral order record copy and excludes unsupported claims', () => {
    const source = fs.readFileSync(invoicePagePath, 'utf8');

    // Required neutral record assurance
    assert.match(source, /Order and payment status shown from the merchant’s order record\./);

    // Forbidden claims
    assert.doesNotMatch(source, /Enterprise Verified Commerce Platform/i);
    assert.doesNotMatch(source, /Cryptographically verified/i);
    assert.doesNotMatch(source, /tax invoice/i);
    assert.doesNotMatch(source, /tamper-proof/i);
    assert.doesNotMatch(source, /legally verified/i);
    assert.doesNotMatch(source, /enterprise verified/i);
  });

  it('invoice DOM conditionally renders optional merchant details only when non-empty', () => {
    const source = fs.readFileSync(invoicePagePath, 'utf8');

    // Verify conditional checks on optional merchant fields
    assert.match(source, /branding\.supportEmail\?\.trim\(\)/);
    assert.match(source, /branding\.supportPhone\?\.trim\(\)/);
    assert.match(source, /branding\.address\?\.trim\(\)/);
  });
});
