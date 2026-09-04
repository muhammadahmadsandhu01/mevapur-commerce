/**
 * Navigation and URL safety validator for customer-facing Storefront links.
 * 
 * Supports:
 * - Safe root-relative paths (e.g. /products, /categories/fresh, /pages/about-us)
 * - Approved external HTTPS URLs (e.g. https://example.com) with external attributes
 * - Contact action schemes (mailto:support@domain.com, tel:+923001234567)
 * 
 * Strictly rejects:
 * - Dangerous protocols: javascript:, data:, vbscript:, file:, ftp:
 * - Protocol-relative URLs: //evil.com
 * - Credential-bearing URLs: https://user:pass@host
 * - Control characters and malformed strings
 */

export interface SafeNavigationTarget {
  url: string;
  isExternal: boolean;
  isAction: boolean;
  rel?: string;
  target?: string;
}

export function getSafeNavigationUrl(
  input?: string | null,
  fallback: string | null = null
): SafeNavigationTarget | null {
  if (!input || typeof input !== 'string') {
    return fallback ? { url: fallback, isExternal: false, isAction: false } : null;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return fallback ? { url: fallback, isExternal: false, isAction: false } : null;
  }

  // Reject dangerous characters or protocol-relative URLs
  if (trimmed.startsWith('//') || /[\x00-\x1F\x7F]/.test(trimmed)) {
    return fallback ? { url: fallback, isExternal: false, isAction: false } : null;
  }

  // 1. Safe root-relative path
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    // Basic path sanitation: eliminate control characters
    return {
      url: trimmed,
      isExternal: false,
      isAction: false,
    };
  }

  // 2. Safe contact actions: mailto: and tel:
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('mailto:')) {
    const emailPart = trimmed.slice(7).trim();
    // Validate basic email format (no javascript or injected headers)
    if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(emailPart)) {
      return {
        url: `mailto:${emailPart}`,
        isExternal: false,
        isAction: true,
      };
    }
    return fallback ? { url: fallback, isExternal: false, isAction: false } : null;
  }

  if (lower.startsWith('tel:')) {
    const phonePart = trimmed.slice(4).trim();
    // Validate phone characters (digits, +, -, spaces, parentheses)
    if (/^[+]?[\d\s\-().]{5,20}$/.test(phonePart)) {
      return {
        url: `tel:${phonePart.replace(/\s+/g, '')}`,
        isExternal: false,
        isAction: true,
      };
    }
    return fallback ? { url: fallback, isExternal: false, isAction: false } : null;
  }

  // 3. Absolute HTTPS URLs
  try {
    const parsed = new URL(trimmed);
    
    // Only HTTPS is allowed for external destinations
    if (parsed.protocol !== 'https:') {
      return fallback ? { url: fallback, isExternal: false, isAction: false } : null;
    }

    // Reject credentials in URL
    if (parsed.username || parsed.password) {
      return fallback ? { url: fallback, isExternal: false, isAction: false } : null;
    }

    return {
      url: parsed.toString(),
      isExternal: true,
      isAction: false,
      target: '_blank',
      rel: 'noopener noreferrer',
    };
  } catch {
    return fallback ? { url: fallback, isExternal: false, isAction: false } : null;
  }
}
