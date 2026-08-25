const mongoose = require('mongoose');
const { seedRoles } = require('./roleSeeder');
const logger = require('../../common/utils/logger');

const validateSeederEnvironment = (environment = process.env) => {
  const mongoUri = environment.MONGODB_URI;

  if (
    typeof mongoUri !== 'string'
    || !/^mongodb(?:\+srv)?:\/\//i.test(mongoUri.trim())
  ) {
    const error = new Error('A valid MongoDB URI is required to run seeders');
    error.code = 'SEEDER_DATABASE_URI_REQUIRED';
    throw error;
  }

  return { mongoUri: mongoUri.trim() };
};

async function runSeeders({
  environment = process.env,
  connect = mongoose.connect.bind(mongoose),
  seed = seedRoles
} = {}) {
  const { mongoUri } = validateSeederEnvironment(environment);

  logger.info('Connecting to the configured database for seeding');
  await connect(mongoUri);
  logger.info('Seeder database connection established');

  await seed();

  logger.info('All seeders completed successfully');
}

async function main() {
  require('dotenv').config();

  try {
    await runSeeders();
  } catch (error) {
    logger.error('Seeder startup or execution failed safely', {
      errorCode: error.code || 'SEEDER_EXECUTION_FAILED',
      errorName: error.name
    });
    process.exitCode = 1;
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
}

// Run if called directly
if (require.main === module) {
  void main();
}

module.exports = {
  main,
  runSeeders,
  validateSeederEnvironment
};
