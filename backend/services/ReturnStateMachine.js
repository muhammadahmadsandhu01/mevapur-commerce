const { AppError } = require('../common/errors/AppError');

const RETURN_TRANSITIONS = Object.freeze({
  pending: Object.freeze(['approved', 'rejected', 'cancelled']),
  approved: Object.freeze(['received', 'rejected', 'cancelled']),
  received: Object.freeze(['inspected', 'rejected']),
  inspected: Object.freeze(['rejected']),
  inventory_reconciliation: Object.freeze([]),
  refunded: Object.freeze([]),
  rejected: Object.freeze([]),
  cancelled: Object.freeze([])
});

const assertGenericTransition = (fromStatus, toStatus) => {
  if (fromStatus === toStatus) return false;

  const allowed = RETURN_TRANSITIONS[fromStatus];
  if (!allowed || !Object.hasOwn(RETURN_TRANSITIONS, toStatus)) {
    throw new AppError(
      'Return status is invalid',
      400,
      'RETURN_STATUS_INVALID'
    );
  }
  if (!allowed.includes(toStatus)) {
    throw new AppError(
      `Return cannot transition from ${fromStatus} to ${toStatus}`,
      409,
      'RETURN_STATUS_TRANSITION_INVALID'
    );
  }
  return true;
};

module.exports = {
  RETURN_TRANSITIONS,
  assertGenericTransition
};
