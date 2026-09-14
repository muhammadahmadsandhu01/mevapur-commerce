/**
 * @file CommerceConfigurationSequence.js
 * @description Atomic sequence counter for versioned commerce configurations per merchant scope.
 * Prevents race conditions during concurrent draft creation.
 */

const mongoose = require('mongoose');

const commerceConfigurationSequenceSchema = new mongoose.Schema({
  merchantScopeId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: 100
  },
  seq: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  activeRevision: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  lastActivatedVersion: {
    type: Number,
    default: null
  }
}, {
  timestamps: true
});

/**
 * Atomically allocates the next sequential version number for a merchant scope.
 * @param {string} [merchantScopeId='default']
 * @param {Object} [options]
 * @param {mongoose.ClientSession} [options.session]
 * @returns {Promise<number>}
 */
commerceConfigurationSequenceSchema.statics.getNextVersion = async function getNextVersion(
  merchantScopeId = 'default',
  { session = null } = {}
) {
  const scope = (merchantScopeId || 'default').trim();
  const query = { merchantScopeId: scope };
  const update = { $inc: { seq: 1 } };
  const options = {
    new: true,
    upsert: true,
    ...(session ? { session } : {})
  };

  const doc = await this.findOneAndUpdate(query, update, options);
  return doc.seq;
};

/**
 * Atomically acquires a serialized authority revision for a merchant scope inside an activation transaction.
 * @param {string} [merchantScopeId='default']
 * @param {Object} options
 * @param {mongoose.ClientSession} options.session
 * @returns {Promise<number>}
 */
commerceConfigurationSequenceSchema.statics.acquireAuthorityRevision = async function acquireAuthorityRevision(
  merchantScopeId = 'default',
  { session }
) {
  const scope = (merchantScopeId || 'default').trim();
  const query = { merchantScopeId: scope };
  const update = { $inc: { activeRevision: 1 } };
  const options = {
    new: true,
    upsert: true,
    session
  };

  const doc = await this.findOneAndUpdate(query, update, options);
  return doc.activeRevision;
};

module.exports = mongoose.models.CommerceConfigurationSequence
  || mongoose.model('CommerceConfigurationSequence', commerceConfigurationSequenceSchema);
