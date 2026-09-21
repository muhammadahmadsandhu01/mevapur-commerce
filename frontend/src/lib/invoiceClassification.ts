/**
 * Authoritative Invoice and Receipt Document Classification for Phase 8
 * Distinguishes unverified/pending orders from confirmed paid receipts and official tax invoices.
 */

export type OrderPaymentStatus =
  | 'Pending'
  | 'Paid'
  | 'Failed'
  | 'PartiallyRefunded'
  | 'Refunded';

export type DetailedPaymentStatus =
  | 'Pending'
  | 'AwaitingCustomerPayment'
  | 'AwaitingVerification'
  | 'Processing'
  | 'Completed'
  | 'Rejected'
  | 'Failed'
  | 'Expired'
  | 'Cancelled'
  | 'PartiallyRefunded'
  | 'Refunded';

export type ReceiptDocumentType =
  | 'ORDER_CONFIRMATION'
  | 'ORDER_CONFIRMATION_VERIFICATION_PENDING'
  | 'PAYMENT_RECEIPT'
  | 'PAYMENT_RECEIPT_PARTIALLY_REFUNDED'
  | 'PAYMENT_RECEIPT_REFUNDED'
  | 'ORDER_CONFIRMATION_PAYMENT_FAILED'
  | 'COMMERCIAL_INVOICE'
  | 'TAX_INVOICE'
  | 'CREDIT_NOTE'
  | 'REFUND_RECEIPT'
  | 'PRO_FORMA_INVOICE';

export interface DocumentClassification {
  type: ReceiptDocumentType;
  title: string;
  badgeLabel: string;
  isOfficialReceipt: boolean;
  notes: string;
}

export interface ClassificationContext {
  isTaxRegistered?: boolean;
  taxId?: string;
  hasTaxAmount?: boolean;
  isRefund?: boolean;
}

/**
 * Classifies an invoice document strictly based on authoritative backend status.
 * Never labels an unpaid or pending order as an official paid receipt.
 * Never labels a document as a Tax Invoice unless merchant is tax-registered.
 */
export function classifyInvoiceDocument(
  orderPaymentStatus?: OrderPaymentStatus | string | null,
  detailedPaymentStatus?: DetailedPaymentStatus | string | null,
  context: ClassificationContext = {}
): DocumentClassification {
  const normOrderStatus = (orderPaymentStatus || '').trim().toLowerCase();
  const normDetailedStatus = (detailedPaymentStatus || '').trim().toLowerCase();

  // 0. Credit Note / Refund Document
  if (context.isRefund) {
    return {
      type: 'CREDIT_NOTE',
      title: 'Official Credit Note',
      badgeLabel: 'Credit Note Settled',
      isOfficialReceipt: true,
      notes: 'This document certifies an authoritative refund allocation against an issued invoice.',
    };
  }

  // 1. Confirmed Paid Receipts & Invoices
  if (normOrderStatus === 'paid' || normDetailedStatus === 'completed') {
    if (context.isTaxRegistered && context.taxId && context.hasTaxAmount) {
      return {
        type: 'TAX_INVOICE',
        title: 'Official Tax Invoice',
        badgeLabel: 'Tax Compliant',
        isOfficialReceipt: true,
        notes: 'Issued by a registered taxable entity with verified tax identification.',
      };
    }

    return {
      type: 'PAYMENT_RECEIPT',
      title: 'Official Payment Receipt',
      badgeLabel: 'Payment Confirmed',
      isOfficialReceipt: true,
      notes: 'Payment has been authoritatively verified and settled with the merchant.',
    };
  }

  // 2. Partially Refunded Receipts
  if (normOrderStatus === 'partiallyrefunded' || normDetailedStatus === 'partiallyrefunded') {
    return {
      type: 'PAYMENT_RECEIPT_PARTIALLY_REFUNDED',
      title: 'Payment Receipt (Partially Refunded)',
      badgeLabel: 'Partially Refunded',
      isOfficialReceipt: true,
      notes: 'This order has an authoritative partial refund recorded against the settled amount.',
    };
  }

  // 3. Fully Refunded Receipts
  if (normOrderStatus === 'refunded' || normDetailedStatus === 'refunded') {
    return {
      type: 'PAYMENT_RECEIPT_REFUNDED',
      title: 'Payment Receipt (Refunded)',
      badgeLabel: 'Refunded',
      isOfficialReceipt: true,
      notes: 'This order has been authoritatively refunded in full.',
    };
  }

  // 4. Manual Transfer Verification Pending
  if (normDetailedStatus === 'awaitingverification') {
    return {
      type: 'ORDER_CONFIRMATION_VERIFICATION_PENDING',
      title: 'Order Confirmation — Payment Verification Pending',
      badgeLabel: 'Verification Pending',
      isOfficialReceipt: false,
      notes: 'Manual transfer reference submitted. Awaiting merchant account reconciliation.',
    };
  }

  // 5. Failed / Rejected / Expired Payment
  if (
    normOrderStatus === 'failed' ||
    normDetailedStatus === 'failed' ||
    normDetailedStatus === 'rejected' ||
    normDetailedStatus === 'expired'
  ) {
    return {
      type: 'ORDER_CONFIRMATION_PAYMENT_FAILED',
      title: 'Order Confirmation — Payment Unsuccessful',
      badgeLabel: 'Payment Unsuccessful',
      isOfficialReceipt: false,
      notes: 'Payment transaction was not completed. Please retry payment or contact customer support.',
    };
  }

  // 6. Default: Pending / Awaiting Payment Order Confirmation
  return {
    type: 'ORDER_CONFIRMATION',
    title: 'Order Confirmation',
    badgeLabel: 'Payment Pending',
    isOfficialReceipt: false,
    notes: 'Payment is pending settlement. This document confirms order placement, not payment clearance.',
  };
}

export function isOfficialTaxInvoiceEligible(params: {
  paymentStatus?: string | null;
  isTaxRegistered?: boolean;
  taxId?: string;
  taxAmount?: number;
}): boolean {
  const isPaid =
    (params.paymentStatus || '').toLowerCase() === 'paid' ||
    (params.paymentStatus || '').toLowerCase() === 'completed';
  return Boolean(isPaid && params.isTaxRegistered && params.taxId && (params.taxAmount ?? 0) > 0);
}

export function formatDocumentBadge(type: ReceiptDocumentType): { text: string; className: string } {
  switch (type) {
    case 'TAX_INVOICE':
      return { text: 'Official Tax Invoice', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'COMMERCIAL_INVOICE':
      return { text: 'Commercial Invoice', className: 'bg-blue-50 text-blue-700 border-blue-200' };
    case 'PAYMENT_RECEIPT':
      return { text: 'Payment Receipt', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'CREDIT_NOTE':
    case 'REFUND_RECEIPT':
      return { text: 'Official Credit Note', className: 'bg-purple-50 text-purple-700 border-purple-200' };
    case 'ORDER_CONFIRMATION_PAYMENT_FAILED':
      return { text: 'Payment Failed', className: 'bg-rose-50 text-rose-700 border-rose-200' };
    case 'ORDER_CONFIRMATION_VERIFICATION_PENDING':
      return { text: 'Verification Pending', className: 'bg-amber-50 text-amber-700 border-amber-200' };
    case 'ORDER_CONFIRMATION':
    default:
      return { text: 'Order Confirmation', className: 'bg-amber-50 text-amber-700 border-amber-200' };
  }
}
