const User = require('../models/User');

class UserRepository {
  async findById(id) {
    return User.findById(id);
  }

  async findByIdWithPassword(id) {
    return User.findById(id).select(
      '+password +tokenVersion +loginAttempts +lockUntil'
    );
  }

  async findByIdWithTokenVersion(id) {
    return User.findById(id).select('+tokenVersion');
  }

  async findByEmail(email) {
    return User.findOne({ email: email.toLowerCase() });
  }

  async findByEmailWithPassword(email) {
    return User.findOne({ email: email.toLowerCase() }).select(
      '+password +tokenVersion +loginAttempts +lockUntil'
    );
  }

  async create(userData) {
    const user = new User(userData);
    return user.save();
  }

  async save(user, options = {}) {
    return user.save(options);
  }

  async update(id, updateData) {
    return User.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true
    });
  }

  async recordFailedLogin(id, maxAttempts, lockoutDurationMs) {
    const user = await User.findByIdAndUpdate(
      id,
      { $inc: { loginAttempts: 1 } },
      { new: true }
    ).select('+loginAttempts +lockUntil');

    if (
      user
      && user.loginAttempts >= maxAttempts
      && (!user.lockUntil || user.lockUntil <= new Date())
    ) {
      user.lockUntil = new Date(Date.now() + lockoutDurationMs);
      await user.save({ validateBeforeSave: false });
    }

    return user;
  }

  async resetFailedLogin(id) {
    return User.findByIdAndUpdate(
      id,
      { $set: { loginAttempts: 0, lockUntil: null } },
      { new: true }
    );
  }

  async updateLastLogin(id) {
    return User.findByIdAndUpdate(
      id,
      { $set: { lastLoginAt: new Date() } },
      { new: true }
    );
  }

  async incrementTokenVersion(id) {
    return User.findByIdAndUpdate(
      id,
      { $inc: { tokenVersion: 1 } },
      { new: true }
    ).select('+tokenVersion');
  }

  async setPasswordResetToken(id, tokenHash, expiresAt) {
    return User.findByIdAndUpdate(
      id,
      {
        $set: {
          resetPasswordTokenHash: tokenHash,
          resetPasswordExpiresAt: expiresAt
        }
      },
      { new: true }
    );
  }

  async findByValidPasswordResetToken(tokenHash) {
    return User.findOne({
      resetPasswordTokenHash: tokenHash,
      resetPasswordExpiresAt: { $gt: new Date() }
    }).select(
      '+password +tokenVersion +resetPasswordTokenHash +resetPasswordExpiresAt'
    );
  }

  async clearPasswordResetTokenConditionally(id, expectedTokenHash) {
    return User.findOneAndUpdate(
      {
        _id: id,
        resetPasswordTokenHash: expectedTokenHash
      },
      {
        $unset: {
          resetPasswordTokenHash: "",
          resetPasswordExpiresAt: ""
        }
      },
      { new: true }
    );
  }
}

module.exports = new UserRepository();
