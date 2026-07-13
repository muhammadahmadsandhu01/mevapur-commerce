const ActivityLog = require('../models/ActivityLog');
const User = require('../models/User');

// @desc    Get all activity logs
// @route   GET /api/activity-logs
// @access  Private/Admin
exports.getActivityLogs = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      userId = '',
      action = '',
      startDate = '',
      endDate = '',
      search = ''
    } = req.query;

    let query = {};

    if (userId) {
      query.user = userId;
    }

    if (action) {
      query.action = action;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    if (search) {
      query.description = { $regex: search, $options: 'i' };
    }

    const skip = (page - 1) * limit;
    const total = await ActivityLog.countDocuments(query);
    const pages = Math.ceil(total / limit);

    const logs = await ActivityLog.find(query)
      .populate('user', 'fullName email role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    res.json({
      success: true,
      data: logs,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages,
        hasNext: page < pages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Get activity logs error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get activity log statistics
// @route   GET /api/activity-logs/stats
// @access  Private/Admin
exports.getActivityLogStats = async (req, res) => {
  try {
    const totalLogs = await ActivityLog.countDocuments();
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayLogs = await ActivityLog.countDocuments({
      createdAt: { $gte: today }
    });

    const thisWeek = new Date(today);
    thisWeek.setDate(thisWeek.getDate() - 7);
    const weekLogs = await ActivityLog.countDocuments({
      createdAt: { $gte: thisWeek }
    });

    // Get most active users
    const activeUsers = await ActivityLog.aggregate([
      { $group: { _id: '$user', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      { $project: { userId: '$_id', fullName: '$user.fullName', email: '$user.email', count: 1 } }
    ]);

    // Get most common actions
    const commonActions = await ActivityLog.aggregate([
      { $group: { _id: '$action', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    res.json({
      success: true,
      data: {
        totalLogs,
        todayLogs,
        weekLogs,
        activeUsers,
        commonActions
      }
    });
  } catch (error) {
    console.error('Get activity log stats error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Create activity log
// @route   POST /api/activity-logs
// @access  Private/Admin
exports.createActivityLog = async (req, res) => {
  try {
    const { action, description, details } = req.body;

    const log = await ActivityLog.create({
      user: req.user.id,
      action,
      description,
      details: details || {},
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
      browser: getBrowser(req.headers['user-agent']),
      os: getOS(req.headers['user-agent'])
    });

    res.status(201).json({
      success: true,
      message: 'Activity log created',
      data: log
    });
  } catch (error) {
    console.error('Create activity log error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Delete old activity logs
// @route   DELETE /api/activity-logs/cleanup
// @access  Private/SuperAdmin
exports.cleanupActivityLogs = async (req, res) => {
  try {
    const { days = 90 } = req.body;
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const result = await ActivityLog.deleteMany({
      createdAt: { $lt: cutoffDate }
    });

    res.json({
      success: true,
      message: `Deleted ${result.deletedCount} old activity logs`,
      data: {
        deletedCount: result.deletedCount
      }
    });
  } catch (error) {
    console.error('Cleanup activity logs error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Helper functions
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