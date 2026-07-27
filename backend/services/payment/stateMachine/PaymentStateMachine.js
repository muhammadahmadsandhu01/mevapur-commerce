const { AppError } = require('../../../errors/AppError');

class PaymentStateMachine {
  constructor() {
    // Define valid transitions
    this.transitions = {
      'Pending': ['Processing', 'Failed', 'Cancelled'],
      'Processing': ['RequiresAction', 'Authorized', 'Captured', 'Completed', 'Failed'],
      'RequiresAction': ['Processing', 'Authorized', 'Failed', 'Cancelled'],
      'Authorized': ['Captured', 'Completed', 'Cancelled', 'Failed'],
      'Captured': ['Completed', 'RefundPending', 'Refunded'],
      'Completed': ['RefundPending', 'Refunded'],
      'Failed': ['Pending'], // Allow retry logic if needed
      'RefundPending': ['Refunded', 'Failed'],
      'Refunded': [], // Terminal state
      'Cancelled': [] // Terminal state
    };
  }

  canTransition(currentStatus, newStatus) {
    const allowedNextStates = this.transitions[currentStatus];
    return allowedNextStates && allowedNextStates.includes(newStatus);
  }

  async transition(payment, newStatus, metadata = {}) {
    if (!this.canTransition(payment.status, newStatus)) {
      throw new AppError(
        `Invalid status transition from ${payment.status} to ${newStatus}`,
        400,
        'INVALID_STATE_TRANSITION'
      );
    }

    const previousStatus = payment.status;
    payment.status = newStatus;
    
    // Add audit log
    payment.auditLogs.push({
      action: 'STATUS_CHANGE',
      status: newStatus,
      previousStatus,
      timestamp: new Date(),
      metadata
    });

    if (newStatus === 'Completed') {
      payment.completedAt = new Date();
    } else if (newStatus === 'Failed' && metadata.reason) {
      payment.failureReason = metadata.reason;
    }

    await payment.save();
    return payment;
  }
}

module.exports = new PaymentStateMachine();