const ActivityLog = require('../models/ActivityLog');
const AuditService = require('../services/AuditService');
const { formatCsv, safeContentDisposition } = require('../utils/csvHelper');
const { AppError } = require('../common/errors/AppError');
const ERROR_CODES = require('../constants/errorCodes');

const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// @desc    Get all activity logs with server-side pagination
// @route   GET /api/activity-logs
// @access  Private (manager, admin, super_admin)
exports.getActivityLogs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      userId = '',
      action = '',
      resourceType = '',
      startDate = '',
      endDate = '',
      search = ''
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    let query = {};

    if (userId) query.user = userId;
    if (action) query.action = action;
    if (resourceType) query.resourceType = resourceType;

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }

    if (search && typeof search === 'string' && search.trim()) {
      const sanitized = escapeRegex(search.trim().slice(0, 100));
      query.$or = [
        { description: { $regex: sanitized, $options: 'i' } },
        { action: { $regex: sanitized, $options: 'i' } }
      ];
    }

    const total = await ActivityLog.countDocuments(query);
    const pages = Math.ceil(total / limitNum) || 1;

    const logs = await ActivityLog.find(query)
      .populate('user', 'fullName role')
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limitNum);

    res.json({
      success: true,
      data: logs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages,
        hasNext: pageNum < pages,
        hasPrev: pageNum > 1
      }
    });
  } catch (error) {
    console.error('Get activity logs error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get activity log statistics (global)
// @route   GET /api/activity-logs/stats
// @access  Private (manager, admin, super_admin)
exports.getActivityLogStats = async (req, res) => {
  try {
    const totalLogs = await ActivityLog.countDocuments();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayLogs = await ActivityLog.countDocuments({ createdAt: { $gte: today } });

    const thisWeek = new Date(today);
    thisWeek.setDate(thisWeek.getDate() - 7);
    const weekLogs = await ActivityLog.countDocuments({ createdAt: { $gte: thisWeek } });

    res.json({
      success: true,
      data: {
        totalLogs,
        todayLogs,
        weekLogs
      }
    });
  } catch (error) {
    console.error('Get activity log stats error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Export activity logs to CSV (Cap: 5000 records, overflow rejected)
// @route   GET /api/activity-logs/export
// @access  Private (admin, super_admin)
exports.exportActivityLogs = async (req, res) => {
  try {
    const {
      search = '',
      action = '',
      resourceType = '',
      startDate = '',
      endDate = ''
    } = req.query;

    let query = {};

    if (action) query.action = action;
    if (resourceType) query.resourceType = resourceType;

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }

    if (search && typeof search === 'string' && search.trim()) {
      const sanitized = escapeRegex(search.trim().slice(0, 100));
      query.$or = [
        { description: { $regex: sanitized, $options: 'i' } },
        { action: { $regex: sanitized, $options: 'i' } }
      ];
    }

    const matchCount = await ActivityLog.countDocuments(query);
    const MAX_EXPORT_CAP = 5000;

    if (matchCount > MAX_EXPORT_CAP) {
      return res.status(400).json({
        success: false,
        code: 'EXPORT_LIMIT_EXCEEDED',
        message: `Export matches ${matchCount} records, exceeding the 5,000 record cap. Please refine your date range or filters.`
      });
    }

    const logs = await ActivityLog.find(query)
      .populate('user', 'fullName role')
      .sort({ createdAt: -1, _id: -1 })
      .limit(MAX_EXPORT_CAP);

    const headers = [
      'Timestamp',
      'Event',
      'Actor ID',
      'Actor Name',
      'Actor Role',
      'Resource Type',
      'Resource ID',
      'Description',
      'Request ID',
      'Outcome'
    ];

    const rows = logs.map((log) => [
      log.createdAt ? log.createdAt.toISOString() : '',
      log.action || 'ACTIVITY',
      log.user?._id ? String(log.user._id) : (log.user || 'system'),
      log.user?.fullName || 'System',
      log.user?.role || 'system',
      log.resourceType || 'N/A',
      log.resourceId ? String(log.resourceId) : 'N/A',
      log.description || '',
      req.requestId || 'N/A',
      'SUCCESS'
    ]);

    const csvData = formatCsv(headers, rows);
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `activity-logs-${dateStr}.csv`;

    await AuditService.log({
      eventName: 'ACTIVITY.EXPORTED',
      userId: req.user.id,
      status: 'SUCCESS',
      metadata: {
        recordsExported: rows.length,
        filters: { action, resourceType, startDate, endDate, search }
      }
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', safeContentDisposition(filename));
    return res.status(200).send(csvData);
  } catch (error) {
    console.error('Export activity logs error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};