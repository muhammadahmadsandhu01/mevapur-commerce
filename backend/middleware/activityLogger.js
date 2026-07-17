const ActivityLog = require('../models/ActivityLog');

// Auto-log important actions
exports.logActivity = async (req, action, description, details = {}) => {
  try {
    // Extract resource info from details if provided by the controller
    const { resourceType, resourceId, ...otherDetails } = details;

    await ActivityLog.create({
      user: req.user?.id || null, // Allow null for system actions
      action,
      description,
      details: otherDetails,
      resourceType: resourceType || null,
      resourceId: resourceId || null,
      ipAddress: req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress,
      userAgent: req.headers['user-agent'],
      browser: getBrowser(req.headers['user-agent']),
      os: getOS(req.headers['user-agent'])
    });
  } catch (error) {
    // 🌟 ENTERPRISE FEATURE: Fail silently for logging to avoid breaking the main request
    console.error('Activity logging error (non-fatal):', error);
  }
};

function getBrowser(userAgent) {
  if (!userAgent) return 'Unknown';
  if (userAgent.includes('Edg')) return 'Edge'; // New Edge uses 'Edg'
  if (userAgent.includes('Chrome')) return 'Chrome';
  if (userAgent.includes('Firefox')) return 'Firefox';
  if (userAgent.includes('Safari')) return 'Safari';
  return 'Other';
}

function getOS(userAgent) {
  if (!userAgent) return 'Unknown';
  if (userAgent.includes('Windows')) return 'Windows';
  if (userAgent.includes('Mac OS X')) return 'macOS';
  if (userAgent.includes('Linux')) return 'Linux';
  if (userAgent.includes('Android')) return 'Android';
  if (userAgent.includes('iPhone') || userAgent.includes('iPad')) return 'iOS';
  return 'Other';
}