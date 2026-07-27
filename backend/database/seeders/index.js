const mongoose = require('mongoose');
const { seedRoles } = require('./roleSeeder');
const { logger } = require('../../common/logger');
require('dotenv').config();

async function runSeeders() {
  try {
    logger.info('Connecting to database for seeding...');
    await mongoose.connect(process.env.MONGODB_URI);
    logger.info('Database connected');

    await seedRoles();

    logger.info('All seeders completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Seeder failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runSeeders();
}

module.exports = { runSeeders };