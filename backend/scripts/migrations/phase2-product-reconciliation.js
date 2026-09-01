const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const Product = require('../../models/Product');
const SkuRegistry = require('../../models/SkuRegistry');
const Category = require('../../models/Category');
const Brand = require('../../models/Brand');
const MediaAsset = require('../../models/MediaAsset');
const MigrationState = require('../../models/MigrationState');

const MIGRATION_ID = 'phase2-product-reconciliation';
const BATCH_SIZE = 100;

const isApply = process.argv.includes('--apply');
const isConfirmed = process.argv.includes('--confirm-phase2-migration');
const isRerun = process.argv.includes('--rerun');

async function runMigration({ customSession = null, customDbConnected = false } = {}) {
  console.log('--- Phase 2 Product Reconciliation Migration ---');
  console.log(`Mode: ${isApply ? (isConfirmed ? 'APPLY (LIVE)' : 'APPLY (BLOCKED: missing --confirm-phase2-migration)') : 'DRY-RUN (Default)'}`);

  if (isApply && !isConfirmed) {
    const err = new Error('--apply requires --confirm-phase2-migration to execute changes.');
    err.code = 'CONFIRMATION_REQUIRED';
    console.error(`Error: ${err.message}`);
    if (require.main === module) process.exit(1);
    throw err;
  }

  if (!customDbConnected && mongoose.connection.readyState === 0) {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mevapur-commerce';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB.');
  }

  try {
    // 1. Reference Preflight Audit
    console.log('\n--- 1. Reference Preflight Audit ---');
    const products = await Product.find({}).lean();
    console.log(`Auditing ${products.length} product documents...`);

    const validCategoryIds = new Set(
      (await Category.find({}, { _id: 1, parent: 1 }).lean()).map(c => String(c._id))
    );
    const categoryDocMap = new Map(
      (await Category.find({}, { _id: 1, parent: 1 }).lean()).map(c => [String(c._id), c])
    );
    const validBrandIds = new Set(
      (await Brand.find({}, { _id: 1 }).lean()).map(b => String(b._id))
    );

    const referenceIssues = [];
    const duplicateSkus = new Map();
    const duplicateSlugs = new Map();
    const skuOwnerMap = new Map();

    // Legacy Media Inventory
    let productsWithLegacyMedia = 0;
    let totalLegacyMediaRefs = 0;
    const legacyUrlSet = new Set();
    let duplicateLegacyRefs = 0;
    let emptyOrMalformedLegacyEntries = 0;
    let externalUnownedUrls = 0;

    const existingMediaAssets = new Set(
      (await MediaAsset.find({}, { publicUrl: 1, key: 1 }).lean()).map(m => m.publicUrl)
    );

    for (const p of products) {
      const pidStr = String(p._id);

      // Audit Category Reference
      if (p.category) {
        if (!mongoose.Types.ObjectId.isValid(p.category)) {
          referenceIssues.push({ productId: pidStr, field: 'category', issue: 'INVALID_OBJECT_ID', value: p.category });
        } else if (!validCategoryIds.has(String(p.category))) {
          referenceIssues.push({ productId: pidStr, field: 'category', issue: 'CATEGORY_NOT_FOUND', value: String(p.category) });
        }
      }

      // Audit Subcategory Reference & Parent Relation
      if (p.subcategory) {
        if (!mongoose.Types.ObjectId.isValid(p.subcategory)) {
          referenceIssues.push({ productId: pidStr, field: 'subcategory', issue: 'INVALID_OBJECT_ID', value: p.subcategory });
        } else if (!validCategoryIds.has(String(p.subcategory))) {
          referenceIssues.push({ productId: pidStr, field: 'subcategory', issue: 'SUBCATEGORY_NOT_FOUND', value: String(p.subcategory) });
        } else if (p.category) {
          const subCatDoc = categoryDocMap.get(String(p.subcategory));
          if (subCatDoc?.parent && String(subCatDoc.parent) !== String(p.category)) {
            referenceIssues.push({
              productId: pidStr,
              field: 'subcategory',
              issue: 'SUBCATEGORY_PARENT_MISMATCH',
              expectedParent: String(p.category),
              actualParent: String(subCatDoc.parent)
            });
          }
        }
      }

      // Audit Brand Reference
      if (p.brand) {
        if (!mongoose.Types.ObjectId.isValid(p.brand)) {
          referenceIssues.push({ productId: pidStr, field: 'brand', issue: 'INVALID_OBJECT_ID', value: p.brand });
        } else if (!validBrandIds.has(String(p.brand))) {
          referenceIssues.push({ productId: pidStr, field: 'brand', issue: 'BRAND_NOT_FOUND', value: String(p.brand) });
        }
      }

      // Check slug uniqueness
      if (p.slug) {
        if (duplicateSlugs.has(p.slug)) {
          duplicateSlugs.get(p.slug).push(pidStr);
        } else {
          duplicateSlugs.set(p.slug, [pidStr]);
        }
      }

      // Check root SKU
      if (p.sku && typeof p.sku === 'string' && p.sku.trim() !== '') {
        const norm = p.sku.trim().toUpperCase();
        if (skuOwnerMap.has(norm)) {
          duplicateSkus.set(norm, [...(duplicateSkus.get(norm) || [skuOwnerMap.get(norm)]), { productId: pidStr, isRoot: true }]);
        } else {
          skuOwnerMap.set(norm, { productId: pidStr, isRoot: true });
        }
      }

      // Check variant SKUs
      if (Array.isArray(p.variants)) {
        for (const v of p.variants) {
          if (v.sku && typeof v.sku === 'string' && v.sku.trim() !== '') {
            const norm = v.sku.trim().toUpperCase();
            if (skuOwnerMap.has(norm)) {
              duplicateSkus.set(norm, [...(duplicateSkus.get(norm) || [skuOwnerMap.get(norm)]), { productId: pidStr, variantId: String(v._id), isRoot: false }]);
            } else {
              skuOwnerMap.set(norm, { productId: pidStr, variantId: String(v._id), isRoot: false });
            }
          }
        }
      }

      // Audit Legacy Media Fields
      const legacyMediaItems = [];
      if (p.image) legacyMediaItems.push(p.image);
      if (p.primaryImage) legacyMediaItems.push(p.primaryImage);
      if (Array.isArray(p.images)) legacyMediaItems.push(...p.images);
      if (Array.isArray(p.gallery)) legacyMediaItems.push(...p.gallery);
      if (Array.isArray(p.variants)) {
        p.variants.forEach(v => {
          if (Array.isArray(v.images)) legacyMediaItems.push(...v.images);
          if (v.image) legacyMediaItems.push(v.image);
        });
      }

      if (legacyMediaItems.length > 0) {
        productsWithLegacyMedia += 1;
        for (const item of legacyMediaItems) {
          totalLegacyMediaRefs += 1;
          if (typeof item !== 'string' || item.trim() === '') {
            emptyOrMalformedLegacyEntries += 1;
          } else {
            const trimmed = item.trim();
            if (legacyUrlSet.has(trimmed)) {
              duplicateLegacyRefs += 1;
            } else {
              legacyUrlSet.add(trimmed);
            }
            if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://') && !trimmed.startsWith('/')) {
              emptyOrMalformedLegacyEntries += 1;
            } else if (!trimmed.includes('mevapur') && !trimmed.includes('localhost') && !trimmed.includes('127.0.0.1')) {
              externalUnownedUrls += 1;
            }
          }
        }
      }
    }

    console.log(`Reference Issues Found: ${referenceIssues.length}`);
    if (referenceIssues.length > 0) {
      console.warn('⚠️ Reference validation issues:', JSON.stringify(referenceIssues.slice(0, 10), null, 2));
      if (isApply) {
        throw new Error(`Migration aborted: ${referenceIssues.length} reference integrity issues detected.`);
      }
    }

    console.log('\n--- 2. Legacy Media Inventory ---');
    console.log(`Products with legacy media fields: ${productsWithLegacyMedia}`);
    console.log(`Total legacy media references: ${totalLegacyMediaRefs}`);
    console.log(`Unique legacy media references: ${legacyUrlSet.size}`);
    console.log(`Duplicate legacy media references: ${duplicateLegacyRefs}`);
    console.log(`Empty/malformed legacy media entries: ${emptyOrMalformedLegacyEntries}`);
    console.log(`External unowned URLs: ${externalUnownedUrls}`);

    let representedByMediaAssetCount = 0;
    for (const url of legacyUrlSet) {
      if (existingMediaAssets.has(url)) representedByMediaAssetCount += 1;
    }
    console.log(`Legacy references represented by MediaAsset: ${representedByMediaAssetCount}`);
    console.log(`Legacy references requiring future migration: ${legacyUrlSet.size - representedByMediaAssetCount}`);

    const slugCollisions = [...duplicateSlugs.entries()].filter(([_, ids]) => ids.length > 1);
    if (slugCollisions.length > 0) {
      console.warn(`⚠️ Detected ${slugCollisions.length} duplicate slug groups!`);
      if (isApply) throw new Error('Migration aborted: Duplicate slugs must be resolved before migration.');
    }

    if (duplicateSkus.size > 0) {
      console.warn(`⚠️ Detected ${duplicateSkus.size} duplicate SKU conflicts!`);
      if (isApply) throw new Error('Migration aborted: Duplicate SKUs must be resolved before applying SkuRegistry indexes.');
    }

    // 3. Checkpoint-Driven Batch Application
    if (isApply && isConfirmed) {
      console.log('\n--- 3. Checkpoint Execution ---');
      let migrationState = await MigrationState.findOne({ migrationId: MIGRATION_ID });

      if (migrationState) {
        if (migrationState.status === 'running') {
          throw new Error('Migration aborted: Another migration run is currently active (status: running).');
        }
        if (migrationState.status === 'completed' && !isRerun) {
          console.log(`Migration '${MIGRATION_ID}' already completed at ${migrationState.completedAt}. Use --rerun to re-execute.`);
          return { status: 'already_completed', state: migrationState };
        }
      } else {
        migrationState = await MigrationState.create({
          migrationId: MIGRATION_ID,
          status: 'running',
          startedAt: new Date()
        });
      }

      // Lock as running
      migrationState.status = 'running';
      if (!migrationState.startedAt) migrationState.startedAt = new Date();
      await migrationState.save();

      let lastProcessedId = migrationState.lastProcessedId;
      let totalUpdated = migrationState.updatedCount || 0;
      let totalProcessed = migrationState.processedCount || 0;

      console.log(`Resuming migration from lastProcessedId: ${lastProcessedId || 'START'}`);

      let hasMore = true;
      while (hasMore) {
        const query = lastProcessedId ? { _id: { $gt: lastProcessedId } } : {};
        const batch = await Product.find(query).sort({ _id: 1 }).limit(BATCH_SIZE);

        if (batch.length === 0) {
          hasMore = false;
          break;
        }

        try {
          for (const p of batch) {
            const derivedStatus = p.status || (p.isActive ? 'published' : 'draft');
            const normalizedSku = (p.sku && p.sku.trim() !== '') ? p.sku.trim().toUpperCase() : null;

            await Product.updateOne(
              { _id: p._id },
              {
                $set: {
                  status: derivedStatus,
                  isActive: (derivedStatus === 'published'),
                  sku: normalizedSku
                }
              }
            );
            totalUpdated += 1;

            if (normalizedSku) {
              await SkuRegistry.findOneAndUpdate(
                { sku: normalizedSku },
                { $set: { product: p._id, variantId: null, isRoot: true } },
                { upsert: true }
              );
            }

            if (Array.isArray(p.variants)) {
              for (const v of p.variants) {
                if (v.sku && v.sku.trim() !== '') {
                  const vSku = v.sku.trim().toUpperCase();
                  await SkuRegistry.findOneAndUpdate(
                    { sku: vSku },
                    { $set: { product: p._id, variantId: v._id, isRoot: false } },
                    { upsert: true }
                  );
                }
              }
            }

            totalProcessed += 1;
            lastProcessedId = p._id;
          }

          // Advance checkpoint after successful batch
          migrationState.lastProcessedId = lastProcessedId;
          migrationState.processedCount = totalProcessed;
          migrationState.updatedCount = totalUpdated;
          await migrationState.save();

          console.log(`Batch processed. Progress: ${totalProcessed} products processed (checkpoint: ${lastProcessedId})`);
        } catch (batchError) {
          migrationState.status = 'failed';
          migrationState.lastReasonCode = batchError.code || 'BATCH_PROCESSING_FAILED';
          await migrationState.save();
          throw batchError;
        }
      }

      // Mark completed
      migrationState.status = 'completed';
      migrationState.completedAt = new Date();
      migrationState.lastReasonCode = null;
      await migrationState.save();

      console.log(`✅ Migration '${MIGRATION_ID}' successfully completed. Total processed: ${totalProcessed}, Total updated: ${totalUpdated}`);
      return { status: 'completed', state: migrationState };
    } else {
      console.log('\n[DRY-RUN] Preflight and inventory complete. No changes were written to the database.');
      return { status: 'dry_run_complete' };
    }
  } finally {
    if (!customDbConnected && mongoose.connection.readyState !== 0 && require.main === module) {
      await mongoose.disconnect();
      console.log('Disconnected from MongoDB.');
    }
  }
}

if (require.main === module) {
  runMigration().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}

module.exports = { runMigration, MIGRATION_ID };
