const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const Product = require('../../models/Product');
const SkuRegistry = require('../../models/SkuRegistry');

const isApply = process.argv.includes('--apply');
const isConfirmed = process.argv.includes('--confirm-phase2-migration');

async function runMigration() {
  console.log('--- Phase 2 Product Reconciliation Migration ---');
  console.log(`Mode: ${isApply ? (isConfirmed ? 'APPLY (LIVE)' : 'APPLY (BLOCKED: missing --confirm-phase2-migration)') : 'DRY-RUN (Default)'}`);

  if (isApply && !isConfirmed) {
    console.error('Error: --apply requires --confirm-phase2-migration to execute changes.');
    process.exit(1);
  }

  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mevapur-commerce';
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB.');

  try {
    const products = await Product.find({}).lean();
    console.log(`Auditing ${products.length} product documents...`);

    const duplicateSkus = new Map();
    const duplicateSlugs = new Map();
    let missingStatusCount = 0;
    let emptySkuNormalizedCount = 0;
    let totalVariantsAudited = 0;

    const skuOwnerMap = new Map();

    for (const p of products) {
      if (!p.status) missingStatusCount += 1;

      // Check slug
      if (p.slug) {
        if (duplicateSlugs.has(p.slug)) {
          duplicateSlugs.get(p.slug).push(p._id);
        } else {
          duplicateSlugs.set(p.slug, [p._id]);
        }
      }

      // Check root SKU
      if (p.sku === '') emptySkuNormalizedCount += 1;
      if (p.sku && typeof p.sku === 'string' && p.sku.trim() !== '') {
        const norm = p.sku.trim().toUpperCase();
        if (skuOwnerMap.has(norm)) {
          duplicateSkus.set(norm, [...(duplicateSkus.get(norm) || [skuOwnerMap.get(norm)]), { productId: p._id, isRoot: true }]);
        } else {
          skuOwnerMap.set(norm, { productId: p._id, isRoot: true });
        }
      }

      // Check variant SKUs
      if (Array.isArray(p.variants)) {
        totalVariantsAudited += p.variants.length;
        for (const v of p.variants) {
          if (v.sku && typeof v.sku === 'string' && v.sku.trim() !== '') {
            const norm = v.sku.trim().toUpperCase();
            if (skuOwnerMap.has(norm)) {
              duplicateSkus.set(norm, [...(duplicateSkus.get(norm) || [skuOwnerMap.get(norm)]), { productId: p._id, variantId: v._id, isRoot: false }]);
            } else {
              skuOwnerMap.set(norm, { productId: p._id, variantId: v._id, isRoot: false });
            }
          }
        }
      }
    }

    console.log('\n--- Audit Results ---');
    console.log(`Total Products: ${products.length}`);
    console.log(`Total Variants: ${totalVariantsAudited}`);
    console.log(`Products missing 'status' field: ${missingStatusCount}`);
    console.log(`Empty SKU strings to normalize to null: ${emptySkuNormalizedCount}`);

    const slugCollisions = [...duplicateSlugs.entries()].filter(([_, ids]) => ids.length > 1);
    if (slugCollisions.length > 0) {
      console.warn(`⚠️ Detected ${slugCollisions.length} duplicate slug groups!`);
      slugCollisions.forEach(([slug, ids]) => console.warn(`  Slug '${slug}': ${ids.join(', ')}`));
    } else {
      console.log('✅ Slugs are unique across all products.');
    }

    if (duplicateSkus.size > 0) {
      console.warn(`⚠️ Detected ${duplicateSkus.size} duplicate SKU conflicts!`);
      duplicateSkus.forEach((refs, sku) => {
        console.warn(`  SKU '${sku}':`, JSON.stringify(refs));
      });
      if (isApply) {
        throw new Error('Migration aborted: Duplicate SKUs must be resolved before applying SkuRegistry indexes.');
      }
    } else {
      console.log('✅ SKUs are globally unique across all products and variants.');
    }

    if (isApply && isConfirmed) {
      console.log('\nApplying updates in batches...');
      let updatedCount = 0;
      let skuRegistryCount = 0;

      for (const p of products) {
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
        updatedCount += 1;

        // Populate SkuRegistry
        if (normalizedSku) {
          await SkuRegistry.findOneAndUpdate(
            { sku: normalizedSku },
            { $set: { product: p._id, variantId: null, isRoot: true } },
            { upsert: true }
          );
          skuRegistryCount += 1;
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
              skuRegistryCount += 1;
            }
          }
        }
      }

      console.log(`✅ Successfully updated ${updatedCount} products and created ${skuRegistryCount} SkuRegistry entries.`);
    } else {
      console.log('\n[DRY-RUN] No changes were written to the database.');
    }
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

if (require.main === module) {
  runMigration().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}

module.exports = { runMigration };
