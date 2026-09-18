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
  const moneySnapshotSchema = new mongoose.Schema({
    amountMinor: {
      type: String,
      default: null,
      validate: {
        validator: (v) => v === null || /^\d{1,18}$/.test(v),
        message: 'amountMinor must be a canonical string of 1-18 digits or null'
      }
    },
    currency: {
      type: String,
      default: null,
      validate: {
        validator: (v) => v === null || /^[A-Z]{3}$/.test(v),
        message: 'currency must be a 3-letter ISO code or null'
      }
    },
    exponent: {
      type: Number,
      default: null,
      validate: {
        validator: (v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 4),
        message: 'exponent must be an integer between 0 and 4 or null'
      }
    }
  }, { _id: false });

  const journalFieldEntrySchema = new mongoose.Schema({
    fieldPath: {
      type: String,
      required: true,
      validate: {
        validator: (p) => typeof p === 'string' && p.trim().length > 0 && !p.startsWith('$') && !p.includes('\0'),
        message: 'Invalid field path in checkpoint entry'
      }
    },
    exists: {
      type: Boolean,
      required: true
    },
    valueExact: {
      type: moneySnapshotSchema,
      default: null
    }
  }, { _id: false });

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
    operationId: {
      type: String,
      default: null,
      index: true
    },
    merchantScopeId: {
      type: String,
      default: 'default',
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
    beforeFields: {
      type: [journalFieldEntrySchema],
      default: []
    },
    appliedFields: {
      type: [journalFieldEntrySchema],
      default: []
    },
    preconditionFingerprint: {
      type: String,
      required: true
    },
    postWriteFingerprint: {
      type: String,
      required: true
    },
    checksum: {
      type: String,
      default: null
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

  migrationJournalSchema.index(
    { migrationId: 1, merchantScopeId: 1, status: 1 },
    { name: 'migration_tenant_status_idx' }
  );

  module.exports = mongoose.model('MigrationJournal', migrationJournalSchema);
}
