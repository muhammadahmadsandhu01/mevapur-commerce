/**
 * Authoritative Invoice and Receipt Document Classification
 * Distinguishes unverified/pending orders from confirmed paid receipts.
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
  | 'ORDER_CONFIRMATION_PAYMENT_FAILED';

export interface DocumentClassification {
  type: ReceiptDocumentType;
  title: string;
  badgeLabel: string;
  isOfficialReceipt: boolean;
  notes: string;
}

/**
 * Classifies an invoice document strictly based on authoritative backend status.
 * Never labels an unpaid or pending order as an official paid receipt.
 */
export function classifyInvoiceDocument(
  orderPaymentStatus?: OrderPaymentStatus | string | null,
  detailedPaymentStatus?: DetailedPaymentStatus | string | null
): DocumentClassification {
  const normOrderStatus = (orderPaymentStatus || '').trim().toLowerCase();
  const normDetailedStatus = (detailedPaymentStatus || '').trim().toLowerCase();

  // 1. Confirmed Paid Receipts
  if (normOrderStatus === 'paid' || normDetailedStatus === 'completed') {
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
