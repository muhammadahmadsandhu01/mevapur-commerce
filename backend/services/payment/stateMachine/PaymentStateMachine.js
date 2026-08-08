const { AppError } = require('../../../utils/errors/AppError');
const { PAYMENT_STATUSES } = require('../../../constants/paymentConstants');

const transitions = Object.freeze({
  [PAYMENT_STATUSES.PENDING]: [
    PAYMENT_STATUSES.AWAITING_CUSTOMER_PAYMENT,
    PAYMENT_STATUSES.AWAITING_VERIFICATION,
    PAYMENT_STATUSES.PROCESSING,
    PAYMENT_STATUSES.COMPLETED,
    PAYMENT_STATUSES.FAILED,
    PAYMENT_STATUSES.CANCELLED
  ],
  [PAYMENT_STATUSES.AWAITING_CUSTOMER_PAYMENT]: [
    PAYMENT_STATUSES.AWAITING_VERIFICATION,
    PAYMENT_STATUSES.CANCELLED,
    PAYMENT_STATUSES.EXPIRED
  ],
  [PAYMENT_STATUSES.AWAITING_VERIFICATION]: [
    PAYMENT_STATUSES.COMPLETED,
    PAYMENT_STATUSES.REJECTED,
    PAYMENT_STATUSES.CANCELLED,
    PAYMENT_STATUSES.EXPIRED
  ],
  [PAYMENT_STATUSES.PROCESSING]: [
    PAYMENT_STATUSES.COMPLETED,
    PAYMENT_STATUSES.FAILED,
    PAYMENT_STATUSES.CANCELLED
  ],
  [PAYMENT_STATUSES.FAILED]: [
    PAYMENT_STATUSES.PROCESSING,
    PAYMENT_STATUSES.COMPLETED,
    PAYMENT_STATUSES.CANCELLED
  ],
  [PAYMENT_STATUSES.REJECTED]: [],
  [PAYMENT_STATUSES.EXPIRED]: [],
  [PAYMENT_STATUSES.COMPLETED]: [
    PAYMENT_STATUSES.PARTIALLY_REFUNDED,
    PAYMENT_STATUSES.REFUNDED
  ],
  [PAYMENT_STATUSES.PARTIALLY_REFUNDED]: [
    PAYMENT_STATUSES.REFUNDED
  ],
  [PAYMENT_STATUSES.REFUNDED]: [],
  [PAYMENT_STATUSES.CANCELLED]: []
});

class PaymentStateMachine {
  canTransition(currentStatus, nextStatus) {
    if (currentStatus === nextStatus) {
      return true;
    }

    return Boolean(transitions[currentStatus]?.includes(nextStatus));
  }

  apply(payment, nextStatus, {
    source = 'system',
    providerEventId = '',
    errorCode = '',
    at = new Date()
  } = {}) {
    if (!this.canTransition(payment.status, nextStatus)) {
      throw new AppError(
        'The payment status transition is not permitted',
        409,
        'PAYMENT_STATUS_TRANSITION_INVALID'
      );
    }

    if (payment.status === nextStatus) {
      return payment;
    }

    const previousStatus = payment.status;
    payment.status = nextStatus;
    payment.history.push({
      previousStatus,
      newStatus: nextStatus,
      source,
      providerEventId,
      errorCode,
      timestamp: at
    });

    if (nextStatus === PAYMENT_STATUSES.COMPLETED) {
      payment.completedAt = payment.completedAt || at;
      payment.failureCode = '';
    } else if (
      nextStatus === PAYMENT_STATUSES.FAILED
      || nextStatus === PAYMENT_STATUSES.REJECTED
    ) {
      payment.failedAt = at;
      payment.failureCode = errorCode;
    } else if (nextStatus === PAYMENT_STATUSES.CANCELLED) {
      payment.cancelledAt = at;
    }

    return payment;
  }
}

module.exports = new PaymentStateMachine();
