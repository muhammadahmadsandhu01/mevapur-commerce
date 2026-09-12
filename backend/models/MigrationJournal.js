'use strict';

const mongoose = require('mongoose');

const ALLOWED_COLLECTIONS = [
  'products',
  'orders',
  'payments',
  'refunds',
  'returns',
  'coupons',
  'shipping_zones',
  'users'
];

if (mongoose.models.MigrationJournal) {
  module.exports = mongoose.models.MigrationJournal;
} else {
  const migrationJournalSchema = new mongoose.Schema({
    migrationId: {
      type: String,
      required: true,
      index: true
    },
    collectionName: {
      type: String,
      required: true,
      enum: ALLOWED_COLLECTIONS,
      index: true
    },
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ['applied', 'rolled_back', 'conflict'],
      default: 'applied',
      required: true,
      index: true
    },
    fieldsWritten: {
      type: [String],
      required: true,
      validate: {
        validator: (paths) => Array.isArray(paths) && paths.every(
          p => typeof p === 'string' && p.trim().length > 0 && !p.startsWith('$') && !p.includes('\0')
        ),
        message: 'Invalid field paths in fieldsWritten'
      }
    },
    preconditionFingerprint: {
      type: String,
      required: true
    },
    postWriteFingerprint: {
      type: String,
      required: true
    },
    schemaVersion: {
      type: String,
      default: '1.0.0'
    },
    migratedAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    rolledBackAt: {
      type: Date,
      default: null
    }
  }, {
    timestamps: true
  });

  migrationJournalSchema.index(
    { migrationId: 1, collectionName: 1, documentId: 1 },
    { unique: true, name: 'unique_migration_journal_entry' }
  );

  module.exports = mongoose.model('MigrationJournal', migrationJournalSchema);
}
