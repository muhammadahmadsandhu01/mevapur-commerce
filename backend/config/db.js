const mongoose = require('mongoose');

let isConnected = false;
let reconnectTimer = null;

// ===============================
// Connect MongoDB
// ===============================
const connectDB = async () => {
  try {
    if (isConnected) {
      return mongoose.connection;
    }

    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      maxPoolSize: 20,
      minPoolSize: 5,
      retryWrites: true,
      autoIndex: process.env.NODE_ENV !== 'production',
    });

    isConnected = true;

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

    return conn;
  } catch (error) {
    isConnected = false;

    console.error(`❌ MongoDB Connection Error: ${error.message}`);

    if (!reconnectTimer) {
      console.log('🔄 Retrying MongoDB connection in 10 seconds...');

      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connectDB();
      }, 10000);
    }
  }
};

// ===============================
// MongoDB Events
// ===============================

mongoose.connection.on('connected', () => {
  isConnected = true;
  console.log('🟢 MongoDB connection established');
});

mongoose.connection.on('disconnected', () => {
  isConnected = false;

  console.warn('⚠ MongoDB disconnected');

  if (!reconnectTimer) {
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connectDB();
    }, 5000);
  }
});

mongoose.connection.on('reconnected', () => {
  isConnected = true;
  console.log('✅ MongoDB reconnected');
});

mongoose.connection.on('error', (err) => {
  console.error(`❌ MongoDB Error: ${err.message}`);
});

// ===============================
// Graceful Shutdown
// ===============================

process.on('SIGINT', async () => {
  await mongoose.connection.close();

  console.log('🔴 MongoDB connection closed');

  process.exit(0);
});

process.on('SIGTERM', async () => {
  await mongoose.connection.close();

  console.log('🔴 MongoDB connection closed');

  process.exit(0);
});

module.exports = connectDB;