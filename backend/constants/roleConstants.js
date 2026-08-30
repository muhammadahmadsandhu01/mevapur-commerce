const CANONICAL_ROLES = Object.freeze({
  CUSTOMER: 'customer',
  SUPPORT: 'support',
  INVENTORY: 'inventory',
  MANAGER: 'manager',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin'
});

const STAFF_ROLES = Object.freeze([
  CANONICAL_ROLES.SUPPORT,
  CANONICAL_ROLES.INVENTORY,
  CANONICAL_ROLES.MANAGER,
  CANONICAL_ROLES.ADMIN,
  CANONICAL_ROLES.SUPER_ADMIN
]);

module.exports = {
  CANONICAL_ROLES,
  STAFF_ROLES
};
