const mongoose = require('mongoose');

if (mongoose.models.MigrationState) {
  module.exports = mongoose.models.MigrationState;
} else {
  const migrationStateSchema = new mongoose.Schema({
    migrationId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed'],
      default: 'pending',
      index: true
    },
    lastProcessedId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },
    processedCount: {
      type: Number,
      default: 0
    },
    updatedCount: {
      type: Number,
      default: 0
    },
    conflictCount: {
      type: Number,
      default: 0
    },
    startedAt: {
      type: Date,
      default: null
    },
    completedAt: {
      type: Date,
      default: null
    },
    lastReasonCode: {
      type: String,
      default: null
    }
  }, {
    timestamps: true
  });

  module.exports = mongoose.model('MigrationState', migrationStateSchema);
}
