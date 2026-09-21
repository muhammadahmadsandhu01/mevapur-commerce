/**
 * @file MessageTemplateEngine.js
 * @description Governed Message Template & Localization Engine for Phase 8.
 * Enforces stable template IDs, explicit versions, strict variable allowlists,
 * missing-variable rejection, injection-safe HTML escaping, secure URL checks,
 * and locale formatting.
 */

'use strict';

const { AppError } = require('../../common/errors/AppError');
const { Money } = require('../../modules/commerce');

const SUPPORTED_LOCALES = ['en-US', 'en-PK', 'en'];
const DEFAULT_LOCALE = 'en-US';

const escapeHtml = (value) => {
  if (value === null || value === undefined) return '';
  const str = String(value);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const validateUrl = (rawUrl, { allowRelative = false } = {}) => {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (/^javascript:/i.test(trimmed) || /^data:/i.test(trimmed) || /[\x00-\x1F\x7F]/.test(trimmed)) {
    throw new AppError('Insecure URL detected in notification template variables', 400, 'INSECURE_TEMPLATE_URL');
  }
  if (allowRelative && trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new AppError('Notification URL must use HTTPS or HTTP protocol', 400, 'INSECURE_TEMPLATE_URL');
    }
    return parsed.toString();
  } catch (_err) {
    if (_err instanceof AppError) throw _err;
    if (allowRelative && trimmed.startsWith('/')) return trimmed;
    throw new AppError('Invalid URL in notification template variables', 400, 'INVALID_TEMPLATE_URL');
  }
};

const TEMPLATE_DEFINITIONS = {
  ORDER_CONFIRMATION_V1: {
    id: 'ORDER_CONFIRMATION_V1',
    version: '1.0',
    requiredVariables: ['orderNumber', 'customerName', 'total', 'currency'],
    optionalVariables: ['itemsCount', 'viewOrderUrl', 'siteName'],
    urlVariables: ['viewOrderUrl'],
    subject: (v) => `Order Confirmation #${v.orderNumber} - ${v.siteName || 'HARZAAR'}`,
    text: (v) => `Hello ${v.customerName},\n\nThank you for your order #${v.orderNumber}. Total: ${v.currency} ${v.total}.\n\nView details: ${v.viewOrderUrl || 'N/A'}\n\n${v.siteName || 'HARZAAR'}`,
    html: (v) => `<p>Hello <strong>${escapeHtml(v.customerName)}</strong>,</p><p>Thank you for your order <strong>#${escapeHtml(v.orderNumber)}</strong>.</p><p>Order Total: <strong>${escapeHtml(v.currency)} ${escapeHtml(v.total)}</strong></p>${v.viewOrderUrl ? `<p><a href="${escapeHtml(v.viewOrderUrl)}">View Your Order</a></p>` : ''}`
  },
  PAYMENT_SUCCEEDED_V1: {
    id: 'PAYMENT_SUCCEEDED_V1',
    version: '1.0',
    requiredVariables: ['orderNumber', 'customerName', 'amount', 'currency'],
    optionalVariables: ['paymentMethod', 'receiptUrl', 'siteName'],
    urlVariables: ['receiptUrl'],
    subject: (v) => `Payment Succeeded for Order #${v.orderNumber} - ${v.siteName || 'HARZAAR'}`,
    text: (v) => `Hello ${v.customerName},\n\nPayment of ${v.currency} ${v.amount} for Order #${v.orderNumber} was successful.\n\nReceipt: ${v.receiptUrl || 'N/A'}`,
    html: (v) => `<p>Hello <strong>${escapeHtml(v.customerName)}</strong>,</p><p>Payment of <strong>${escapeHtml(v.currency)} ${escapeHtml(v.amount)}</strong> for Order <strong>#${escapeHtml(v.orderNumber)}</strong> has been successfully processed.</p>${v.receiptUrl ? `<p><a href="${escapeHtml(v.receiptUrl)}">View Official Receipt</a></p>` : ''}`
  },
  PAYMENT_FAILED_V1: {
    id: 'PAYMENT_FAILED_V1',
    version: '1.0',
    requiredVariables: ['orderNumber', 'customerName', 'reason'],
    optionalVariables: ['amount', 'currency', 'retryUrl', 'siteName'],
    urlVariables: ['retryUrl'],
    subject: (v) => `Payment Action Required for Order #${v.orderNumber} - ${v.siteName || 'HARZAAR'}`,
    text: (v) => `Hello ${v.customerName},\n\nWe could not process your payment for Order #${v.orderNumber}. Reason: ${v.reason}.\n\nRetry your payment: ${v.retryUrl || 'N/A'}`,
    html: (v) => `<p>Hello <strong>${escapeHtml(v.customerName)}</strong>,</p><p>Payment for Order <strong>#${escapeHtml(v.orderNumber)}</strong> could not be processed.</p><p>Reason: <em>${escapeHtml(v.reason)}</em></p>${v.retryUrl ? `<p><a href="${escapeHtml(v.retryUrl)}">Retry Payment</a></p>` : ''}`
  },
  PAYMENT_ACTION_REQUIRED_V1: {
    id: 'PAYMENT_ACTION_REQUIRED_V1',
    version: '1.0',
    requiredVariables: ['orderNumber', 'customerName', 'actionUrl'],
    optionalVariables: ['amount', 'currency', 'siteName'],
    urlVariables: ['actionUrl'],
    subject: (v) => `Complete Your Payment for Order #${v.orderNumber} - ${v.siteName || 'HARZAAR'}`,
    text: (v) => `Hello ${v.customerName},\n\nAdditional authentication is required to complete your payment for Order #${v.orderNumber}.\n\nPlease complete payment here: ${v.actionUrl}`,
    html: (v) => `<p>Hello <strong>${escapeHtml(v.customerName)}</strong>,</p><p>Additional authentication is required for Order <strong>#${escapeHtml(v.orderNumber)}</strong>.</p><p><a href="${escapeHtml(v.actionUrl)}">Authenticate Payment</a></p>`
  },
  SHIPMENT_CREATED_V1: {
    id: 'SHIPMENT_CREATED_V1',
    version: '1.0',
    requiredVariables: ['orderNumber', 'customerName', 'trackingNumber'],
    optionalVariables: ['courierCompany', 'trackingUrl', 'siteName'],
    urlVariables: ['trackingUrl'],
    subject: (v) => `Your Order #${v.orderNumber} Has Shipped! - ${v.siteName || 'HARZAAR'}`,
    text: (v) => `Hello ${v.customerName},\n\nYour order #${v.orderNumber} is on its way! Carrier: ${v.courierCompany || 'Standard Courier'}, Tracking #: ${v.trackingNumber}.\n\nTrack: ${v.trackingUrl || 'N/A'}`,
    html: (v) => `<p>Hello <strong>${escapeHtml(v.customerName)}</strong>,</p><p>Your order <strong>#${escapeHtml(v.orderNumber)}</strong> has shipped with <strong>${escapeHtml(v.courierCompany || 'Courier')}</strong>.</p><p>Tracking Number: <strong>${escapeHtml(v.trackingNumber)}</strong></p>${v.trackingUrl ? `<p><a href="${escapeHtml(v.trackingUrl)}">Track Shipment</a></p>` : ''}`
  },
  SHIPMENT_DELAYED_V1: {
    id: 'SHIPMENT_DELAYED_V1',
    version: '1.0',
    requiredVariables: ['orderNumber', 'customerName', 'reason'],
    optionalVariables: ['estimatedDelivery', 'supportUrl', 'siteName'],
    urlVariables: ['supportUrl'],
    subject: (v) => `Shipping Update for Order #${v.orderNumber} - ${v.siteName || 'HARZAAR'}`,
    text: (v) => `Hello ${v.customerName},\n\nYour shipment for Order #${v.orderNumber} is experiencing a delay: ${v.reason}.\n\nNeed help? ${v.supportUrl || 'N/A'}`,
    html: (v) => `<p>Hello <strong>${escapeHtml(v.customerName)}</strong>,</p><p>We are experiencing a shipping delay on Order <strong>#${escapeHtml(v.orderNumber)}</strong>.</p><p>Status: ${escapeHtml(v.reason)}</p>${v.estimatedDelivery ? `<p>Updated Estimate: ${escapeHtml(v.estimatedDelivery)}</p>` : ''}`
  },
  ORDER_DELIVERED_V1: {
    id: 'ORDER_DELIVERED_V1',
    version: '1.0',
    requiredVariables: ['orderNumber', 'customerName'],
    optionalVariables: ['deliveredAt', 'feedbackUrl', 'siteName'],
    urlVariables: ['feedbackUrl'],
    subject: (v) => `Order #${v.orderNumber} Delivered - ${v.siteName || 'HARZAAR'}`,
    text: (v) => `Hello ${v.customerName},\n\nYour order #${v.orderNumber} has been delivered.\n\nLeave a review: ${v.feedbackUrl || 'N/A'}`,
    html: (v) => `<p>Hello <strong>${escapeHtml(v.customerName)}</strong>,</p><p>Your order <strong>#${escapeHtml(v.orderNumber)}</strong> has been delivered.</p>${v.feedbackUrl ? `<p><a href="${escapeHtml(v.feedbackUrl)}">Rate Your Purchase</a></p>` : ''}`
  },
  RETURN_REQUESTED_V1: {
    id: 'RETURN_REQUESTED_V1',
    version: '1.0',
    requiredVariables: ['returnNumber', 'orderNumber', 'customerName'],
    optionalVariables: ['itemsCount', 'statusUrl', 'siteName'],
    urlVariables: ['statusUrl'],
    subject: (v) => `Return Request Received #${v.returnNumber} - ${v.siteName || 'HARZAAR'}`,
    text: (v) => `Hello ${v.customerName},\n\nWe received your return request #${v.returnNumber} for Order #${v.orderNumber}.\n\nStatus: ${v.statusUrl || 'N/A'}`,
    html: (v) => `<p>Hello <strong>${escapeHtml(v.customerName)}</strong>,</p><p>Your return request <strong>#${escapeHtml(v.returnNumber)}</strong> for Order <strong>#${escapeHtml(v.orderNumber)}</strong> has been submitted.</p>${v.statusUrl ? `<p><a href="${escapeHtml(v.statusUrl)}">Check Return Status</a></p>` : ''}`
  },
  RETURN_APPROVED_V1: {
    id: 'RETURN_APPROVED_V1',
    version: '1.0',
    requiredVariables: ['returnNumber', 'orderNumber', 'customerName'],
    optionalVariables: ['instructions', 'statusUrl', 'siteName'],
    urlVariables: ['statusUrl'],
    subject: (v) => `Return Approved #${v.returnNumber} - ${v.siteName || 'HARZAAR'}`,
    text: (v) => `Hello ${v.customerName},\n\nYour return request #${v.returnNumber} for Order #${v.orderNumber} has been approved.\n\nInstructions: ${v.instructions || 'Please follow packaging instructions.'}`,
    html: (v) => `<p>Hello <strong>${escapeHtml(v.customerName)}</strong>,</p><p>Your return request <strong>#${escapeHtml(v.returnNumber)}</strong> has been approved.</p><p>${escapeHtml(v.instructions || 'Please package item(s) securely.')}</p>`
  },
  RETURN_REJECTED_V1: {
    id: 'RETURN_REJECTED_V1',
    version: '1.0',
    requiredVariables: ['returnNumber', 'orderNumber', 'customerName', 'reason'],
    optionalVariables: ['supportUrl', 'siteName'],
    urlVariables: ['supportUrl'],
    subject: (v) => `Return Update #${v.returnNumber} - ${v.siteName || 'HARZAAR'}`,
    text: (v) => `Hello ${v.customerName},\n\nYour return request #${v.returnNumber} could not be approved. Reason: ${v.reason}.\n\nSupport: ${v.supportUrl || 'N/A'}`,
    html: (v) => `<p>Hello <strong>${escapeHtml(v.customerName)}</strong>,</p><p>Your return request <strong>#${escapeHtml(v.returnNumber)}</strong> was rejected.</p><p>Reason: ${escapeHtml(v.reason)}</p>`
  },
  RETURN_RECEIVED_V1: {
    id: 'RETURN_RECEIVED_V1',
    version: '1.0',
    requiredVariables: ['returnNumber', 'orderNumber', 'customerName'],
    optionalVariables: ['statusUrl', 'siteName'],
    urlVariables: ['statusUrl'],
    subject: (v) => `Return Package Received #${v.returnNumber} - ${v.siteName || 'HARZAAR'}`,
    text: (v) => `Hello ${v.customerName},\n\nWe received your returned item(s) for Return #${v.returnNumber}. Inspection is in progress.`,
    html: (v) => `<p>Hello <strong>${escapeHtml(v.customerName)}</strong>,</p><p>We have received your returned package for Return <strong>#${escapeHtml(v.returnNumber)}</strong>. Inspection is underway.</p>`
  },
  REFUND_SUCCEEDED_V1: {
    id: 'REFUND_SUCCEEDED_V1',
    version: '1.0',
    requiredVariables: ['refundNumber', 'orderNumber', 'customerName', 'amount', 'currency'],
    optionalVariables: ['creditNoteUrl', 'siteName'],
    urlVariables: ['creditNoteUrl'],
    subject: (v) => `Refund Processed #${v.refundNumber} - ${v.siteName || 'HARZAAR'}`,
    text: (v) => `Hello ${v.customerName},\n\nA refund of ${v.currency} ${v.amount} for Order #${v.orderNumber} (Refund #${v.refundNumber}) has been completed.\n\nCredit Note: ${v.creditNoteUrl || 'N/A'}`,
    html: (v) => `<p>Hello <strong>${escapeHtml(v.customerName)}</strong>,</p><p>A refund of <strong>${escapeHtml(v.currency)} ${escapeHtml(v.amount)}</strong> has been processed for Order <strong>#${escapeHtml(v.orderNumber)}</strong>.</p>${v.creditNoteUrl ? `<p><a href="${escapeHtml(v.creditNoteUrl)}">View Credit Note</a></p>` : ''}`
  },
  REFUND_FAILED_V1: {
    id: 'REFUND_FAILED_V1',
    version: '1.0',
    requiredVariables: ['refundNumber', 'orderNumber', 'customerName', 'reason'],
    optionalVariables: ['supportUrl', 'siteName'],
    urlVariables: ['supportUrl'],
    subject: (v) => `Refund Notice #${v.refundNumber} - ${v.siteName || 'HARZAAR'}`,
    text: (v) => `Hello ${v.customerName},\n\nThere was an issue processing your refund #${v.refundNumber} for Order #${v.orderNumber}. Reason: ${v.reason}.\n\nOur support team is investigating.`,
    html: (v) => `<p>Hello <strong>${escapeHtml(v.customerName)}</strong>,</p><p>We encountered an issue processing Refund <strong>#${escapeHtml(v.refundNumber)}</strong> for Order <strong>#${escapeHtml(v.orderNumber)}</strong>.</p><p>Reason: ${escapeHtml(v.reason)}</p><p>Our team has been alerted.</p>`
  },
  DISPUTE_OPENED_V1: {
    id: 'DISPUTE_OPENED_V1',
    version: '1.0',
    requiredVariables: ['orderNumber', 'customerName', 'amount', 'currency'],
    optionalVariables: ['disputeReason', 'supportUrl', 'siteName'],
    urlVariables: ['supportUrl'],
    subject: (v) => `Inquiry Regarding Order #${v.orderNumber} - ${v.siteName || 'HARZAAR'}`,
    text: (v) => `Hello ${v.customerName},\n\nWe received a payment dispute inquiry for Order #${v.orderNumber} (${v.currency} ${v.amount}).\n\nIf you have any questions, please contact support: ${v.supportUrl || 'N/A'}`,
    html: (v) => `<p>Hello <strong>${escapeHtml(v.customerName)}</strong>,</p><p>We received an inquiry regarding payment on Order <strong>#${escapeHtml(v.orderNumber)}</strong> for <strong>${escapeHtml(v.currency)} ${escapeHtml(v.amount)}</strong>.</p>${v.supportUrl ? `<p><a href="${escapeHtml(v.supportUrl)}">Contact Support</a></p>` : ''}`
  }
};

class MessageTemplateEngine {
  getTemplate(templateId) {
    if (!templateId) {
      throw new AppError('Template identifier is required', 400, 'TEMPLATE_NOT_FOUND');
    }
    const template = TEMPLATE_DEFINITIONS[templateId] || TEMPLATE_DEFINITIONS[`${templateId}_V1`];
    if (!template) {
      throw new AppError(`Template '${templateId}' is not registered`, 400, 'TEMPLATE_NOT_FOUND');
    }
    return template;
  }

  resolveLocale(locale) {
    if (!locale || typeof locale !== 'string') return DEFAULT_LOCALE;
    const normalized = locale.trim();
    if (SUPPORTED_LOCALES.includes(normalized)) return normalized;
    const lang = normalized.split('-')[0];
    if (SUPPORTED_LOCALES.includes(lang)) return lang;
    return DEFAULT_LOCALE;
  }

  formatMoney(amount, currency = 'USD') {
    if (typeof amount === 'number') {
      return Number(amount).toFixed(2);
    }
    if (typeof amount === 'string' && /^\d+(\.\d+)?$/.test(amount)) {
      return Number(amount).toFixed(2);
    }
    if (typeof amount === 'object' && amount?.amountMinor !== undefined) {
      try {
        const money = Money.fromMinor(amount.amountMinor, currency);
        return money.format({ locale: 'en-US' });
      } catch {
        return (Number(amount.amountMinor) / 100).toFixed(2);
      }
    }
    return String(amount || '0.00');
  }

  formatDate(date, locale = DEFAULT_LOCALE) {
    if (!date) return '';
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC'
    });
  }

  render(templateId, variables = {}, { locale = DEFAULT_LOCALE, version = null } = {}) {
    const template = this.getTemplate(templateId);
    if (version && template.version !== version) {
      throw new AppError(
        `Template '${templateId}' version mismatch: requested '${version}', current '${template.version}'`,
        400,
        'TEMPLATE_VERSION_MISMATCH'
      );
    }

    const resolvedLocale = this.resolveLocale(locale);

    // Validate required variables
    const missing = [];
    for (const reqVar of template.requiredVariables) {
      const val = variables[reqVar];
      if (val === undefined || val === null || (typeof val === 'string' && val.trim() === '')) {
        missing.push(reqVar);
      }
    }

    if (missing.length > 0) {
      throw new AppError(
        `Template '${templateId}' missing required variables: ${missing.join(', ')}`,
        400,
        'MISSING_TEMPLATE_VARIABLE'
      );
    }

    // Validate URL variables
    const safeVariables = { ...variables };
    if (template.urlVariables && Array.isArray(template.urlVariables)) {
      for (const urlVar of template.urlVariables) {
        if (safeVariables[urlVar]) {
          safeVariables[urlVar] = validateUrl(safeVariables[urlVar], { allowRelative: true });
        }
      }
    }

    const renderedSubject = template.subject(safeVariables);
    const renderedBody = template.html(safeVariables);
    const renderedText = template.text(safeVariables);

    return {
      templateId: template.id,
      templateVersion: template.version,
      locale: resolvedLocale,
      subject: renderedSubject,
      html: renderedBody,
      text: renderedText
    };
  }
}

module.exports = new MessageTemplateEngine();
