/**
 * @file OrderDocument.js
 * @description Authoritative Document Model for Phase 8.
 * Persists truthful order confirmations, payment receipts, commercial invoices,
 * credit notes, refund receipts, and tax invoices with immutable snapshots.
 */

'use strict';

const mongoose = require('mongoose');

const orderDocumentSchema = new mongoose.Schema({
  documentNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: 128
  },
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true
  },
  orderRef: {
    type: String,
    required: true,
    trim: true,
    maxlength: 128,
    index: true
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  documentType: {
    type: String,
    required: true,
    enum: [
      'ORDER_CONFIRMATION',
      'PAYMENT_RECEIPT',
      'PRO_FORMA_INVOICE',
      'COMMERCIAL_INVOICE',
      'CREDIT_NOTE',
      'REFUND_RECEIPT',
      'TAX_INVOICE'
    ],
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  badgeLabel: {
    type: String,
    default: '',
    maxlength: 100
  },
  isOfficialReceipt: {
    type: Boolean,
    default: false
  },
  classificationReason: {
    type: String,
    default: '',
    maxlength: 255
  },
  classificationVersion: {
    type: String,
    default: '1.0',
    maxlength: 32
  },
  currency: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    maxlength: 3
  },
  subtotal: {
    type: Number,
    required: true
  },
  discount: {
    type: Number,
    default: 0
  },
  shipping: {
    type: Number,
    default: 0
  },
  tax: {
    type: Number,
    default: 0
  },
  duties: {
    type: Number,
    default: 0
  },
  total: {
    type: Number,
    required: true
  },
  refundedAmount: {
    type: Number,
    default: 0
  },
  items: [{
    name: { type: String, required: true },
    sku: { type: String, default: '' },
    quantity: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
    lineTotal: { type: Number, required: true },
    taxAmount: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 }
  }],
  customerSnapshot: {
    fullName: { type: String, default: '' },
    email: { type: String, default: '' },
    phone: { type: String, default: '' }
  },
  shippingAddressSnapshot: {
    fullName: { type: String, default: '' },
    phone: { type: String, default: '' },
    address: { type: String, default: '' },
    addressLine2: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    postalCode: { type: String, default: '' },
    country: { type: String, default: '' },
    countryCode: { type: String, default: '' }
  },
  merchantSnapshot: {
    businessName: { type: String, default: 'HARZAAR' },
    taxId: { type: String, default: '' },
    isTaxRegistered: { type: Boolean, default: false },
    supportEmail: { type: String, default: 'support@harzaar.com' },
    address: { type: String, default: '' },
    jurisdiction: { type: String, default: 'PK' }
  },
  taxJurisdictionSnapshot: {
    countryCode: { type: String, default: '' },
    taxType: { type: String, default: '' },
    taxRatePercent: { type: Number, default: 0 },
    taxTreatment: { type: String, default: '' }
  },
  relatedRefundId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Refund',
    default: null
  },
  relatedPaymentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment',
    default: null
  },
  status: {
    type: String,
    enum: ['ISSUED', 'VOIDED', 'SUPERSEDED'],
    default: 'ISSUED',
    required: true,
    index: true
  },
  issuedAt: {
    type: Date,
    default: Date.now
  },
  voidedAt: {
    type: Date,
    default: null
  },
  supersededByDocumentNumber: {
    type: String,
    default: ''
  }
}, {
  timestamps: true,
  strict: 'throw'
});

orderDocumentSchema.index(
  { documentNumber: 1 },
  { unique: true, name: 'unique_document_number' }
);

orderDocumentSchema.index(
  { order: 1, documentType: 1, status: 1 },
  { name: 'idx_order_doctype_status' }
);

orderDocumentSchema.index(
  { customer: 1, createdAt: -1 },
  { name: 'idx_customer_documents' }
);

module.exports = mongoose.models.OrderDocument
  || mongoose.model('OrderDocument', orderDocumentSchema);
