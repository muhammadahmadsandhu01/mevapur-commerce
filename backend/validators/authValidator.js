const { z } = require('zod');
const passwordSchema = require('./passwordValidator');

// Register Schema
const registerSchema = z.object({
  fullName: z.string()
    .min(3, 'Full name must be at least 3 characters')
    .max(100, 'Full name cannot exceed 100 characters')
    .trim(),
  
  email: z.string()
    .email('Invalid email address')
    .toLowerCase()
    .trim(),
  
  password: passwordSchema,
  
  phone: z.string()
    .regex(/^03\d{9}$/, 'Valid Pakistani phone number required (e.g., 03001234567)')
    .optional()
    .or(z.literal(''))
});

// Login Schema
const loginSchema = z.object({
  email: z.string()
    .email('Invalid email address')
    .toLowerCase()
    .trim(),
  
  password: z.string()
    .min(1, 'Password is required')
});

// Forgot Password Schema
const forgotPasswordSchema = z.object({
  email: z.string()
    .email('Invalid email address')
    .toLowerCase()
    .trim()
});

// Reset Password Schema
const resetPasswordSchema = z.object({
  resetToken: z.string()
    .min(1, 'Reset token is required'),
  
  newPassword: passwordSchema
});

// Update Profile Schema
const updateProfileSchema = z.object({
  fullName: z.string()
    .min(3, 'Full name must be at least 3 characters')
    .max(100, 'Full name cannot exceed 100 characters')
    .trim()
    .optional(),
  
  phone: z.string()
    .regex(/^03\d{9}$/, 'Valid Pakistani phone number required')
    .optional()
    .or(z.literal('')),
  
  avatar: z.string()
    .url('Invalid URL for avatar')
    .optional()
    .or(z.literal(''))
});

// Change Password Schema
const changePasswordSchema = z.object({
  currentPassword: z.string()
    .min(1, 'Current password is required'),
  
  newPassword: passwordSchema
});

module.exports = {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
  changePasswordSchema
};