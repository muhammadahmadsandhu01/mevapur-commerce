const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const InventoryTransaction = require('../../models/InventoryTransaction');

const isRollback = process.argv.includes('--rollback');

async function managePhase3Indexes() {
  console.log(`--- Phase 3 Index Management (${isRollback ? 'ROLLBACK' : 'CREATE'}) ---`);

  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mevapur-commerce';
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB.');

  try {
    if (isRollback) {
      console.log('Rolling back Phase 3 indexes...');
      try {
        await InventoryTransaction.collection.dropIndex('unique_inventory_operation_key');
      } catch (e) {
        console.log('InventoryTransaction index drop notice:', e.message);
      }
      console.log('✅ Phase 3 Index rollback complete.');
    } else {
      console.log('Building named Phase 3 indexes...');
      await InventoryTransaction.createIndexes();
      console.log('✅ InventoryTransaction indexes built.');
    }
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

if (require.main === module) {
  managePhase3Indexes().catch((err) => {
    console.error('Index management failed:', err);
    process.exit(1);
  });
}

module.exports = { managePhase3Indexes };
