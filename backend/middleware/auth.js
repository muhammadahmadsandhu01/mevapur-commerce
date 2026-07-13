const jwt = require('jsonwebtoken');
const User = require('../models/User');

// @desc    Protect routes - verify JWT token
// @access  Private
exports.protect = async (req, res, next) => {
  try {
    let token;

    // Check for token in header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // If no token
    if (!token) {
      console.log('❌ No token provided');
      return res.status(401).json({
        success: false,
        message: 'Not authorized, no token provided'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    console.log('✅ Token verified, User ID:', decoded.id);

    // Find user by ID
    const user = await User.findById(decoded.id);

    if (!user) {
      console.log('❌ User not found for token');
      return res.status(401).json({
        success: false,
        message: 'User not found, token invalid'
      });
    }

    // Attach user to request (password already excluded in model)
    req.user = user;
    
    console.log('✅ User authenticated:', user.email, 'Role:', user.role);
    
    next();
  } catch (error) {
    console.error('❌ Auth middleware error:', error.message);
    
    // Specific error messages
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired, please login again'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
    
    res.status(401).json({
      success: false,
      message: 'Not authorized, token failed'
    });
  }
};

// @desc    Admin only middleware
// @access  Private/Admin
exports.admin = (req, res, next) => {
  console.log('🔒 Checking admin access for user:', req.user?.email, 'Role:', req.user?.role);
  
  // Check if user exists and has admin role
  if (req.user && (req.user.role === 'admin' || req.user.role === 'super_admin')) {
    console.log('✅ Admin access granted');
    next();
  } else {
    console.log('❌ Admin access denied for role:', req.user?.role);
    res.status(403).json({
      success: false,
      message: 'Not authorized as admin. Admin access required.'
    });
  }
};

// @desc    Super Admin only middleware
// @access  Private/SuperAdmin
exports.superAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'super_admin') {
    next();
  } else {
    res.status(403).json({
      success: false,
      message: 'Not authorized as super admin'
    });
  }
};

// @desc    Check specific roles
// @usage   protect, checkRoles(['admin', 'manager'])
exports.checkRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated'
      });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Not authorized. Required roles: ${roles.join(', ')}`
      });
    }
    
    next();
  };
};