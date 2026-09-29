/**
 * @file OrderSequence.js
 * @description Atomic sequence counter for order identifiers.
 * Guarantees strictly non-repeating, contiguous numeric sequences.
 */

const mongoose = require('mongoose');

const orderSequenceSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true
  },
  seq: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  }
}, {
  timestamps: true,
  collection: 'order_sequences'
});

/**
 * Atomically generates the next sequence number for order identifiers.
 * @param {Object} [options]
 * @param {string} [options.sequenceId='orderNumber']
 * @param {mongoose.ClientSession} [options.session]
 * @returns {Promise<number>}
 */
orderSequenceSchema.statics.getNextSequence = async function getNextSequence({
  sequenceId = 'orderNumber',
  session = null
} = {}) {
  const options = {
    new: true,
    upsert: true,
    setDefaultsOnInsert: true,
    ...(session ? { session } : {})
  };
  const doc = await this.findOneAndUpdate(
    { _id: sequenceId },
    { $inc: { seq: 1 } },
    options
  );
  return doc.seq;
};

module.exports = mongoose.models.OrderSequence || mongoose.model('OrderSequence', orderSequenceSchema);
