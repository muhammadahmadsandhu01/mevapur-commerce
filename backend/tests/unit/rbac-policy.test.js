const PolicyService = require('../../services/PolicyService');
const { CANONICAL_ROLES, STAFF_ROLES } = require('../../constants/roleConstants');

describe('Canonical RBAC & PolicyService Unit Tests', () => {
  const { ACTIONS } = PolicyService;

  test('canonical roles list contains exactly the 6 required roles', () => {
    const roles = Object.values(CANONICAL_ROLES);
    expect(roles).toEqual([
      'customer',
      'support',
      'inventory',
      'manager',
      'admin',
      'super_admin'
    ]);
  });

  test('staff roles list contains all non-customer roles', () => {
    expect(STAFF_ROLES).toEqual([
      'support',
      'inventory',
      'manager',
      'admin',
      'super_admin'
    ]);
  });

  describe('Table-driven role permission checks', () => {
    const table = [
      // Customer: 0 admin permissions
      { role: 'customer', action: ACTIONS.VIEW_DASHBOARD, expected: false },
      { role: 'customer', action: ACTIONS.VIEW_PRODUCTS, expected: false },
      { role: 'customer', action: ACTIONS.MANAGE_STAFF, expected: false },

      // Support: can view products, view orders, manage orders, view returns, moderate reviews, but NOT publish products or manage staff
      { role: 'support', action: ACTIONS.VIEW_DASHBOARD, expected: true },
      { role: 'support', action: ACTIONS.VIEW_PRODUCTS, expected: true },
      { role: 'support', action: ACTIONS.MANAGE_PRODUCTS, expected: false },
      { role: 'support', action: ACTIONS.PUBLISH_PRODUCTS, expected: false },
      { role: 'support', action: ACTIONS.ADJUST_INVENTORY, expected: false },
      { role: 'support', action: ACTIONS.VIEW_ORDERS, expected: true },
      { role: 'support', action: ACTIONS.MANAGE_ORDERS, expected: true },
      { role: 'support', action: ACTIONS.VIEW_RETURNS, expected: true },
      { role: 'support', action: ACTIONS.MANAGE_RETURNS, expected: true },
      { role: 'support', action: ACTIONS.PROCESS_REFUNDS, expected: true },
      { role: 'support', action: ACTIONS.MODERATE_REVIEWS, expected: true },
      { role: 'support', action: ACTIONS.DELETE_REVIEWS, expected: false },
      { role: 'support', action: ACTIONS.MANAGE_STAFF, expected: false },

      // Inventory: can view products, adjust inventory, view orders, but NOT manage orders or manage coupons
      { role: 'inventory', action: ACTIONS.VIEW_DASHBOARD, expected: true },
      { role: 'inventory', action: ACTIONS.VIEW_PRODUCTS, expected: true },
      { role: 'inventory', action: ACTIONS.ADJUST_INVENTORY, expected: true },
      { role: 'inventory', action: ACTIONS.MANAGE_ORDERS, expected: false },
      { role: 'inventory', action: ACTIONS.MODERATE_REVIEWS, expected: false },
      { role: 'inventory', action: ACTIONS.MANAGE_COUPONS, expected: false },
      { role: 'inventory', action: ACTIONS.MANAGE_STAFF, expected: false },

      // Manager: can manage products, publish, adjust inventory, manage orders, coupons, reports, but NOT delete reviews or manage staff
      { role: 'manager', action: ACTIONS.VIEW_DASHBOARD, expected: true },
      { role: 'manager', action: ACTIONS.MANAGE_PRODUCTS, expected: true },
      { role: 'manager', action: ACTIONS.PUBLISH_PRODUCTS, expected: true },
      { role: 'manager', action: ACTIONS.ADJUST_INVENTORY, expected: true },
      { role: 'manager', action: ACTIONS.MANAGE_ORDERS, expected: true },
      { role: 'manager', action: ACTIONS.MANAGE_COUPONS, expected: true },
      { role: 'manager', action: ACTIONS.VIEW_REPORTS, expected: true },
      { role: 'manager', action: ACTIONS.EXPORT_REPORTS, expected: true },
      { role: 'manager', action: ACTIONS.DELETE_REVIEWS, expected: false },
      { role: 'manager', action: ACTIONS.VIEW_ACTIVITY_LOGS, expected: false },
      { role: 'manager', action: ACTIONS.VIEW_AUDIT_LOGS, expected: false },
      { role: 'manager', action: ACTIONS.MANAGE_STAFF, expected: false },

      // Admin: can delete reviews, view activity logs, view staff, view settings, but NOT view audit logs or manage staff
      { role: 'admin', action: ACTIONS.VIEW_DASHBOARD, expected: true },
      { role: 'admin', action: ACTIONS.MANAGE_PRODUCTS, expected: true },
      { role: 'admin', action: ACTIONS.DELETE_REVIEWS, expected: true },
      { role: 'admin', action: ACTIONS.VIEW_ACTIVITY_LOGS, expected: true },
      { role: 'admin', action: ACTIONS.EXPORT_ACTIVITY_LOGS, expected: true },
      { role: 'admin', action: ACTIONS.VIEW_STAFF, expected: true },
      { role: 'admin', action: ACTIONS.VIEW_SETTINGS, expected: true },
      { role: 'admin', action: ACTIONS.VIEW_AUDIT_LOGS, expected: false },
      { role: 'admin', action: ACTIONS.MANAGE_STAFF, expected: false },
      { role: 'admin', action: ACTIONS.MANAGE_SETTINGS, expected: false },

      // SuperAdmin: can perform ALL actions
      { role: 'super_admin', action: ACTIONS.VIEW_DASHBOARD, expected: true },
      { role: 'super_admin', action: ACTIONS.DELETE_COUPON_DRAFTS, expected: true },
      { role: 'super_admin', action: ACTIONS.VIEW_AUDIT_LOGS, expected: true },
      { role: 'super_admin', action: ACTIONS.EXPORT_AUDIT_LOGS, expected: true },
      { role: 'super_admin', action: ACTIONS.MANAGE_STAFF, expected: true },
      { role: 'super_admin', action: ACTIONS.MANAGE_ROLES, expected: true },
      { role: 'super_admin', action: ACTIONS.MANAGE_SETTINGS, expected: true },

      // Unknown / Empty / Malformed roles: fail closed
      { role: 'guest', action: ACTIONS.VIEW_DASHBOARD, expected: false },
      { role: 'hacker', action: ACTIONS.MANAGE_STAFF, expected: false },
      { role: '', action: ACTIONS.VIEW_DASHBOARD, expected: false },
      { role: null, action: ACTIONS.VIEW_DASHBOARD, expected: false },
      { role: undefined, action: ACTIONS.VIEW_DASHBOARD, expected: false }
    ];

    test.each(table)(
      'role "$role" checking action "$action" returns $expected',
      ({ role, action, expected }) => {
        expect(PolicyService.can(role, action)).toBe(expected);
      }
    );
  });

  describe('getRoleCapabilities', () => {
    test('returns structured capabilities mapping for support', () => {
      const caps = PolicyService.getRoleCapabilities('support');
      expect(caps.isStaff).toBe(true);
      expect(caps.canViewDashboard).toBe(true);
      expect(caps.canManageOrders).toBe(true);
      expect(caps.canManageProducts).toBe(false);
      expect(caps.canManageStaff).toBe(false);
    });

    test('returns structured capabilities mapping for super_admin', () => {
      const caps = PolicyService.getRoleCapabilities('super_admin');
      expect(caps.isStaff).toBe(true);
      expect(caps.canViewDashboard).toBe(true);
      expect(caps.canManageProducts).toBe(true);
      expect(caps.canManageStaff).toBe(true);
      expect(caps.canViewAuditLogs).toBe(true);
      expect(caps.canManageSettings).toBe(true);
    });
  });

  describe('requirePermission middleware', () => {
    test('throws 401 when request has no user', () => {
      const middleware = PolicyService.requirePermission(ACTIONS.VIEW_DASHBOARD);
      const req = {};
      const res = {};
      const next = jest.fn();

      middleware(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      const error = next.mock.calls[0][0];
      expect(error.statusCode).toBe(401);
      expect(error.errorCode).toBe('AUTH_TOKEN_REQUIRED');
    });

    test('throws 403 when user does not have permission', () => {
      const middleware = PolicyService.requirePermission(ACTIONS.MANAGE_STAFF);
      const req = { user: { role: 'support' } };
      const res = {};
      const next = jest.fn();

      middleware(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      const error = next.mock.calls[0][0];
      expect(error.statusCode).toBe(403);
      expect(error.errorCode).toBe('AUTH_FORBIDDEN');
    });

    test('calls next() when user has permission', () => {
      const middleware = PolicyService.requirePermission(ACTIONS.VIEW_ORDERS);
      const req = { user: { role: 'support' } };
      const res = {};
      const next = jest.fn();

      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });
  });
});
