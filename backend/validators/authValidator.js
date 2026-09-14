const { z } = require('zod');
const passwordSchema = require('./passwordValidator');

const { CountryRegistry } = require('../modules/commerce');

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

  residenceCountry: z.string()
    .trim()
    .toUpperCase()
    .refine((val) => /^[A-Z]{2}$/.test(val) && CountryRegistry.hasCountry(val), {
      message: 'Valid ISO 3166-1 alpha-2 residence country required'
    })
    .optional(),

  preferredMarketCountry: z.string()
    .trim()
    .toUpperCase()
    .refine((val) => /^[A-Z]{2}$/.test(val) && CountryRegistry.hasCountry(val), {
      message: 'Valid ISO 3166-1 alpha-2 preferred market country required'
    })
    .optional(),
  
  phone: z.string()
    .optional()
    .or(z.literal('')),

  redirect: z.string()
    .max(500)
    .optional()
}).strict();

// Customer Register Schema (strict residenceCountry required for new customer registrations)
const customerRegisterSchema = registerSchema.extend({
  residenceCountry: z.string({
    required_error: 'Residence country is required'
  })
    .trim()
    .toUpperCase()
    .refine((val) => /^[A-Z]{2}$/.test(val) && CountryRegistry.hasCountry(val), {
      message: 'Valid ISO 3166-1 alpha-2 residence country required'
    })
});

// Login Schema
const loginSchema = z.object({
  email: z.string()
    .email('Invalid email address')
    .toLowerCase()
    .trim(),
  
  password: z.string()
    .min(1, 'Password is required')
}).strict();

// Verify Email Schema
const verifyEmailSchema = z.object({
  token: z.string()
    .min(1, 'Verification token is required')
    .trim()
}).strict();

// Resend Verification Schema
const resendVerificationSchema = z.object({
  email: z.string()
    .email('Invalid email address')
    .toLowerCase()
    .trim(),

  redirect: z.string()
    .max(500)
    .optional()
}).strict();

// Forgot Password Schema
const forgotPasswordSchema = z.object({
  email: z.string()
    .email('Invalid email address')
    .toLowerCase()
    .trim()
}).strict();

// Reset Password Schema
const resetPasswordSchema = z.object({
  resetToken: z.string()
    .min(1, 'Reset token is required'),
  
  newPassword: passwordSchema
}).strict();

// Update Profile Schema
const updateProfileSchema = z.object({
  fullName: z.string()
    .min(3, 'Full name must be at least 3 characters')
    .max(100, 'Full name cannot exceed 100 characters')
    .trim()
    .optional(),

  residenceCountry: z.string()
    .trim()
    .toUpperCase()
    .refine((val) => /^[A-Z]{2}$/.test(val) && CountryRegistry.hasCountry(val), {
      message: 'Valid ISO 3166-1 alpha-2 residence country required'
    })
    .optional(),

  preferredMarketCountry: z.string()
    .trim()
    .toUpperCase()
    .refine((val) => /^[A-Z]{2}$/.test(val) && CountryRegistry.hasCountry(val), {
      message: 'Valid ISO 3166-1 alpha-2 preferred market country required'
    })
    .optional(),
  
  phone: z.string()
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
}).strict();

module.exports = {
  registerSchema,
  customerRegisterSchema,
  loginSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
  changePasswordSchema
};
