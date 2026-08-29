const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const mongoose = require('mongoose');

// Import Middleware
const { limiter, dataSanitizer, xssCleaner, hppCleaner, securityHeaders } = require('./middleware/security');
const { morganStream } = require('./middleware/logger');
const errorHandler = require('./middleware/errorHandler');
const requestId = require('./middleware/requestId');
const parseCookies = require('./middleware/cookies');
const { getRuntimeConfig } = require('./config/runtime.config');
const { createReadinessHandler } = require('./operations/readiness');

// Import Routes
const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const orderRoutes = require('./routes/orderRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const adminRoutes = require('./routes/adminRoutes');
const customerRoutes = require('./routes/customerRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const brandRoutes = require('./routes/brandRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const couponRoutes = require('./routes/couponRoutes');
const settingRoutes = require('./routes/settingRoutes');
const activityLogRoutes = require('./routes/activityLogRoutes');
const userRoutes = require('./routes/userRoutes');
const reportRoutes = require('./routes/reportRoutes');
const roleRoutes = require('./routes/roleRoutes');
const contentRoutes = require('./routes/contentRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const returnRoutes = require('./routes/returnRoutes');
const refundRoutes = require('./routes/refundRoutes');
const commercialCoreRoutes = require('./routes/commercialCoreRoutes');
const accountRoutes = require('./routes/accountRoutes');
const assistantRoutes = require('./modules/assistant/assistant.routes');

const app = express();
const runtimeConfig = getRuntimeConfig();

// --- Security & Middleware Setup ---
app.set('trust proxy', runtimeConfig.proxy.trust);
app.use(securityHeaders(runtimeConfig));
app.use('/api', limiter);

// CORS Configuration
const corsOptions = {
  origin(origin, callback) {
    if (!origin || runtimeConfig.cors.isAllowedOrigin(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-CSRF-Token',
    'X-Request-ID',
    'X-Device-ID',
    'x-auth-token',
    'Idempotency-Key'
  ],
  credentials: runtimeConfig.cors.credentials
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Request Logging
app.use(requestId);
app.use((req, res, next) => {
  res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  next();
});
app.use(morgan('combined', { stream: morganStream }));

// Payment gateways sign the exact request bytes. Mount this before any
// JSON parsing or sanitization so signature verification remains valid.
app.use('/api/payments/webhook', paymentRoutes.webhookRouter);

app.use(parseCookies);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(dataSanitizer());
app.use(xssCleaner());
app.use(hppCleaner());

// Static Files
if (runtimeConfig.filesystem.uploadsMode === 'read-only') {
  app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
    dotfiles: 'deny',
    fallthrough: true,
    index: false
  }));
}

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/auth', authRoutes); // Temporary compatibility alias for legacy clients
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/brands', brandRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/settings', settingRoutes);
app.use('/api/activity-logs', activityLogRoutes);
app.use('/api/users', userRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/returns', returnRoutes);
app.use('/api/refunds', refundRoutes);
app.use('/api/commerce', commercialCoreRoutes);
app.use('/api/account', accountRoutes);
app.use('/api/assistant', assistantRoutes);

// Health Check (Works even if DB is down)
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    message: 'HARZAAR API is running',
    dbStatus: mongoose.connection.readyState === 1 ? 'Connected' : 'Connecting...'
  });
});

// Readiness is intentionally separate from liveness. It checks only internal
// runtime, lifecycle, and database state and never calls providers.
app.get('/api/ready', createReadinessHandler());

// 404 Handler
app.use((req, res, next) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Global Error Handler
app.use(errorHandler);

module.exports = app;
