const { z } = require('zod');

// Revoke Single Session
const revokeSessionSchema = z.object({
  sessionId: z.string()
    .min(1, 'Session ID is required')
    .regex(/^[0-9a-f]{24}$/, 'Invalid session ID format')
});

// Revoke Multiple Sessions
const revokeMultipleSessionsSchema = z.object({
  sessionIds: z.array(
    z.string()
      .min(1, 'Session ID is required')
      .regex(/^[0-9a-f]{24}$/, 'Invalid session ID format')
  ).min(1, 'At least one session ID is required')
});

// Logout All Devices
const logoutAllSchema = z.object({
  confirm: z.boolean()
    .refine(val => val === true, {
      message: 'Confirmation is required'
    })
});

module.exports = {
  revokeSessionSchema,
  revokeMultipleSessionsSchema,
  logoutAllSchema
};