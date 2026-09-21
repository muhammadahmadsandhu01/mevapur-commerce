/**
 * @file phase8-document-truthfulness.unit.test.js
 * @description Unit tests for Phase 8 Document Truthful Classification, Tax Invoice Invariants,
 * Deterministic Unique Numbering, and Immutable Document Snapshots.
 */

'use strict';

const mongoose = require('mongoose');
const Order = require('../../models/Order');
const OrderDocument = require('../../models/OrderDocument');
const Refund = require('../../models/Refund');
const documentService = require('../../services/document/DocumentService');
const documentClassificationEngine = require('../../services/document/DocumentClassificationEngine');

describe('Phase 8 — Document Truthfulness & Invoice Classification Unit Tests', () => {
  beforeEach(async () => {
    await Order.deleteMany({});
    await OrderDocument.deleteMany({});
    await Refund.deleteMany({});
  });

  it('3.1 never classifies an unpaid or pending order as a tax invoice or official paid receipt', () => {
    const pendingOrder = {
      orderId: 'ORD-PENDING-1',
      paymentStatus: 'Pending',
      taxAmount: 50,
      totalAmount: 550,
      shippingAddress: { countryCode: 'PK' }
    };

    const classification = documentClassificationEngine.classifyOrderDocument({
      order: pendingOrder,
      merchantConfig: { isTaxRegistered: true, taxId: 'STR-12345', jurisdiction: 'PK' }
    });

    expect(classification.documentType).toBe('ORDER_CONFIRMATION');
    expect(classification.isOfficialReceipt).toBe(false);
    expect(classification.badgeLabel).toBe('Payment Pending');
  });

  it('3.2 does not label as TAX_INVOICE if merchant is not registered for tax in the jurisdiction', () => {
    const paidOrder = {
      orderId: 'ORD-PAID-NOTAXREG',
      paymentStatus: 'Paid',
      taxAmount: 15,
      totalAmount: 115,
      shippingAddress: { countryCode: 'US' }
    };

    // Merchant not tax registered in US
    const classification = documentClassificationEngine.classifyOrderDocument({
      order: paidOrder,
      merchantConfig: { isTaxRegistered: false, jurisdiction: 'PK' }
    });

    expect(classification.documentType).toBe('COMMERCIAL_INVOICE');
    expect(classification.isOfficialReceipt).toBe(true);
    expect(classification.title).toContain('Commercial Invoice');
    expect(classification.classificationReason).toContain('not registered for official tax invoice');
  });

  it('3.3 correctly classifies as TAX_INVOICE when paid, tax exists, and merchant is registered in jurisdiction', () => {
    const paidTaxOrder = {
      orderId: 'ORD-PAID-TAXREG',
      paymentStatus: 'Paid',
      taxAmount: 18,
      totalAmount: 118,
      shippingAddress: { countryCode: 'PK' }
    };

    const classification = documentClassificationEngine.classifyOrderDocument({
      order: paidTaxOrder,
      merchantConfig: { isTaxRegistered: true, taxId: 'NTN-7788990-1', jurisdiction: 'PK' }
    });

    expect(classification.documentType).toBe('TAX_INVOICE');
    expect(classification.isOfficialReceipt).toBe(true);
    expect(classification.title).toBe('Tax Invoice');
    expect(classification.badgeLabel).toBe('Tax Compliant Invoice');
  });

  it('3.4 classifies a completed refund as an Official CREDIT_NOTE', () => {
    const refund = {
      refundNumber: 'REF-8899',
      amount: 150,
      currency: 'USD'
    };
    const order = {
      orderId: 'ORD-REF-8899'
    };

    const classification = documentClassificationEngine.classifyRefundDocument({ refund, order });
    expect(classification.documentType).toBe('CREDIT_NOTE');
    expect(classification.isOfficialReceipt).toBe(true);
    expect(classification.title).toBe('Official Credit Note');
  });

  it('3.5 generates deterministic unique document numbers and handles repeat calls idempotently', async () => {
    const userId = new mongoose.Types.ObjectId();
    const productId = new mongoose.Types.ObjectId();
    const mockOrder = await Order.create({
      orderId: 'ORD-DOC-IDEMP-01',
      user: userId,
      idempotencyKey: 'idemp-doc-test-01',
      requestHash: 'hash-doc-test-01',
      items: [
        { product: productId, name: 'Pure Honey', sku: 'HON-01', quantity: 2, price: 1000, lineTotal: 2000 }
      ],
      subtotal: 2000,
      discount: 0,
      shippingCost: 200,
      taxAmount: 0,
      totalAmount: 2200,
      orderStatus: 'Confirmed',
      paymentStatus: 'Paid',
      paymentMethod: 'cod',
      shippingAddress: {
        fullName: 'Customer Ahmad',
        phone: '03001234567',
        address: '123 Main Road',
        city: 'Lahore',
        province: 'Punjab',
        country: 'PK'
      },
      statusTimeline: [{
        status: 'Confirmed',
        actor: userId,
        actorRole: 'customer',
        timestamp: new Date()
      }]
    });

    const doc1 = await documentService.getOrIssueOrderDocument(mockOrder._id, {
      merchantConfig: { businessName: 'HARZAAR', isTaxRegistered: false }
    });

    expect(doc1.documentNumber).toMatch(/^DOC-INV-\d{4}-/);

    const doc2 = await documentService.getOrIssueOrderDocument(mockOrder._id, {
      merchantConfig: { businessName: 'HARZAAR', isTaxRegistered: false }
    });

    expect(doc2._id.toString()).toBe(doc1._id.toString());
    expect(doc2.documentNumber).toBe(doc1.documentNumber);

    const totalDocs = await OrderDocument.countDocuments({ order: mockOrder._id });
    expect(totalDocs).toBe(1);
  });

  it('3.6 renders accessible, printable HTML with proper escaping and exact monetary amounts', async () => {
    const doc = {
      title: 'Commercial Invoice & Payment Receipt',
      documentNumber: 'DOC-INV-2026-TEST-1234',
      badgeLabel: 'Payment Confirmed',
      orderRef: 'ORD-SAFE-99',
      currency: 'PKR',
      subtotal: 2000,
      discount: 200,
      shipping: 150,
      tax: 0,
      total: 1950,
      classificationReason: 'Order is authoritatively settled; classified as Commercial Invoice.',
      issuedAt: new Date(),
      customerSnapshot: {
        fullName: 'Ahmad <script>alert(1)</script>',
        address: 'Main Blvd'
      },
      merchantSnapshot: {
        businessName: 'HARZAAR Premium'
      },
      items: [
        { name: 'Pure Honey <img src=x>', quantity: 2, unitPrice: 1000, lineTotal: 2000 }
      ]
    };

    const html = documentService.renderPrintableHtml(doc);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Commercial Invoice &amp; Payment Receipt');
    expect(html).toContain('DOC-INV-2026-TEST-1234');
    expect(html).not.toContain('<script>');
    expect(html).toContain('Ahmad &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<img');
    expect(html).toContain('Pure Honey &lt;img src=x&gt;');
    expect(html).toContain('PKR 1950.00');
  });
});
