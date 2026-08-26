const mongoose = require('mongoose');

const bootstrapStateSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  version: {
    type: Number,
    required: true,
    min: 1
  }
}, {
  collection: 'bootstrap_states',
  timestamps: true
});

module.exports = mongoose.model('BootstrapState', bootstrapStateSchema);
