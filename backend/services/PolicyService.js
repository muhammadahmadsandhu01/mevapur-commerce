const RoleRepository = require('../repositories/RoleRepository');
const PermissionRepository = require('../repositories/PermissionRepository');
const { AppError } = require('../common/errors/AppError');
const { ERROR_CODES } = require('../constants/errorCodes');

class PolicyService {
  /**
   * Check if user has permission
   * Supports RBAC + ABAC
   */
  async can(user, resource, action, scope = 'own', context = {}) {
    // Super admin has all permissions
    if (user.role === 'super_admin') {
      return true;
    }

    // Get user's role
    const role = await RoleRepository.findByNameWithPermissions(user.role);
    
    if (!role) {
      return false;
    }

    // Check if role is active
    if (!role.isActive) {
      return false;
    }

    // Check permissions
    const hasPermission = role.permissions.some(perm => {
      const match = perm.resource === resource && 
                   perm.action === action;
      
      if (!match) return false;

      // ABAC: Check scope
      if (perm.scope === 'all') {
        return true;
      }
      
      if (perm.scope === 'department') {
        // Implement department logic based on context
        return context.departmentId === user.departmentId;
      }
      
      if (perm.scope === 'own') {
        // Implement ownership logic based on context
        return context.ownerId === user.id;
      }

      return false;
    });

    return hasPermission;
  }

  /**
   * Authorize user or throw error
   */
  async authorize(user, resource, action, scope = 'own', context = {}) {
    const allowed = await this.can(user, resource, action, scope, context);
    
    if (!allowed) {
      throw new AppError(
        `Permission denied: ${action} ${resource}`,
        403,
        ERROR_CODES.AUTH_PERMISSION_DENIED
      );
    }
  }

  /**
   * Get all permissions for a role
   */
  async getPermissionsForRole(roleName) {
    const role = await RoleRepository.findByNameWithPermissions(roleName);
    
    if (!role) {
      return [];
    }

    return role.permissions.map(perm => ({
      resource: perm.resource,
      action: perm.action,
      scope: perm.scope
    }));
  }

  /**
   * Assign role to user
   */
  async assignRole(userId, roleName) {
    const role = await RoleRepository.findByName(roleName);
    
    if (!role) {
      throw new AppError('Role not found', 404, ERROR_CODES.AUTH_ROLE_NOT_FOUND);
    }

    if (!role.isActive) {
      throw new AppError('Role is inactive', 400, ERROR_CODES.AUTH_ROLE_INACTIVE);
    }

    const user = await UserRepository.update(userId, { role: roleName });
    
    return user;
  }
}

module.exports = new PolicyService();