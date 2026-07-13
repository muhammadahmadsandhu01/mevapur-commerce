const ActivityLog = require('../models/ActivityLog');

// Auto-log important actions
exports.logActivity = async (req, action, description, details = {}) => {
  try {
    await ActivityLog.create({
      user: req.user?.id,
      action,
      description,
      details,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
      browser: getBrowser(req.headers['user-agent']),
      os: getOS(req.headers['user-agent'])
    });
  } catch (error) {
    console.error('Activity logging error:', error);
  }
};

function getBrowser(userAgent) {
  if (!userAgent) return 'Unknown';
  if (userAgent.includes('Chrome')) return 'Chrome';
  if (userAgent.includes('Firefox')) return 'Firefox';
  if (userAgent.includes('Safari')) return 'Safari';
  if (userAgent.includes('Edge')) return 'Edge';
  return 'Other';
}

function getOS(userAgent) {
  if (!userAgent) return 'Unknown';
  if (userAgent.includes('Windows')) return 'Windows';
  if (userAgent.includes('Mac')) return 'macOS';
  if (userAgent.includes('Linux')) return 'Linux';
  if (userAgent.includes('Android')) return 'Android';
  if (userAgent.includes('iOS')) return 'iOS';
  return 'Other';
}