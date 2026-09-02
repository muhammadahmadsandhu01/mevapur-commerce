export const CANONICAL_ROLES = {
  CUSTOMER: 'customer',
  SUPPORT: 'support',
  INVENTORY: 'inventory',
  MANAGER: 'manager',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin'
} as const;

export type CanonicalRole = typeof CANONICAL_ROLES[keyof typeof CANONICAL_ROLES];

export interface RoleCapabilities {
  role: string;
  isStaff: boolean;
  canViewDashboard: boolean;
  canManageProducts: boolean;
  canPublishProducts: boolean;
  canAdjustInventory: boolean;
  canManageOrders: boolean;
  canManageReturns: boolean;
  canBlockCustomers: boolean;
  canModerateReviews: boolean;
  canDeleteReviews: boolean;
  canManageCoupons: boolean;
  canDeleteCouponDrafts: boolean;
  canViewReports: boolean;
  canExportReports: boolean;
  canManageShipping: boolean;
  canManageContent: boolean;
  canViewActivityLogs: boolean;
  canViewAuditLogs: boolean;
  canManageStaff: boolean;
  canManageRoles: boolean;
  canViewSettings: boolean;
  canManageSettings: boolean;
  canManageMfa: boolean;
}

export function getRoleCapabilities(role: string | null | undefined): RoleCapabilities {
  const r = (role || '').toLowerCase();
  const isSuperAdmin = r === 'super_admin';
  const isAdmin = r === 'admin' || isSuperAdmin;
  const isManager = r === 'manager' || isAdmin;
  const isSupport = r === 'support' || isManager;
  const isInventory = r === 'inventory' || isManager;
  const isStaff = ['support', 'inventory', 'manager', 'admin', 'super_admin'].includes(r);

  return {
    role: r,
    isStaff,
    canViewDashboard: isStaff,
    canManageProducts: isManager,
    canPublishProducts: isManager,
    canAdjustInventory: isInventory,
    canManageOrders: isSupport,
    canManageReturns: isSupport,
    canBlockCustomers: isManager,
    canModerateReviews: isSupport,
    canDeleteReviews: isAdmin,
    canManageCoupons: isManager,
    canDeleteCouponDrafts: isSuperAdmin,
    canViewReports: isManager,
    canExportReports: isManager,
    canManageShipping: isManager || isInventory || isSupport,
    canManageContent: isManager,
    canViewActivityLogs: isAdmin,
    canViewAuditLogs: isSuperAdmin,
    canManageStaff: isSuperAdmin,
    canManageRoles: isSuperAdmin,
    canViewSettings: isAdmin,
    canManageSettings: isSuperAdmin,
    canManageMfa: isAdmin
  };
}

export const ROLE_METADATA = [
  {
    id: 'super_admin',
    name: 'Super Admin',
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800',
    description: 'Root access to all administrative capabilities, financial audits, staff provisioning, and system settings'
  },
  {
    id: 'admin',
    name: 'Administrator',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
    description: 'Full operational oversight of catalog, customer orders, reviews, staff views, and activity logs'
  },
  {
    id: 'manager',
    name: 'Store Manager',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800',
    description: 'Product authoring, catalog publishing, discount promotions, reports, and customer moderation'
  },
  {
    id: 'support',
    name: 'Customer Support',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
    description: 'Customer order triage, returns, refund processing, and customer review moderation'
  },
  {
    id: 'inventory',
    name: 'Inventory Specialist',
    badgeClass: 'bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800',
    description: 'Stock tracking, warehouse adjustments, and shipping logistics management'
  },
  {
    id: 'customer',
    name: 'Customer (Storefront)',
    badgeClass: 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    description: 'Storefront shopper account with zero administrative access'
  }
];
