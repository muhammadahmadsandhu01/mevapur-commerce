const Role = require('../models/Role');
const User = require('../models/User');

const toPermission = (permission) => ({
  id: String(permission._id),
  module: permission.module,
  resource: permission.resource,
  action: permission.action,
  scope: permission.scope,
  description: permission.description || '',
  isActive: permission.isActive
});

// @desc    Get the stored role definitions and assignment-role alignment
// @route   GET /api/roles
// @access  Private/Admin
exports.getRoles = async (req, res, next) => {
  try {
    const documents = await Role.find()
      .select('name description permissions isSystem isActive')
      .populate({
        path: 'permissions',
        select: 'module resource action scope description isActive'
      })
      .sort({ name: 1 })
      .lean();

    const roleNames = new Set(documents.map((role) => role.name));
    const assignmentValues = User.schema.path('role').enumValues;

    res.json({
      success: true,
      data: {
        roles: documents.map((role) => ({
          id: String(role._id),
          name: role.name,
          description: role.description || '',
          isSystem: role.isSystem,
          isActive: role.isActive,
          permissions: role.permissions
            .filter((permission) => permission && permission._id)
            .map(toPermission)
            .sort((left, right) => (
              left.module.localeCompare(right.module)
              || left.resource.localeCompare(right.resource)
              || left.action.localeCompare(right.action)
              || left.scope.localeCompare(right.scope)
            ))
        })),
        assignmentRoles: assignmentValues.map((name) => ({
          name,
          hasRoleDefinition: roleNames.has(name.toUpperCase())
        }))
      }
    });
  } catch (error) {
    next(error);
  }
};
