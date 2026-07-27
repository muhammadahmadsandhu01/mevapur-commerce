const Permission = require('../models/Permission');

class PermissionRepository {
  async findOrCreate(resource, action, scope = 'own') {
    let permission = await Permission.findOne({ resource, action, scope });
    
    if (!permission) {
      permission = await Permission.create({ resource, action, scope });
    }
    
    return permission;
  }

  async findAll() {
    return await Permission.find();
  }

  async findByResource(resource) {
    return await Permission.find({ resource });
  }
}

module.exports = new PermissionRepository();