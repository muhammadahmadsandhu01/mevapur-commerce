/**
 * @file DocumentService.js
 * @description Authoritative Document Generation and Retrieval Service for Phase 8.
 * Provides idempotent creation of truthful documents, printable HTML formatting,
 * exact money snapshots, and RBAC / ownership isolation.
 */

'use strict';

const crypto = require('crypto');
const Order = require('../../models/Order');
const OrderDocument = require('../../models/OrderDocument');
const Refund = require('../../models/Refund');
const documentClassificationEngine = require('./DocumentClassificationEngine');
const { AppError } = require('../../common/errors/AppError');
const ERROR_CODES = require('../../constants/errorCodes');

const TYPE_PREFIXES = {
  ORDER_CONFIRMATION: 'ORD',
  PAYMENT_RECEIPT: 'RCP',
  PRO_FORMA_INVOICE: 'PRO',
  COMMERCIAL_INVOICE: 'INV',
  CREDIT_NOTE: 'CRN',
  REFUND_RECEIPT: 'REC',
  TAX_INVOICE: 'TAX'
};

const escapeHtml = (val) => {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

class DocumentService {
  generateDeterministicDocNumber(docType, orderRef, year = new Date().getFullYear()) {
    const prefix = TYPE_PREFIXES[docType] || 'DOC';
    const cleanRef = String(orderRef).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const digest = crypto.createHash('sha256').update(`${docType}:${cleanRef}`).digest('hex').substring(0, 6).toUpperCase();
    return `DOC-${prefix}-${year}-${cleanRef.slice(-6)}-${digest}`;
  }

  async getOrIssueOrderDocument(orderId, { merchantConfig = {}, forceReissue = false } = {}) {
    const order = await Order.findById(orderId);
    if (!order) {
      throw new AppError('Order not found', 404, ERROR_CODES.ORDER_NOT_FOUND);
    }

    const classification = documentClassificationEngine.classifyOrderDocument({
      order,
      merchantConfig
    });

    const docNumber = this.generateDeterministicDocNumber(
      classification.documentType,
      order.orderId || order._id
    );

    if (!forceReissue) {
      const existing = await OrderDocument.findOne({
        order: order._id,
        documentType: classification.documentType,
        status: 'ISSUED'
      });
      if (existing) {
        return existing;
      }
    }

    const items = (order.items || []).map((item) => ({
      name: item.name,
      sku: item.sku || '',
      quantity: item.quantity,
      unitPrice: Number(item.price || 0),
      lineTotal: Number(item.lineTotal || (item.price * item.quantity)),
      taxAmount: Number(item.taxAmount || 0),
      discountAmount: Number(item.discountAmount || 0)
    }));

    const doc = await OrderDocument.create({
      documentNumber: docNumber,
      order: order._id,
      orderRef: order.orderId || String(order._id),
      customer: order.user,
      documentType: classification.documentType,
      title: classification.title,
      badgeLabel: classification.badgeLabel,
      isOfficialReceipt: classification.isOfficialReceipt,
      classificationReason: classification.classificationReason,
      classificationVersion: classification.classificationVersion,
      currency: order.payment?.currency || 'PKR',
      subtotal: Number(order.subtotal || 0),
      discount: Number(order.discount || 0),
      shipping: Number(order.shippingCost || 0),
      tax: Number(order.taxAmount || 0),
      duties: Number(order.duties || 0),
      total: Number(order.totalAmount || 0),
      refundedAmount: Number(order.refundedAmount || 0),
      items,
      customerSnapshot: {
        fullName: order.shippingAddress?.fullName || '',
        email: order.customerEmail || '',
        phone: order.shippingAddress?.phone || ''
      },
      shippingAddressSnapshot: {
        fullName: order.shippingAddress?.fullName || '',
        phone: order.shippingAddress?.phone || '',
        address: order.shippingAddress?.address || '',
        addressLine2: order.shippingAddress?.addressLine2 || '',
        city: order.shippingAddress?.city || '',
        state: order.shippingAddress?.state || order.shippingAddress?.province || '',
        postalCode: order.shippingAddress?.postalCode || '',
        country: order.shippingAddress?.country || 'Pakistan',
        countryCode: order.shippingAddress?.countryCode || 'PK'
      },
      merchantSnapshot: {
        businessName: merchantConfig.businessName || 'HARZAAR',
        taxId: merchantConfig.taxId || '',
        isTaxRegistered: Boolean(merchantConfig.isTaxRegistered),
        supportEmail: merchantConfig.supportEmail || 'support@harzaar.com',
        address: merchantConfig.address || 'Lahore, Pakistan',
        jurisdiction: merchantConfig.jurisdiction || 'PK'
      },
      taxJurisdictionSnapshot: {
        countryCode: order.shippingAddress?.countryCode || 'PK',
        taxType: order.taxesAndDuties?.taxType || 'Standard',
        taxRatePercent: order.taxesAndDuties?.taxRatePercent || 0,
        taxTreatment: order.taxesAndDuties?.taxTreatment || 'Inclusive'
      },
      status: 'ISSUED',
      issuedAt: new Date()
    });

    return doc;
  }

  async getOrIssueCreditNote(refundId, { merchantConfig = {} } = {}) {
    const refund = await Refund.findById(refundId);
    if (!refund) {
      throw new AppError('Refund not found', 404, ERROR_CODES.REFUND_NOT_FOUND);
    }

    const order = await Order.findById(refund.order);
    if (!order) {
      throw new AppError('Associated order not found', 404, ERROR_CODES.ORDER_NOT_FOUND);
    }

    const classification = documentClassificationEngine.classifyRefundDocument({ refund, order });
    const docNumber = this.generateDeterministicDocNumber(
      classification.documentType,
      refund.refundNumber || refund._id
    );

    const existing = await OrderDocument.findOne({
      relatedRefundId: refund._id,
      status: 'ISSUED'
    });
    if (existing) return existing;

    const doc = await OrderDocument.create({
      documentNumber: docNumber,
      order: order._id,
      orderRef: order.orderId || String(order._id),
      customer: refund.customer || order.user,
      documentType: classification.documentType,
      title: classification.title,
      badgeLabel: classification.badgeLabel,
      isOfficialReceipt: classification.isOfficialReceipt,
      classificationReason: classification.classificationReason,
      classificationVersion: classification.classificationVersion,
      currency: refund.currency || order.payment?.currency || 'PKR',
      subtotal: Number(refund.amount || 0),
      discount: 0,
      shipping: 0,
      tax: 0,
      duties: 0,
      total: Number(refund.amount || 0),
      refundedAmount: Number(refund.amount || 0),
      items: (refund.items || []).map((i) => ({
        name: i.name || 'Refunded Line Item',
        sku: i.sku || '',
        quantity: i.quantity || 1,
        unitPrice: Number(i.amount || refund.amount),
        lineTotal: Number(i.amount || refund.amount),
        taxAmount: 0,
        discountAmount: 0
      })),
      customerSnapshot: {
        fullName: order.shippingAddress?.fullName || '',
        email: order.customerEmail || '',
        phone: order.shippingAddress?.phone || ''
      },
      shippingAddressSnapshot: {
        fullName: order.shippingAddress?.fullName || '',
        phone: order.shippingAddress?.phone || '',
        address: order.shippingAddress?.address || '',
        city: order.shippingAddress?.city || '',
        country: order.shippingAddress?.country || 'Pakistan',
        countryCode: order.shippingAddress?.countryCode || 'PK'
      },
      merchantSnapshot: {
        businessName: merchantConfig.businessName || 'HARZAAR',
        taxId: merchantConfig.taxId || '',
        isTaxRegistered: Boolean(merchantConfig.isTaxRegistered),
        supportEmail: merchantConfig.supportEmail || 'support@harzaar.com',
        jurisdiction: merchantConfig.jurisdiction || 'PK'
      },
      relatedRefundId: refund._id,
      status: 'ISSUED',
      issuedAt: new Date()
    });

    return doc;
  }

  async listCustomerDocuments(userId, orderReference) {
    const references = [{ orderId: orderReference }];
    if (/^[a-fA-F0-9]{24}$/.test(orderReference)) references.unshift({ _id: orderReference });
    const order = await Order.findOne({ user: userId, $or: references });
    if (!order) {
      throw new AppError('Order not found', 404, ERROR_CODES.ORDER_NOT_FOUND);
    }

    // Ensure primary document is issued
    await this.getOrIssueOrderDocument(order._id);

    const documents = await OrderDocument.find({
      order: order._id,
      customer: userId,
      status: 'ISSUED'
    }).sort({ createdAt: -1 });

    return {
      orderNumber: order.orderId,
      documents
    };
  }

  async getCustomerDocument(userId, orderReference, documentNumber) {
    const references = [{ orderId: orderReference }];
    if (/^[a-fA-F0-9]{24}$/.test(orderReference)) references.unshift({ _id: orderReference });
    const order = await Order.findOne({ user: userId, $or: references });
    if (!order) {
      throw new AppError('Order not found', 404, ERROR_CODES.ORDER_NOT_FOUND);
    }

    const doc = await OrderDocument.findOne({
      order: order._id,
      customer: userId,
      documentNumber
    });

    if (!doc) {
      throw new AppError('Document not found', 404, ERROR_CODES.DOCUMENT_NOT_FOUND);
    }

    return doc;
  }

  renderPrintableHtml(doc) {
    const safeTitle = escapeHtml(doc.title);
    const safeDocNumber = escapeHtml(doc.documentNumber);
    const safeBadge = escapeHtml(doc.badgeLabel);
    const safeOrderRef = escapeHtml(doc.orderRef);
    const safeCurrency = escapeHtml(doc.currency);
    const safeCustomer = escapeHtml(doc.customerSnapshot?.fullName || 'Customer');
    const safeAddress = escapeHtml(`${doc.shippingAddressSnapshot?.address || ''}, ${doc.shippingAddressSnapshot?.city || ''}, ${doc.shippingAddressSnapshot?.country || ''}`);
    const safeMerchant = escapeHtml(doc.merchantSnapshot?.businessName || 'HARZAAR');

    const itemRows = (doc.items || []).map((item) => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${escapeHtml(item.name)}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: center;">${Number(item.quantity)}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">${safeCurrency} ${Number(item.unitPrice).toFixed(2)}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">${safeCurrency} ${Number(item.lineTotal).toFixed(2)}</td>
      </tr>
    `).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${safeTitle} - ${safeDocNumber}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 40px; color: #1e293b; background: #fff; }
    .doc-card { max-width: 800px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 8px; padding: 40px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 20px; margin-bottom: 30px; }
    .brand { font-size: 28px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px; }
    .doc-meta { text-align: right; }
    .doc-title { font-size: 20px; font-weight: 700; color: #0f172a; margin-bottom: 4px; }
    .badge { display: inline-block; padding: 4px 12px; font-size: 12px; font-weight: 700; background: #e2e8f0; color: #0f172a; border-radius: 9999px; margin-bottom: 6px; }
    .doc-num { font-size: 13px; color: #64748b; font-family: monospace; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 30px; }
    .info-block h4 { margin: 0 0 8px 0; font-size: 13px; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; }
    .info-block p { margin: 0; font-size: 14px; line-height: 1.5; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    th { background: #f8fafc; padding: 12px 10px; font-size: 12px; text-transform: uppercase; color: #475569; text-align: left; border-bottom: 2px solid #cbd5e1; }
    .totals { margin-left: auto; width: 300px; margin-bottom: 30px; }
    .totals-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; }
    .totals-row.grand-total { border-top: 2px solid #0f172a; font-size: 18px; font-weight: 800; color: #0f172a; padding-top: 10px; margin-top: 6px; }
    .footer { border-top: 1px solid #e2e8f0; padding-top: 20px; font-size: 12px; color: #94a3b8; text-align: center; }
    @media print { body { padding: 0; } .doc-card { border: none; box-shadow: none; padding: 0; } }
  </style>
</head>
<body>
  <div class="doc-card">
    <div class="header">
      <div>
        <div class="brand">${safeMerchant}</div>
        <div style="font-size: 13px; color: #64748b; margin-top: 4px;">Order #${safeOrderRef}</div>
      </div>
      <div class="doc-meta">
        <div class="badge">${safeBadge}</div>
        <div class="doc-title">${safeTitle}</div>
        <div class="doc-num">${safeDocNumber}</div>
      </div>
    </div>
    <div class="info-grid">
      <div class="info-block">
        <h4>Issued To</h4>
        <p><strong>${safeCustomer}</strong></p>
        <p>${safeAddress}</p>
      </div>
      <div class="info-block">
        <h4>Classification Details</h4>
        <p>${escapeHtml(doc.classificationReason)}</p>
        <p style="font-size: 12px; color: #64748b; margin-top: 4px;">Issued: ${new Date(doc.issuedAt).toUTCString()}</p>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Item Description</th>
          <th style="text-align: center;">Qty</th>
          <th style="text-align: right;">Unit Price</th>
          <th style="text-align: right;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>
    <div class="totals">
      <div class="totals-row"><span>Subtotal:</span><span>${safeCurrency} ${Number(doc.subtotal).toFixed(2)}</span></div>
      ${doc.discount ? `<div class="totals-row"><span>Discount:</span><span>-${safeCurrency} ${Number(doc.discount).toFixed(2)}</span></div>` : ''}
      ${doc.shipping ? `<div class="totals-row"><span>Shipping:</span><span>${safeCurrency} ${Number(doc.shipping).toFixed(2)}</span></div>` : ''}
      ${doc.tax ? `<div class="totals-row"><span>Tax:</span><span>${safeCurrency} ${Number(doc.tax).toFixed(2)}</span></div>` : ''}
      ${doc.duties ? `<div class="totals-row"><span>Duties:</span><span>${safeCurrency} ${Number(doc.duties).toFixed(2)}</span></div>` : ''}
      <div class="totals-row grand-total"><span>Total:</span><span>${safeCurrency} ${Number(doc.total).toFixed(2)}</span></div>
    </div>
    <div class="footer">
      Official electronic document issued by ${safeMerchant}. Generated under governed jurisdiction rules.
    </div>
  </div>
</body>
</html>`;
  }
}

module.exports = new DocumentService();
