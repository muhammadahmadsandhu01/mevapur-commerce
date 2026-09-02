const { CANONICAL_ROLES, STAFF_ROLES } = require('../constants/roleConstants');
const { AppError } = require('../common/errors/AppError');
const ERROR_CODES = require('../constants/errorCodes');

const ACTIONS = Object.freeze({
  // Dashboard & General
  VIEW_DASHBOARD: 'view_dashboard',
  VIEW_ROLES: 'view_roles',
  EXPORT_DATA: 'export_data',

  // Products, Catalog & Inventory
  VIEW_PRODUCTS: 'view_products',
  MANAGE_PRODUCTS: 'manage_products',
  PUBLISH_PRODUCTS: 'publish_products',
  VIEW_CATEGORIES: 'view_categories',
  MANAGE_CATEGORIES: 'manage_categories',
  VIEW_BRANDS: 'view_brands',
  MANAGE_BRANDS: 'manage_brands',
  VIEW_INVENTORY: 'view_inventory',
  ADJUST_INVENTORY: 'adjust_inventory',

  // Orders, Returns & Customers
  VIEW_ORDERS: 'view_orders',
  MANAGE_ORDERS: 'manage_orders',
  VIEW_RETURNS: 'view_returns',
  MANAGE_RETURNS: 'manage_returns',
  PROCESS_REFUNDS: 'process_refunds',
  VIEW_CUSTOMERS: 'view_customers',
  BLOCK_CUSTOMERS: 'block_customers',

  // Reviews & Moderation
  VIEW_REVIEWS: 'view_reviews',
  MODERATE_REVIEWS: 'moderate_reviews',
  DELETE_REVIEWS: 'delete_reviews',

  // Coupons & Promotions
  VIEW_COUPONS: 'view_coupons',
  MANAGE_COUPONS: 'manage_coupons',
  DELETE_COUPON_DRAFTS: 'delete_coupon_drafts',

  // Reports & Analytics
  VIEW_REPORTS: 'view_reports',
  EXPORT_REPORTS: 'export_reports',

  // Content, Shipping & Notifications
  VIEW_SHIPPING: 'view_shipping',
  MANAGE_SHIPPING: 'manage_shipping',
  VIEW_CONTENT: 'view_content',
  MANAGE_CONTENT: 'manage_content',
  VIEW_NOTIFICATIONS: 'view_notifications',
  MANAGE_NOTIFICATIONS: 'manage_notifications',

  // Activity & Audit Logs
  VIEW_ACTIVITY_LOGS: 'view_activity_logs',
  EXPORT_ACTIVITY_LOGS: 'export_activity_logs',
  VIEW_AUDIT_LOGS: 'view_audit_logs',
  EXPORT_AUDIT_LOGS: 'export_audit_logs',

  // Staff & Administration
  VIEW_STAFF: 'view_staff',
  MANAGE_STAFF: 'manage_staff',
  MANAGE_ROLES: 'manage_roles',
  VIEW_SETTINGS: 'view_settings',
  MANAGE_SETTINGS: 'manage_settings',
  MANAGE_MFA: 'manage_mfa'
});

const ROLE_PERMISSIONS = Object.freeze({
  [CANONICAL_ROLES.CUSTOMER]: new Set([]),

  [CANONICAL_ROLES.SUPPORT]: new Set([
    ACTIONS.VIEW_DASHBOARD,
    ACTIONS.VIEW_ROLES,
    ACTIONS.VIEW_PRODUCTS,
    ACTIONS.VIEW_CATEGORIES,
    ACTIONS.VIEW_BRANDS,
    ACTIONS.VIEW_INVENTORY,
    ACTIONS.VIEW_ORDERS,
    ACTIONS.MANAGE_ORDERS,
    ACTIONS.VIEW_RETURNS,
    ACTIONS.MANAGE_RETURNS,
    ACTIONS.PROCESS_REFUNDS,
    ACTIONS.VIEW_CUSTOMERS,
    ACTIONS.VIEW_REVIEWS,
    ACTIONS.MODERATE_REVIEWS,
    ACTIONS.VIEW_COUPONS,
    ACTIONS.VIEW_SHIPPING,
    ACTIONS.VIEW_CONTENT,
    ACTIONS.VIEW_NOTIFICATIONS
  ]),

  [CANONICAL_ROLES.INVENTORY]: new Set([
    ACTIONS.VIEW_DASHBOARD,
    ACTIONS.VIEW_ROLES,
    ACTIONS.VIEW_PRODUCTS,
    ACTIONS.VIEW_CATEGORIES,
    ACTIONS.VIEW_BRANDS,
    ACTIONS.VIEW_INVENTORY,
    ACTIONS.ADJUST_INVENTORY,
    ACTIONS.VIEW_ORDERS,
    ACTIONS.VIEW_SHIPPING,
    ACTIONS.VIEW_NOTIFICATIONS
  ]),

  [CANONICAL_ROLES.MANAGER]: new Set([
    ACTIONS.VIEW_DASHBOARD,
    ACTIONS.VIEW_ROLES,
    ACTIONS.EXPORT_DATA,
    ACTIONS.VIEW_PRODUCTS,
    ACTIONS.MANAGE_PRODUCTS,
    ACTIONS.PUBLISH_PRODUCTS,
    ACTIONS.VIEW_CATEGORIES,
    ACTIONS.MANAGE_CATEGORIES,
    ACTIONS.VIEW_BRANDS,
    ACTIONS.MANAGE_BRANDS,
    ACTIONS.VIEW_INVENTORY,
    ACTIONS.ADJUST_INVENTORY,
    ACTIONS.VIEW_ORDERS,
    ACTIONS.MANAGE_ORDERS,
    ACTIONS.VIEW_RETURNS,
    ACTIONS.MANAGE_RETURNS,
    ACTIONS.PROCESS_REFUNDS,
    ACTIONS.VIEW_CUSTOMERS,
    ACTIONS.BLOCK_CUSTOMERS,
    ACTIONS.VIEW_REVIEWS,
    ACTIONS.MODERATE_REVIEWS,
    ACTIONS.VIEW_COUPONS,
    ACTIONS.MANAGE_COUPONS,
    ACTIONS.VIEW_REPORTS,
    ACTIONS.EXPORT_REPORTS,
    ACTIONS.VIEW_SHIPPING,
    ACTIONS.MANAGE_SHIPPING,
    ACTIONS.VIEW_CONTENT,
    ACTIONS.MANAGE_CONTENT,
    ACTIONS.VIEW_NOTIFICATIONS,
    ACTIONS.MANAGE_NOTIFICATIONS
  ]),

  [CANONICAL_ROLES.ADMIN]: new Set([
    ACTIONS.VIEW_DASHBOARD,
    ACTIONS.VIEW_ROLES,
    ACTIONS.EXPORT_DATA,
    ACTIONS.VIEW_PRODUCTS,
    ACTIONS.MANAGE_PRODUCTS,
    ACTIONS.PUBLISH_PRODUCTS,
    ACTIONS.VIEW_CATEGORIES,
    ACTIONS.MANAGE_CATEGORIES,
    ACTIONS.VIEW_BRANDS,
    ACTIONS.MANAGE_BRANDS,
    ACTIONS.VIEW_INVENTORY,
    ACTIONS.ADJUST_INVENTORY,
    ACTIONS.VIEW_ORDERS,
    ACTIONS.MANAGE_ORDERS,
    ACTIONS.VIEW_RETURNS,
    ACTIONS.MANAGE_RETURNS,
    ACTIONS.PROCESS_REFUNDS,
    ACTIONS.VIEW_CUSTOMERS,
    ACTIONS.BLOCK_CUSTOMERS,
    ACTIONS.VIEW_REVIEWS,
    ACTIONS.MODERATE_REVIEWS,
    ACTIONS.DELETE_REVIEWS,
    ACTIONS.VIEW_COUPONS,
    ACTIONS.MANAGE_COUPONS,
    ACTIONS.VIEW_REPORTS,
    ACTIONS.EXPORT_REPORTS,
    ACTIONS.VIEW_SHIPPING,
    ACTIONS.MANAGE_SHIPPING,
    ACTIONS.VIEW_CONTENT,
    ACTIONS.MANAGE_CONTENT,
    ACTIONS.VIEW_NOTIFICATIONS,
    ACTIONS.MANAGE_NOTIFICATIONS,
    ACTIONS.VIEW_ACTIVITY_LOGS,
    ACTIONS.EXPORT_ACTIVITY_LOGS,
    ACTIONS.VIEW_STAFF,
    ACTIONS.VIEW_SETTINGS,
    ACTIONS.MANAGE_MFA
  ]),

  [CANONICAL_ROLES.SUPER_ADMIN]: new Set([
    ...Object.values(ACTIONS)
  ])
});

class PolicyService {
  ACTIONS = ACTIONS;
  CANONICAL_ROLES = CANONICAL_ROLES;
  STAFF_ROLES = STAFF_ROLES;

  /**
   * Check if role has permission to perform action
   * Fails closed (false) for unknown roles or unknown actions
   */
  can(role, action) {
    if (!role || typeof role !== 'string') return false;
    const permissions = ROLE_PERMISSIONS[role.toLowerCase()];
    if (!permissions) return false;
    return permissions.has(action);
  }

  /**
   * Express middleware factory requiring an explicit action permission
   */
  requirePermission(action) {
    return (req, res, next) => {
      if (!req.user) {
        return next(new AppError(
          'Authentication is required',
          401,
          ERROR_CODES.AUTH_TOKEN_REQUIRED
        ));
      }

      if (!this.can(req.user.role, action)) {
        return next(new AppError(
          `Access forbidden: requires permission '${action}'`,
          403,
          ERROR_CODES.AUTH_FORBIDDEN
        ));
      }

      return next();
    };
  }

  /**
   * Return full capability summary for a specific role (used in API and frontend serialization)
   */
  getRoleCapabilities(role) {
    const r = (role || '').toLowerCase();
    const canDo = (action) => this.can(r, action);

    return {
      role: r,
      isStaff: STAFF_ROLES.includes(r),
      canViewDashboard: canDo(ACTIONS.VIEW_DASHBOARD),
      canManageProducts: canDo(ACTIONS.MANAGE_PRODUCTS),
      canPublishProducts: canDo(ACTIONS.PUBLISH_PRODUCTS),
      canAdjustInventory: canDo(ACTIONS.ADJUST_INVENTORY),
      canManageOrders: canDo(ACTIONS.MANAGE_ORDERS),
      canManageReturns: canDo(ACTIONS.MANAGE_RETURNS),
      canBlockCustomers: canDo(ACTIONS.BLOCK_CUSTOMERS),
      canModerateReviews: canDo(ACTIONS.MODERATE_REVIEWS),
      canDeleteReviews: canDo(ACTIONS.DELETE_REVIEWS),
      canManageCoupons: canDo(ACTIONS.MANAGE_COUPONS),
      canDeleteCouponDrafts: canDo(ACTIONS.DELETE_COUPON_DRAFTS),
      canViewReports: canDo(ACTIONS.VIEW_REPORTS),
      canExportReports: canDo(ACTIONS.EXPORT_REPORTS),
      canManageShipping: canDo(ACTIONS.MANAGE_SHIPPING),
      canManageContent: canDo(ACTIONS.MANAGE_CONTENT),
      canViewActivityLogs: canDo(ACTIONS.VIEW_ACTIVITY_LOGS),
      canViewAuditLogs: canDo(ACTIONS.VIEW_AUDIT_LOGS),
      canManageStaff: canDo(ACTIONS.MANAGE_STAFF),
      canManageRoles: canDo(ACTIONS.MANAGE_ROLES),
      canViewSettings: canDo(ACTIONS.VIEW_SETTINGS),
      canManageSettings: canDo(ACTIONS.MANAGE_SETTINGS),
      canManageMfa: canDo(ACTIONS.MANAGE_MFA)
    };
  }

  /**
   * Return all permissions structured for the Admin Roles page
   */
  getAllRolePermissions() {
    const rolesList = [
      { id: CANONICAL_ROLES.SUPER_ADMIN, name: 'Super Admin', description: 'Full root access to all system resources, audit logs, staff provisioning, and settings' },
      { id: CANONICAL_ROLES.ADMIN, name: 'Administrator', description: 'Operational control over catalog, orders, reviews, staff views, and activity logs' },
      { id: CANONICAL_ROLES.MANAGER, name: 'Store Manager', description: 'Catalog management, inventory, promotions, reports, and customer moderation' },
      { id: CANONICAL_ROLES.SUPPORT, name: 'Customer Support', description: 'Order triage, return and refund processing, and review moderation' },
      { id: CANONICAL_ROLES.INVENTORY, name: 'Inventory Specialist', description: 'Stock tracking, warehouse adjustments, and shipping logistics' },
      { id: CANONICAL_ROLES.CUSTOMER, name: 'Customer (Storefront)', description: 'Public storefront shopper account with zero administrative access' }
    ];

    return rolesList.map((r) => ({
      ...r,
      permissions: Array.from(ROLE_PERMISSIONS[r.id] || []),
      capabilities: this.getRoleCapabilities(r.id)
    }));
  }
}

module.exports = new PolicyService();