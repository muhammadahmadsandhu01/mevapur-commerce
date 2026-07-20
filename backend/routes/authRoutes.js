const express = require('express');
const { body } = require('express-validator');

const {
  register,
  login,
  getMe,
  forgotPassword,
  resetPassword,
} = require('../controllers/authController');

const { protect } = require('../middleware/auth');
const { limiter } = require('../middleware/security');

const router = express.Router();

/*
|--------------------------------------------------------------------------
| Validation Rules
|--------------------------------------------------------------------------
*/

const registerValidation = [
  body('fullName')
    .trim()
    .notEmpty()
    .withMessage('Full name is required')
    .isLength({ min: 3, max: 100 })
    .withMessage('Full name must be between 3 and 100 characters'),

  body('email')
    .trim()
    .normalizeEmail()
    .isEmail()
    .withMessage('Please provide a valid email address'),

  body('password')
    .isLength({ min: 6, max: 100 })
    .withMessage('Password must be between 6 and 100 characters'),

  body('phone')
    .optional()
    .trim()
    .isLength({ min: 8, max: 20 })
    .withMessage('Invalid phone number'),
];

const loginValidation = [
  body('email')
    .trim()
    .normalizeEmail()
    .isEmail()
    .withMessage('Please provide a valid email address'),

  body('password')
    .notEmpty()
    .withMessage('Password is required'),
];

const forgotPasswordValidation = [
  body('email')
    .trim()
    .normalizeEmail()
    .isEmail()
    .withMessage('Please provide a valid email address'),
];

const resetPasswordValidation = [
  body('resetToken')
    .trim()
    .notEmpty()
    .withMessage('Reset token is required'),

  body('newPassword')
    .isLength({ min: 6, max: 100 })
    .withMessage('Password must be between 6 and 100 characters'),
];

/*
|--------------------------------------------------------------------------
| Public Routes
|--------------------------------------------------------------------------
*/

router.post(
  '/register',
  limiter,
  registerValidation,
  register
);

router.post(
  '/login',
  limiter,
  loginValidation,
  login
);

router.post(
  '/forgot-password',
  limiter,
  forgotPasswordValidation,
  forgotPassword
);

router.post(
  '/reset-password',
  limiter,
  resetPasswordValidation,
  resetPassword
);

/*
|--------------------------------------------------------------------------
| Protected Routes
|--------------------------------------------------------------------------
*/

router.get(
  '/me',
  protect,
  getMe
);

module.exports = router;