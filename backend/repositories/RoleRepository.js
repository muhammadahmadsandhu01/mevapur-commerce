const Role = require('../models/Role');

class RoleRepository {
  async findByName(name) {
    return await Role.findOne({ name: name.toUpperCase() }).populate('permissions');
  }

  async findById(id) {
    return await Role.findById(id).populate('permissions');
  }

  async findAll() {
    return await Role.find().populate('permissions');
  }

  async create(roleData) {
    return await Role.create(roleData);
  }

  async updatePermissions(roleId, permissionIds) {
    return await Role.findByIdAndUpdate(roleId, { permissions: permissionIds }, { new: true });
  }
}

module.exports = new RoleRepository();