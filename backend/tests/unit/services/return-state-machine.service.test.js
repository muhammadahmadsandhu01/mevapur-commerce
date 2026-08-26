const {
  RETURN_TRANSITIONS,
  assertGenericTransition
} = require('../../../services/ReturnStateMachine');

describe('ReturnStateMachine', () => {
  test('enforces the complete generic transition matrix', () => {
    const statuses = Object.keys(RETURN_TRANSITIONS);

    for (const fromStatus of statuses) {
      for (const toStatus of statuses) {
        if (fromStatus === toStatus) {
          expect(assertGenericTransition(fromStatus, toStatus)).toBe(false);
          continue;
        }

        if (RETURN_TRANSITIONS[fromStatus].includes(toStatus)) {
          expect(assertGenericTransition(fromStatus, toStatus)).toBe(true);
        } else {
          expect(() => assertGenericTransition(fromStatus, toStatus))
            .toThrow(expect.objectContaining({
              code: 'RETURN_STATUS_TRANSITION_INVALID',
              statusCode: 409
            }));
        }
      }
    }
  });

  test('terminal and reconciliation states cannot be reactivated generically', () => {
    for (const terminalStatus of [
      'refunded',
      'rejected',
      'cancelled',
      'inventory_reconciliation'
    ]) {
      expect(RETURN_TRANSITIONS[terminalStatus]).toEqual([]);
      expect(() => assertGenericTransition(terminalStatus, 'approved'))
        .toThrow(expect.objectContaining({
          code: 'RETURN_STATUS_TRANSITION_INVALID'
        }));
    }
  });
});
