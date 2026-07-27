require('dotenv').config();

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5000,
  
  mongo: {
    uri: process.env.MONGODB_URI,
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    expire: process.env.JWT_EXPIRE || '15m',
    refreshExpire: process.env.JWT_REFRESH_EXPIRE || '7d',
  },

  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000, // 1 day
  },

  security: {
    bcryptRounds: 12,
    maxLoginAttempts: 5,
    lockoutDurationMs: 30 * 60 * 1000, // 30 minutes
    passwordMinLength: 8,
  },

  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100,
    loginMax: 5,
  },

  cors: {
    origin: [process.env.FRONTEND_URL, process.env.ADMIN_URL],
    credentials: true,
  },
  
  features: {
    enable2FA: false, // Feature Flag
    enableOAuth: false,
    enablePasskeys: false,
  }
};

module.exports = config;