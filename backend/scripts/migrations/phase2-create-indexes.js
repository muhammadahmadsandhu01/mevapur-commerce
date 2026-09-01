const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const Product = require('../../models/Product');
const SkuRegistry = require('../../models/SkuRegistry');
const MediaAsset = require('../../models/MediaAsset');

const isRollback = process.argv.includes('--rollback');

async function manageIndexes() {
  console.log(`--- Phase 2 Index Management (${isRollback ? 'ROLLBACK' : 'CREATE'}) ---`);

  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mevapur-commerce';
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB.');

  try {
    if (isRollback) {
      console.log('Rolling back Phase 2 indexes...');
      try { await SkuRegistry.collection.dropIndex('unique_global_sku'); } catch (e) { console.log('SkuRegistry index drop notice:', e.message); }
      try { await Product.collection.dropIndex('unique_product_slug'); } catch (e) { console.log('Product slug index drop notice:', e.message); }
      try { await Product.collection.dropIndex('unique_product_root_sku'); } catch (e) { console.log('Product root SKU index drop notice:', e.message); }
      console.log('✅ Index rollback complete.');
    } else {
      console.log('Building named Phase 2 indexes...');
      await SkuRegistry.createIndexes();
      console.log('✅ SkuRegistry indexes built.');

      await Product.createIndexes();
      console.log('✅ Product indexes built.');

      await MediaAsset.createIndexes();
      console.log('✅ MediaAsset indexes built.');
    }
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

if (require.main === module) {
  manageIndexes().catch(err => {
    console.error('Index management failed:', err);
    process.exit(1);
  });
}

module.exports = { manageIndexes };
