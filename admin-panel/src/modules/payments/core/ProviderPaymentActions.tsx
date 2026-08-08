'use client';

import type { AdminPaymentSummary } from './types';
import CodCollectionAction from '../providers/cod/CodCollectionAction';
import BankTransferReviewAction from '../providers/bank-transfer/BankTransferReviewAction';
import RaastReviewAction from '../providers/raast/RaastReviewAction';

interface ProviderPaymentActionsProps {
  payment: AdminPaymentSummary;
  disabled: boolean;
  onCollect: () => void;
  onReview: (decision: 'approve' | 'reject') => void;
}

const manualActions = {
  bank_transfer: BankTransferReviewAction,
  raast: RaastReviewAction
};

export default function ProviderPaymentActions({
  payment,
  disabled,
  onCollect,
  onReview
}: ProviderPaymentActionsProps) {
  if (payment.provider === 'cod' && payment.status === 'Pending') {
    return <CodCollectionAction disabled={disabled} onCollect={onCollect} />;
  }

  const ManualAction = manualActions[
    payment.provider as keyof typeof manualActions
  ];
  if (ManualAction && payment.status === 'AwaitingVerification') {
    return <ManualAction disabled={disabled} onReview={onReview} />;
  }

  return null;
}
