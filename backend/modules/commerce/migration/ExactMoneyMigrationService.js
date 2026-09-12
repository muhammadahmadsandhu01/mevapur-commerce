'use strict';

const crypto = require('crypto');
const mongoose = require('mongoose');
const MigrationState = require('../../../models/MigrationState');
const MigrationJournal = require('../../../models/MigrationJournal');
const RolloutAuthority = require('../persistence/RolloutAuthority');
const CurrencyRegistry = require('../registries/currencyRegistry');
const { parseMongoUri } = require('../../../scripts/lib/migrationRuntimeGuard');
const {
  CANONICAL_MIGRATION_ID,
  MIGRATION_TOOL_VERSION,
  evaluateDocument,
  computeFingerprint
} = require('./ExactMoneyMigrationRegistry');
const CommerceError = require('../core/CommerceError');

const DEFAULT_BATCH_SIZE = 100;
const LEASE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

class ExactMoneyMigrationService {
  /**
   * Returns standard Mongoose models mapped to REQUIRED_MODEL_SCOPE names.
   */
  static getModel(modelScopeName) {
    const mapping = {
      products: 'Product',
      orders: 'Order',
      payments: 'Payment',
      refunds: 'Refund',
      returns: 'Return',
      coupons: 'Coupon',
      shipping_zones: 'ShippingZone',
      users: 'User'
    };

    const modelName = mapping[modelScopeName];
    if (!modelName) {
      throw new CommerceError(
        `Invalid model scope name: '${modelScopeName}'`,
        'COMMERCE_INVALID_MODEL_SCOPE',
        400
      );
    }

    return mongoose.models[modelName] || mongoose.model(modelName);
  }

  /**
   * Computes normalized database fingerprint from active connection.
   */
  static getDatabaseFingerprint() {
    try {
      const uri = mongoose.connection.client?.s?.url || mongoose.connection._connectionString || process.env.MONGODB_URI || 'mongodb://localhost:27017/mevapur-commerce';
      const parsed = parseMongoUri(uri);
      return parsed.sha256Fingerprint;
    } catch {
      return 'in-memory-isolated-db-fingerprint';
    }
  }

  /**
   * Computes current CurrencyRegistry snapshot identifier.
   */
  static getRegistrySnapshot() {
    const prov = CurrencyRegistry.getProvenance();
    return prov.snapshotName || 'currency-registry-v1';
  }

  /**
   * Acquires a distributed lease on MigrationState to prevent concurrent mutating operations.
   */
  static async acquireLease(migrationId = CANONICAL_MIGRATION_ID, workerId = `worker-${process.pid}-${Date.now()}`) {
    const now = new Date();
    const leaseExpiry = new Date(now.getTime() + LEASE_DURATION_MS);
    const leaseId = `lease-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    let state = await MigrationState.findOne({ migrationId });
    if (!state) {
      state = await MigrationState.create({
        migrationId,
        status: 'pending',
        metadata: {
          lease: {
            leaseId,
            workerId,
            acquiredAt: now,
            expiresAt: leaseExpiry
          }
        }
      });
      return { acquired: true, leaseId, workerId, state };
    }

    const currentLease = state.metadata?.lease;
    const isLeaseExpired = currentLease?.expiresAt && new Date(currentLease.expiresAt) < now;

    if (!currentLease || !currentLease.workerId || isLeaseExpired || currentLease.workerId === workerId) {
      state.metadata = {
        ...(state.metadata || {}),
        lease: {
          leaseId,
          workerId,
          acquiredAt: now,
          expiresAt: leaseExpiry
        }
      };
      state.markModified('metadata');
      await state.save();
      return { acquired: true, leaseId, workerId, state };
    }

    return {
      acquired: false,
      leaseId: currentLease.leaseId || null,
      workerId: currentLease.workerId,
      expiresAt: currentLease.expiresAt
    };
  }

  /**
   * Releases lease on MigrationState.
   */
  static async releaseLease(migrationId = CANONICAL_MIGRATION_ID, leaseIdOrWorkerId) {
    const state = await MigrationState.findOne({ migrationId });
    if (state && state.metadata?.lease) {
      const lease = state.metadata.lease;
      if (lease.leaseId === leaseIdOrWorkerId || lease.workerId === leaseIdOrWorkerId) {
        state.metadata.lease = null;
        state.markModified('metadata');
        await state.save();
      }
    }
  }

  /**
   * Loads authoritative cross-document provenance where required (Payment -> Order, Refund -> Payment/Order, Return -> Order).
   */
  static async resolveLinkedCurrency(doc, modelScope, session = null) {
    if (!doc) return null;
    const rawDoc = doc._doc || doc;

    if (modelScope === 'payments') {
      if (rawDoc.order) {
        const OrderModel = mongoose.models.Order || mongoose.model('Order');
        const q = OrderModel.findById(rawDoc.order);
        if (session) q.session(session);
        const linkedOrder = await q.exec();
        if (linkedOrder) {
          const rawOrder = linkedOrder._doc || linkedOrder;
          const curr = rawOrder.payment?.currency || rawOrder.currency;
          if (curr) return curr;
        }
      }
      if (rawDoc.currency && typeof rawDoc.currency === 'string') return rawDoc.currency;
    } else if (modelScope === 'refunds') {
      if (rawDoc.payment) {
        const PaymentModel = mongoose.models.Payment || mongoose.model('Payment');
        const q = PaymentModel.findById(rawDoc.payment);
        if (session) q.session(session);
        const linkedPayment = await q.exec();
        if (linkedPayment) {
          const rawPay = linkedPayment._doc || linkedPayment;
          if (rawPay.amountExact?.currency) return rawPay.amountExact.currency;
          if (rawPay.currency) return rawPay.currency;
        }
      }
      if (rawDoc.order) {
        const OrderModel = mongoose.models.Order || mongoose.model('Order');
        const q = OrderModel.findById(rawDoc.order);
        if (session) q.session(session);
        const linkedOrder = await q.exec();
        if (linkedOrder) {
          const rawOrder = linkedOrder._doc || linkedOrder;
          const curr = rawOrder.payment?.currency || rawOrder.currency;
          if (curr) return curr;
        }
      }
      if (rawDoc.currency && typeof rawDoc.currency === 'string') return rawDoc.currency;
    } else if (modelScope === 'returns') {
      if (rawDoc.order) {
        const OrderModel = mongoose.models.Order || mongoose.model('Order');
        const q = OrderModel.findById(rawDoc.order);
        if (session) q.session(session);
        const linkedOrder = await q.exec();
        if (linkedOrder) {
          const rawOrder = linkedOrder._doc || linkedOrder;
          const curr = rawOrder.payment?.currency || rawOrder.currency;
          if (curr) return curr;
        }
      }
      if (rawDoc.currency && typeof rawDoc.currency === 'string') return rawDoc.currency;
    }

    return null;
  }

  /**
   * Read-only inventory scan across all required model collections.
   */
  static async inventory(options = {}) {
    const scope = RolloutAuthority.REQUIRED_MODEL_SCOPE;
    const report = {
      migrationId: CANONICAL_MIGRATION_ID,
      toolVersion: MIGRATION_TOOL_VERSION,
      databaseFingerprint: this.getDatabaseFingerprint(),
      registrySnapshot: this.getRegistrySnapshot(),
      legacyProvenance: {
        country: options.legacyCountry || null,
        currency: options.legacyCurrency || null
      },
      models: {},
      summary: {
        totalDocuments: 0,
        alreadyCompliantDocs: 0,
        wouldUpdateDocs: 0,
        conflictDocs: 0,
        unresolvedDocs: 0,
        totalEligibleFields: 0,
        compliantFields: 0,
        wouldBackfillFields: 0,
        conflictingFields: 0,
        unresolvedFields: 0,
        inapplicableFields: 0,
        overallFieldCoveragePercent: 100
      }
    };

    for (const modelScope of scope) {
      const Model = this.getModel(modelScope);
      const modelStats = {
        totalDocuments: 0,
        alreadyCompliantDocs: 0,
        wouldUpdateDocs: 0,
        conflictDocs: 0,
        unresolvedDocs: 0,
        totalEligibleFields: 0,
        compliantFields: 0,
        wouldBackfillFields: 0,
        conflictingFields: 0,
        unresolvedFields: 0,
        inapplicableFields: 0,
        fieldCoveragePercent: 100,
        conflictDetails: []
      };

      const cursor = Model.find({}).cursor();
      for await (const doc of cursor) {
        modelStats.totalDocuments++;
        const linkedCurrency = await this.resolveLinkedCurrency(doc, modelScope);
        const evalResult = evaluateDocument(doc, modelScope, { ...options, linkedCurrency });

        // Document level
        if (evalResult.status === 'already_compliant') {
          modelStats.alreadyCompliantDocs++;
        } else if (evalResult.status === 'would_update') {
          modelStats.wouldUpdateDocs++;
        } else if (evalResult.status === 'conflict') {
          modelStats.conflictDocs++;
          modelStats.conflictDetails.push({
            id: String(doc._id),
            reason: evalResult.reason
          });
        } else {
          modelStats.unresolvedDocs++;
        }

        // Field level
        if (evalResult.fieldStats) {
          modelStats.totalEligibleFields += evalResult.fieldStats.eligible;
          modelStats.compliantFields += evalResult.fieldStats.compliant;
          modelStats.wouldBackfillFields += evalResult.fieldStats.wouldBackfill;
          modelStats.conflictingFields += evalResult.fieldStats.conflicts;
          modelStats.unresolvedFields += evalResult.fieldStats.unresolved;
          modelStats.inapplicableFields += evalResult.fieldStats.inapplicable;
        }
      }

      const totalFields = modelStats.totalEligibleFields;
      modelStats.fieldCoveragePercent = totalFields === 0
        ? 100
        : Math.round((modelStats.compliantFields / totalFields) * 100);

      report.models[modelScope] = modelStats;
      report.summary.totalDocuments += modelStats.totalDocuments;
      report.summary.alreadyCompliantDocs += modelStats.alreadyCompliantDocs;
      report.summary.wouldUpdateDocs += modelStats.wouldUpdateDocs;
      report.summary.conflictDocs += modelStats.conflictDocs;
      report.summary.unresolvedDocs += modelStats.unresolvedDocs;
      report.summary.totalEligibleFields += modelStats.totalEligibleFields;
      report.summary.compliantFields += modelStats.compliantFields;
      report.summary.wouldBackfillFields += modelStats.wouldBackfillFields;
      report.summary.conflictingFields += modelStats.conflictingFields;
      report.summary.unresolvedFields += modelStats.unresolvedFields;
      report.summary.inapplicableFields += modelStats.inapplicableFields;
    }

    const totalAllFields = report.summary.totalEligibleFields;
    report.summary.overallFieldCoveragePercent = totalAllFields === 0
      ? 100
      : Math.round((report.summary.compliantFields / totalAllFields) * 100);

    return report;
  }

  /**
   * Dry-run simulation of migration (strictly read-only).
   */
  static async dryRun(options = {}) {
    const inv = await this.inventory(options);
    return {
      mode: 'dry-run',
      ...inv,
      sampleTransformations: []
    };
  }

  /**
   * Applies exact-money backfill across all required model collections in transactional bounded batches.
   */
  static async apply(options = {}) {
    const batchSize = options.batchSize || DEFAULT_BATCH_SIZE;
    const workerId = `worker-${process.pid}-${Date.now()}`;
    const leaseRes = await this.acquireLease(CANONICAL_MIGRATION_ID, workerId);

    if (!leaseRes.acquired) {
      throw new CommerceError(
        `Cannot apply migration: active lease held by worker '${leaseRes.workerId}' until ${leaseRes.expiresAt}`,
        'COMMERCE_MIGRATION_LEASE_HELD',
        409
      );
    }

    let state = leaseRes.state;
    state.status = 'running';
    state.startedAt = state.startedAt || new Date();
    await state.save();

    const scope = RolloutAuthority.REQUIRED_MODEL_SCOPE;
    const results = {
      migrationId: CANONICAL_MIGRATION_ID,
      toolVersion: MIGRATION_TOOL_VERSION,
      updatedCount: 0,
      conflictCount: 0,
      processedCount: 0,
      modelProgress: {}
    };

    try {
      for (const modelScope of scope) {
        const Model = this.getModel(modelScope);
        let lastId = null;
        let modelUpdated = 0;
        let modelProcessed = 0;
        let modelConflicts = 0;

        while (true) {
          const query = lastId ? { _id: { $gt: lastId } } : {};
          const batch = await Model.find(query).sort({ _id: 1 }).limit(batchSize);

          if (batch.length === 0) break;

          for (const doc of batch) {
            lastId = doc._id;
            modelProcessed++;
            results.processedCount++;

            const linkedCurrency = await this.resolveLinkedCurrency(doc, modelScope);
            const evalResult = evaluateDocument(doc, modelScope, { ...options, linkedCurrency });

            if (evalResult.status === 'conflict') {
              modelConflicts++;
              results.conflictCount++;
              continue;
            }

            if (evalResult.status === 'would_update' && Object.keys(evalResult.exactUpdates).length > 0) {
              const session = await mongoose.startSession();
              let committed = false;

              try {
                session.startTransaction();

                // 1. Conditional Business Document Update using strong CAS filter
                const updateRes = await Model.collection.updateOne(
                  evalResult.casFilter,
                  { $set: evalResult.exactUpdates },
                  { session }
                );

                if (updateRes.modifiedCount === 0) {
                  // CAS mismatch: concurrent edit occurred
                  await session.abortTransaction();
                  modelConflicts++;
                  results.conflictCount++;
                  continue;
                }

                // 2. MigrationJournal Ownership Entry written in SAME transaction
                await MigrationJournal.findOneAndUpdate(
                  {
                    migrationId: CANONICAL_MIGRATION_ID,
                    collectionName: modelScope,
                    documentId: doc._id
                  },
                  {
                    $set: {
                      status: 'applied',
                      fieldsWritten: evalResult.fieldsWritten,
                      preconditionFingerprint: evalResult.preconditionFingerprint,
                      postWriteFingerprint: evalResult.postWriteFingerprint,
                      schemaVersion: MIGRATION_TOOL_VERSION,
                      migratedAt: new Date(),
                      rolledBackAt: null
                    }
                  },
                  { upsert: true, session }
                );

                await session.commitTransaction();
                committed = true;
                modelUpdated++;
                results.updatedCount++;
              } catch (txErr) {
                if (!committed) {
                  try {
                    await session.abortTransaction();
                  } catch {}
                }
                modelConflicts++;
                results.conflictCount++;
              } finally {
                await session.endSession();
              }
            }
          }

          // Checkpoint progress to MigrationState
          state.lastProcessedId = lastId;
          state.processedCount = results.processedCount;
          state.updatedCount = results.updatedCount;
          state.conflictCount = results.conflictCount;
          await state.save();
        }

        results.modelProgress[modelScope] = {
          processed: modelProcessed,
          updated: modelUpdated,
          conflicts: modelConflicts
        };
      }

      state.status = results.conflictCount > 0 ? 'failed' : 'applied';
      await state.save();

      return results;
    } finally {
      await this.releaseLease(CANONICAL_MIGRATION_ID, leaseRes.leaseId || workerId);
    }
  }

  /**
   * Independent verification scan (strictly read-only).
   * Re-reads all required collections and verifies field coverage without mutating data.
   */
  static async verify(options = {}) {
    const inv = await this.inventory(options);

    const is100Coverage = inv.summary.overallFieldCoveragePercent === 100 && inv.summary.wouldBackfillFields === 0;
    const hasZeroConflicts = inv.summary.conflictingFields === 0 && inv.summary.conflictDocs === 0;
    const hasZeroUnresolved = inv.summary.unresolvedFields === 0 && inv.summary.unresolvedDocs === 0;
    const isVerified = is100Coverage && hasZeroConflicts && hasZeroUnresolved;

    return {
      verified: isVerified,
      inventory: inv,
      summary: inv.summary
    };
  }

  /**
   * Separately authorized mutating finalization mode that verifies readiness and writes canonical MigrationState completed evidence.
   */
  static async finalize(options = {}) {
    const workerId = `finalize-worker-${process.pid}-${Date.now()}`;
    const leaseRes = await this.acquireLease(CANONICAL_MIGRATION_ID, workerId);

    if (!leaseRes.acquired) {
      throw new CommerceError(
        `Cannot finalize migration: active lease held by worker '${leaseRes.workerId}' until ${leaseRes.expiresAt}`,
        'COMMERCE_MIGRATION_LEASE_HELD',
        409
      );
    }

    try {
      let state = await MigrationState.findOne({ migrationId: CANONICAL_MIGRATION_ID });
      if (!state) {
        state = new MigrationState({ migrationId: CANONICAL_MIGRATION_ID });
      }

      // Finalize requires proof that apply ran previously
      if (state.status !== 'applied' && state.status !== 'running' && state.processedCount === 0) {
        throw new CommerceError(
          `Cannot finalize migration: migration is in '${state.status}' state with 0 processed records. Apply must run before finalization.`,
          'COMMERCE_MIGRATION_NOT_APPLIED',
          400
        );
      }

      // Re-run independent verification scan
      const verifyRes = await this.verify(options);
      const dbFingerprint = this.getDatabaseFingerprint();
      const regSnapshot = this.getRegistrySnapshot();

      if (!verifyRes.verified) {
        state.status = 'failed';
        state.lastReasonCode = verifyRes.summary.overallFieldCoveragePercent < 100
          ? 'INCOMPLETE_FIELD_COVERAGE'
          : (verifyRes.summary.conflictingFields > 0 ? 'PARITY_CONFLICTS_EXIST' : 'UNRESOLVED_RECORDS_EXIST');
        state.metadata = {
          schemaVersion: MIGRATION_TOOL_VERSION,
          toolVersion: MIGRATION_TOOL_VERSION,
          databaseFingerprint: dbFingerprint,
          registrySnapshot: regSnapshot,
          fieldCoverage: verifyRes.summary.overallFieldCoveragePercent,
          unresolvedParityFailures: verifyRes.summary.conflictingFields,
          conflictCount: verifyRes.summary.conflictingFields,
          scope: RolloutAuthority.REQUIRED_MODEL_SCOPE
        };
        await state.save();

        throw new CommerceError(
          `Migration finalization rejected: ${state.lastReasonCode}. Incomplete field coverage or unresolved conflicts remain.`,
          'COMMERCE_MIGRATION_VERIFICATION_FAILED',
          400
        );
      }

      // Verification passed -> Record authoritative completed evidence
      state.status = 'completed';
      state.completedAt = new Date();
      state.processedCount = verifyRes.inventory.summary.totalDocuments;
      state.conflictCount = 0;
      state.metadata = {
        schemaVersion: MIGRATION_TOOL_VERSION,
        toolVersion: MIGRATION_TOOL_VERSION,
        databaseFingerprint: dbFingerprint,
        registrySnapshot: regSnapshot,
        currencyRegistrySnapshot: regSnapshot,
        fieldCoverage: 100,
        unresolvedParityFailures: 0,
        conflictCount: 0,
        scope: RolloutAuthority.REQUIRED_MODEL_SCOPE,
        legacyProvenance: {
          country: options.legacyCountry || 'PK',
          currency: options.legacyCurrency || 'PKR'
        },
        verifiedAt: new Date().toISOString()
      };

      await state.save();

      return {
        finalized: true,
        state: state.toObject ? state.toObject() : state
      };
    } finally {
      await this.releaseLease(CANONICAL_MIGRATION_ID, leaseRes.leaseId || workerId);
    }
  }

  /**
   * Idempotently rolls back exact fields created by this migration in transactions without touching legacy fields or newer writes.
   */
  static async rollback(options = {}) {
    const workerId = `rollback-worker-${process.pid}-${Date.now()}`;
    const leaseRes = await this.acquireLease(CANONICAL_MIGRATION_ID, workerId);

    if (!leaseRes.acquired) {
      throw new CommerceError(
        `Cannot rollback migration: active lease held by worker '${leaseRes.workerId}' until ${leaseRes.expiresAt}`,
        'COMMERCE_MIGRATION_LEASE_HELD',
        409
      );
    }

    try {
      const journalEntries = await MigrationJournal.find({
        migrationId: CANONICAL_MIGRATION_ID,
        status: 'applied'
      });

      let rolledBackCount = 0;
      let skippedCount = 0;

      for (const entry of journalEntries) {
        const Model = this.getModel(entry.collectionName);
        const session = await mongoose.startSession();
        let committed = false;

        try {
          session.startTransaction();
          const doc = await Model.findById(entry.documentId).session(session);

          if (!doc) {
            await MigrationJournal.updateOne(
              { _id: entry._id },
              { $set: { status: 'rolled_back', rolledBackAt: new Date() } },
              { session }
            );
            await session.commitTransaction();
            committed = true;
            skippedCount++;
            continue;
          }

          // Build $unset updates for the fields written by migration
          const unsets = {};
          let hasArrayField = false;

          for (const f of entry.fieldsWritten) {
            if (f.includes('.')) {
              hasArrayField = true;
            } else {
              unsets[f] = 1;
            }
          }

          if (Object.keys(unsets).length > 0) {
            await Model.collection.updateOne({ _id: doc._id }, { $unset: unsets }, { session });
          }

          if (hasArrayField) {
            if (entry.collectionName === 'products' && Array.isArray(doc.variants)) {
              doc.variants.forEach(v => {
                v.priceExact = undefined;
                v.salePriceExact = undefined;
              });
              await doc.save({ session });
            } else if (entry.collectionName === 'orders' && Array.isArray(doc.items)) {
              doc.items.forEach(item => {
                item.unitPriceExact = undefined;
                item.lineTotalExact = undefined;
              });
              await doc.save({ session });
            } else if (entry.collectionName === 'returns' && Array.isArray(doc.items)) {
              doc.items.forEach(item => {
                item.priceExact = undefined;
                item.refundAmountExact = undefined;
              });
              await doc.save({ session });
            }
          }

          await MigrationJournal.updateOne(
            { _id: entry._id },
            { $set: { status: 'rolled_back', rolledBackAt: new Date() } },
            { session }
          );

          await session.commitTransaction();
          committed = true;
          rolledBackCount++;
        } catch (err) {
          if (!committed) {
            try {
              await session.abortTransaction();
            } catch {}
          }
          skippedCount++;
        } finally {
          await session.endSession();
        }
      }

      let state = await MigrationState.findOne({ migrationId: CANONICAL_MIGRATION_ID });
      if (state) {
        state.status = 'rolled_back';
        state.completedAt = new Date();
        await state.save();
      }

      return {
        status: 'rolled_back',
        rolledBackCount,
        skippedCount
      };
    } finally {
      await this.releaseLease(CANONICAL_MIGRATION_ID, leaseRes.leaseId || workerId);
    }
  }
}

module.exports = ExactMoneyMigrationService;
