const User = require('../models/User');
const { validationResult } = require('express-validator');
const { logger } = require('../middleware/logger');
const crypto = require('crypto');

/*
|--------------------------------------------------------------------------
| Helper: Get Client IP & User Agent for Logging
|--------------------------------------------------------------------------
*/
const getClientInfo = (req) => {
  return {
    ip: req.ip || req.connection.remoteAddress || 'unknown',
    userAgent: req.get('User-Agent') || 'unknown'
  };
};

/*
|--------------------------------------------------------------------------
| Register New User
|--------------------------------------------------------------------------
| - Validates input via express-validator
| - Prevents role escalation (hardcoded 'customer')
| - Uses Model hooks for password hashing
| - Logs registration with IP info
*/
exports.register = async (req, res) => {
  try {
    // 1. Validation Check
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { fullName, email, password, phone } = req.body;
    const clientInfo = getClientInfo(req);

    // 2. Check Existing User
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      logger.warn(`Registration attempt with existing email: ${email} from ${clientInfo.ip}`);
      return res.status(409).json({
        success: false,
        message: 'User already exists with this email address.'
      });
    }

    // 3. Create User (Model pre-save hook handles hashing)
    const user = await User.create({
      fullName,
      email,
      password,
      phone,
      role: 'customer' // 🔒 Security: Force default role to prevent escalation
    });

    // 4. Generate Token (Using Model Method)
    const token = user.generateToken();

    // 5. Log Activity
    logger.info(`New user registered: ${email} (ID: ${user._id}) from ${clientInfo.ip}`);

    // 6. Send Response (Model toJSON method hides sensitive fields automatically)
    return res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: {
        user,
        token
      }
    });

  } catch (error) {
    logger.error(`Registration Error: ${error.message}`, error.stack);
    
    return res.status(500).json({
      success: false,
      message: 'Registration failed due to server error.'
    });
  }
};

/*
|--------------------------------------------------------------------------
| Login User
|--------------------------------------------------------------------------
| - Validates credentials
| - Checks password match securely using bcrypt
| - Updates lastLogin timestamp for analytics
| - Returns token + sanitized user data
*/
exports.login = async (req, res) => {
  try {
    // 1. Validation Check
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;
    const clientInfo = getClientInfo(req);
    
    // 2. Find User (Select password explicitly as it's hidden by default)
    const user = await User.findOne({ email }).select('+password');
    
    if (!user) {
      logger.warn(`Login attempt failed: User not found (${email}) from ${clientInfo.ip}`);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.' // Generic message for security
      });
    }

    // 3. Verify Password using Model Method
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      logger.warn(`Login attempt failed: Invalid password for ${email} from ${clientInfo.ip}`);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.' // Generic message
      });
    }

    // 4. Update Last Login (Async, don't wait for it to block response)
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false }); // Skip validation for performance

    // 5. Generate Token
    const token = user.generateToken();

    // 6. Log Success
    logger.info(`User logged in: ${email} (ID: ${user._id}) from ${clientInfo.ip}`);

    // 7. Send Response
    return res.json({
      success: true,
      message: 'Login successful',
      data: {
        user,
        token
      }
    });

  } catch (error) {
    logger.error(`Login Error: ${error.message}`, error.stack);
    
    return res.status(500).json({
      success: false,
      message: 'Login failed due to server error.'
    });
  }
};

/*
|--------------------------------------------------------------------------
| Get Current User Profile
|--------------------------------------------------------------------------
| - Protected route (req.user available via middleware)
| - No extra DB query needed (middleware already fetched lean user)
| - Returns full profile including addresses
*/
exports.getMe = async (req, res) => {
  try {
    // req.user is already set by 'protect' middleware with lean() query
    // No need to query database again -> Performance Boost
    const user = req.user;

    logger.debug(`Profile accessed: ${user.email}`);

    return res.json({
      success: true,
      data: {
        user
      }
    });

  } catch (error) {
    logger.error(`Get Profile Error: ${error.message}`, error.stack);
    
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch profile.'
    });
  }
};

/*
|--------------------------------------------------------------------------
| Forgot Password
|--------------------------------------------------------------------------
| - Generates secure random reset token
| - Hashes token (SHA-256) before saving to DB (Security Best Practice)
| - Sets expiration (15 mins)
| - TODO: Integrate Email Service (Nodemailer/SendGrid)
*/
exports.forgotPassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email } = req.body;
    const clientInfo = getClientInfo(req);

    const user = await User.findOne({ email });

    if (!user) {
      // Security: Don't reveal if email exists or not to prevent enumeration
      logger.warn(`Password reset requested for non-existent email: ${email} from ${clientInfo.ip}`);
      return res.json({
        success: true,
        message: 'If an account exists with this email, a reset link has been sent.'
      });
    }

    // Generate Random Token
    const resetToken = crypto.randomBytes(32).toString('hex');

    // Hash Token (SHA-256) before saving to DB
    // This ensures even if DB is compromised, tokens are safe
    user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetPasswordExpire = Date.now() + 15 * 60 * 1000; // 15 minutes

    await user.save();

    logger.info(`Password reset token generated for: ${email} from ${clientInfo.ip}`);

    // TODO: Send Email here with reset link containing the raw 'resetToken'
    // await sendEmail({ ... });

    // For Development: Return token directly (REMOVE THIS IN PRODUCTION)
    return res.json({
      success: true,
      message: 'Password reset link sent to email.',
      resetToken // ⚠️ SECURITY RISK: Remove this line in production
    });

  } catch (error) {
    logger.error(`Forgot Password Error: ${error.message}`, error.stack);
    
    return res.status(500).json({
      success: false,
      message: 'Failed to process password reset request.'
    });
  }
};

/*
|--------------------------------------------------------------------------
| Reset Password
|--------------------------------------------------------------------------
| - Verifies hashed token against DB
| - Checks expiration time
| - Updates password (Model hooks handle hashing)
| - Clears reset tokens after successful reset
*/
exports.resetPassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { resetToken, newPassword } = req.body;
    const clientInfo = getClientInfo(req);

    if (!resetToken || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Reset token and new password are required.'
      });
    }

    // Hash the incoming token to match the one stored in DB
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() } // Ensure token is not expired
    });

    if (!user) {
      logger.warn(`Invalid or expired reset token used from ${clientInfo.ip}`);
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token.'
      });
    }

    // Update Password (Model pre-save hook will hash it)
    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save();

    logger.info(`Password reset successful for: ${user.email} from ${clientInfo.ip}`);

    return res.json({
      success: true,
      message: 'Password reset successful. Please login.'
    });

  } catch (error) {
    logger.error(`Reset Password Error: ${error.message}`, error.stack);
    
    return res.status(500).json({
      success: false,
      message: 'Failed to reset password.'
    });
  }
};