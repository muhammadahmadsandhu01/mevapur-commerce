const User = require('../models/User');

class UserRepository {
  async findById(id) {
    return await User.findById(id);
  }

  async findByIdWithPassword(id) {
    return await User.findById(id).select('+password');
  }

  async findByEmail(email) {
    return await User.findOne({ email: email.toLowerCase() });
  }

  async create(userData) {
    const user = new User(userData);
    return await user.save();
  }

  async update(id, updateData) {
    return await User.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
  }

  async incrementFailedLogin(id) {
    return await User.findByIdAndUpdate(id, {
      $inc: { failedLoginAttempts: 1 },
      ...(updateData => updateData) // Logic for lock handled in service
    }, { new: true });
  }

  async resetFailedLogin(id) {
    return await User.findByIdAndUpdate(id, {
      failedLoginAttempts: 0,
      isAccountLocked: false,
      lockUntil: null
    }, { new: true });
  }

  async lockAccount(id, lockUntil) {
    return await User.findByIdAndUpdate(id, {
      isAccountLocked: true,
      lockUntil
    }, { new: true });
  }

  async updateLastLogin(id) {
    return await User.findByIdAndUpdate(id, { lastLoginAt: new Date() }, { new: true });
  }

  async incrementTokenVersion(id) {
    return await User.findByIdAndUpdate(id, {
      $inc: { tokenVersion: 1 }
    }, { new: true });
  }

  async delete(id) {
    return await User.findByIdAndDelete(id);
  }
}

module.exports = new UserRepository();