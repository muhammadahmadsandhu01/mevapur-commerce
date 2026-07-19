const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000, // Wait 10 seconds before failing
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    
    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️ MongoDB disconnected. Retrying in 5 seconds...');
      setTimeout(connectDB, 5000);
    });

    mongoose.connection.on('error', (err) => {
      console.error(`❌ MongoDB connection error: ${err.message}`);
    });

  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    
    // Don't exit process immediately, keep trying every 10 seconds
    console.log('🔄 Retrying MongoDB connection in 10 seconds...');
    setTimeout(connectDB, 10000);

    // For initial startup, we still start the server even if DB is not connected yet
    // This allows health checks to pass while DB reconnects
  }
};

module.exports = connectDB;