'use strict';

const mongoose = require('mongoose');

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
      index: true
    },
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true
    },
    fieldsWritten: {
      type: [String],
      required: true
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
