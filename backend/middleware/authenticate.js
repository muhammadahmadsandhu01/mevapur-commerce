const {
  protect,
  admin,
  superAdmin,
  checkRoles
} = require('./auth');

module.exports = protect;
module.exports.protect = protect;
module.exports.admin = admin;
module.exports.superAdmin = superAdmin;
module.exports.checkRoles = checkRoles;
