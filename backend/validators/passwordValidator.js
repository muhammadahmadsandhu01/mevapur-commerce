const { z } = require('zod');

// Enterprise Password Policy
const passwordSchema = z.string()
  .min(12, 'Password must be at least 12 characters long')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/\d/, 'Password must contain at least one number')
  .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Password must contain at least one special character (!@#$%^&*...)')
  .refine(
    (pwd) => {
      // Check for repeated characters (e.g., "aaa", "111")
      return !/(.)\1{2,}/.test(pwd);
    },
    { message: 'Password cannot contain repeated characters (e.g., aaa, 111)' }
  )
  .refine(
    (pwd) => {
      // Check for sequential characters (e.g., "abc", "123")
      const lower = pwd.toLowerCase();
      for (let i = 0; i < lower.length - 2; i++) {
        const charCode = lower.charCodeAt(i);
        const next1 = lower.charCodeAt(i + 1);
        const next2 = lower.charCodeAt(i + 2);
        
        if (next1 === charCode + 1 && next2 === charCode + 2) {
          return false;
        }
      }
      return true;
    },
    { message: 'Password cannot contain sequential characters (e.g., abc, 123)' }
  );

module.exports = passwordSchema;