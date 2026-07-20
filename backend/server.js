require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const mongoose = require('mongoose');
const connectDB = require('./config/db');

// Import Middleware
const { limiter, dataSanitizer, xssCleaner, hppCleaner, securityHeaders } = require('./middleware/security');
const { logger, morganStream } = require('./middleware/logger');
const errorHandler = require('./middleware/errorHandler');

// Import Routes
const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const orderRoutes = require('./routes/orderRoutes');
const adminRoutes = require('./routes/adminRoutes');
const customerRoutes = require('./routes/customerRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const brandRoutes = require('./routes/brandRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const couponRoutes = require('./routes/couponRoutes'); // ✅ Fixed
const settingRoutes = require('./routes/settingRoutes');
const activityLogRoutes = require('./routes/activityLogRoutes');
const userRoutes = require('./routes/userRoutes');
const reportRoutes = require('./routes/reportRoutes');
const contentRoutes = require('./routes/contentRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const returnRoutes = require('./routes/returnRoutes');
const refundRoutes = require('./routes/refundRoutes');

const app = express();

// --- Security & Middleware Setup ---
app.use(securityHeaders());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(dataSanitizer());
app.use(xssCleaner());
app.use(hppCleaner());
app.use('/api', limiter);

// CORS Configuration
const corsOptions = {
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'http://localhost:3001',
    'https://mevapur-frontend.vercel.app',
    'https://mevapur-admin.vercel.app'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token'],
  credentials: true
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Request Logging
app.use(morgan('combined', { stream: morganStream }));

// Static Files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/customers', customerRoutes); 
app.use('/api/categories', categoryRoutes);
app.use('/api/brands', brandRoutes); 
app.use('/api/reviews', reviewRoutes);
app.use('/api/coupons', couponRoutes); // ✅ Fixed route
app.use('/api/settings', settingRoutes);
app.use('/api/activity-logs', activityLogRoutes);
app.use('/api/users', userRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/returns', returnRoutes);
app.use('/api/refunds', refundRoutes);

// Health Check (Works even if DB is down)
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    message: 'MevaPur API is running',
    dbStatus: mongoose.connection.readyState === 1 ? 'Connected' : 'Connecting...'
  });
});

// 404 Handler
app.use((req, res, next) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Global Error Handler
app.use(errorHandler);

// Start Server FIRST, then connect DB
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
  console.log(`
    ╔══════════════════════════════════════════╗
    ║  🚀 MevaPur Server is running!           ║
    ║  📡 Port: ${PORT}                        ║
    ║  🌍 Environment: ${process.env.NODE_ENV || 'development'}            ║
    ║  🔒 Security: Enabled                    ║
    ╚══════════════════════════════════════════╝
  `);
  
  connectDB();
});

module.exports = app;