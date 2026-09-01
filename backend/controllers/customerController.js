const User = require('../models/User');
const Order = require('../models/Order');
const FinancialMetricsService = require('../services/order/FinancialMetricsService');
const SessionService = require('../services/SessionService');
const AuditService = require('../services/AuditService');
const {
  formatCsv,
  sanitizeFilename,
  safeContentDisposition
} = require('../utils/csvHelper');
const { AppError } = require('../common/errors/AppError');
const ERROR_CODES = require('../constants/errorCodes');
const mongoose = require('mongoose');

const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @desc    Get all customers with server-side pagination, search, status filter, and authoritative financial summaries
 * @route   GET /api/customers
 * @access  Private (support, manager, admin, super_admin)
 */
exports.getCustomers = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 15,
      search = '',
      status = 'all',
      sortBy = 'createdAt-desc'
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 15));
    const skip = (pageNum - 1) * limitNum;

    const query = { role: 'customer', isDeleted: { $ne: true } };

    if (search && typeof search === 'string' && search.trim()) {
      const sanitized = escapeRegex(search.trim().slice(0, 100));
      query.$or = [
        { fullName: { $regex: sanitized, $options: 'i' } },
        { email: { $regex: sanitized, $options: 'i' } },
        { phone: { $regex: sanitized, $options: 'i' } }
      ];
    }

    if (status === 'active') {
      query.isBlocked = { $ne: true };
    } else if (status === 'blocked' || status === 'inactive') {
      query.isBlocked = true;
    }

    const sortOptions = {
      'createdAt-desc': { createdAt: -1, _id: -1 },
      'createdAt-asc': { createdAt: 1, _id: 1 },
      'name-asc': { fullName: 1, _id: 1 },
      'name-desc': { fullName: -1, _id: -1 }
    };
    const mongoSort = sortOptions[sortBy] || { createdAt: -1, _id: -1 };

    const todayInterval = FinancialMetricsService.getTodayInterval();

    const [
      total,
      customers,
      totalCustomers,
      activeCustomers,
      blockedCustomers,
      newCustomersToday,
      globalRevenue
    ] = await Promise.all([
      User.countDocuments(query),
      User.find(query)
        .select('_id fullName email phone avatar addresses isVerified isBlocked createdAt updatedAt')
        .sort(mongoSort)
        .skip(skip)
        .limit(limitNum),
      User.countDocuments({ role: 'customer', isDeleted: { $ne: true } }),
      User.countDocuments({ role: 'customer', isBlocked: { $ne: true }, isDeleted: { $ne: true } }),
      User.countDocuments({ role: 'customer', isBlocked: true, isDeleted: { $ne: true } }),
      User.countDocuments({ role: 'customer', isDeleted: { $ne: true }, createdAt: { $gte: todayInterval.start, $lt: todayInterval.end } }),
      FinancialMetricsService.aggregateRealizedRevenue(null)
    ]);

    const customerIds = customers.map((c) => c._id);

    const [financialMap, totalOrderMap] = await Promise.all([
      FinancialMetricsService.getCustomerFinancialSummary(customerIds),
      FinancialMetricsService.getCustomerTotalOrderCounts(customerIds)
    ]);

    const data = customers.map((c) => {
      const custId = c._id.toString();
      const fin = financialMap.get(custId);
      const totalOrders = totalOrderMap.get(custId) || 0;
      const realizedOrders = fin ? fin.realizedOrders : 0;
      const totalSpent = fin ? fin.totalSpent : 0;
      const averageOrderValue = fin ? fin.averageOrderValue : 0;
      const firstOrderDate = fin ? fin.firstOrderDate : null;
      const lastOrderDate = fin ? fin.lastOrderDate : null;

      const primaryAddress = Array.isArray(c.addresses)
        ? (c.addresses.find((a) => a.isDefault) || c.addresses[0] || null)
        : null;

      return {
        id: custId,
        _id: custId,
        fullName: c.fullName,
        email: c.email,
        phone: c.phone || '',
        avatar: c.avatar || '',
        addresses: c.addresses || [],
        primaryAddress,
        isVerified: Boolean(c.isVerified),
        isBlocked: Boolean(c.isBlocked),
        isActive: !c.isBlocked,
        totalOrders,
        realizedOrders,
        totalSpent,
        averageOrderValue,
        firstOrderDate,
        lastOrderDate,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt
      };
    });

    const pages = Math.max(1, Math.ceil(total / limitNum));

    return res.status(200).json({
      success: true,
      data,
      summary: {
        global: {
          totalCustomers,
          activeCustomers,
          blockedCustomers,
          newCustomersToday,
          totalRealizedSpend: globalRevenue.realizedRevenue,
          averageLifetimeValue: totalCustomers > 0
            ? FinancialMetricsService.roundMoney(globalRevenue.realizedRevenue / totalCustomers)
            : 0
        }
      },
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
    return next(error);
  }
};

/**
 * @desc    Export filtered customers to CSV (bounded 5,000 records)
 * @route   GET /api/customers/export
 * @access  Private (manager, admin, super_admin)
 */
exports.exportCustomers = async (req, res, next) => {
  try {
    const { search = '', status = 'all' } = req.query;
    const MAX_EXPORT_LIMIT = 5000;

    const query = { role: 'customer', isDeleted: { $ne: true } };

    if (search && typeof search === 'string' && search.trim()) {
      const sanitized = escapeRegex(search.trim().slice(0, 100));
      query.$or = [
        { fullName: { $regex: sanitized, $options: 'i' } },
        { email: { $regex: sanitized, $options: 'i' } },
        { phone: { $regex: sanitized, $options: 'i' } }
      ];
    }

    if (status === 'active') {
      query.isBlocked = { $ne: true };
    } else if (status === 'blocked' || status === 'inactive') {
      query.isBlocked = true;
    }

    const totalCount = await User.countDocuments(query);
    if (totalCount > MAX_EXPORT_LIMIT) {
      return res.status(400).json({
        success: false,
        code: 'EXPORT_LIMIT_EXCEEDED',
        message: `Export matches ${totalCount} records, which exceeds the maximum limit of ${MAX_EXPORT_LIMIT}. Please narrow your search or filter.`,
        totalCount,
        maxLimit: MAX_EXPORT_LIMIT
      });
    }

    const customers = await User.find(query)
      .select('_id fullName email phone isBlocked createdAt')
      .sort({ createdAt: -1, _id: -1 });

    const customerIds = customers.map((c) => c._id);
    const [financialMap, totalOrderMap] = await Promise.all([
      FinancialMetricsService.getCustomerFinancialSummary(customerIds),
      FinancialMetricsService.getCustomerTotalOrderCounts(customerIds)
    ]);

    const headers = [
      'Customer Name',
      'Email',
      'Phone',
      'Total Orders',
      'Realized Orders',
      'Total Realized Spend (PKR)',
      'Avg Order Value (PKR)',
      'Status',
      'Joined Date',
      'Last Order Date'
    ];

    const rows = customers.map((c) => {
      const custId = c._id.toString();
      const fin = financialMap.get(custId);
      const totalOrders = totalOrderMap.get(custId) || 0;
      const realizedOrders = fin ? fin.realizedOrders : 0;
      const totalSpent = fin ? fin.totalSpent : 0;
      const avgOrderVal = fin ? fin.averageOrderValue : 0;
      const lastOrder = fin?.lastOrderDate
        ? new Date(fin.lastOrderDate).toISOString().slice(0, 10)
        : 'Never';

      return [
        c.fullName || '',
        c.email || '',
        c.phone || '',
        totalOrders,
        realizedOrders,
        totalSpent,
        avgOrderVal,
        c.isBlocked ? 'Blocked' : 'Active',
        c.createdAt ? new Date(c.createdAt).toISOString().slice(0, 10) : '',
        lastOrder
      ];
    });

    const csvData = formatCsv(headers, rows);
    const filename = sanitizeFilename(`customers_export_${new Date().toISOString().slice(0, 10)}.csv`);

    await AuditService.log({
      requestId: req.requestId,
      userId: req.user?.id || req.auth?.userId,
      eventName: 'CUSTOMER.EXPORTED',
      status: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: {
        totalExported: rows.length,
        filterStatus: status,
        hasSearch: Boolean(search)
      }
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', safeContentDisposition(filename));
    res.setHeader('X-Export-Row-Count', String(rows.length));
    return res.status(200).send(csvData);
  } catch (error) {
    return next(error);
  }
};

/**
 * @desc    Get single customer with sanitized details and realized financial metrics
 * @route   GET /api/customers/:id
 * @access  Private (support, manager, admin, super_admin)
 */
exports.getCustomer = async (req, res, next) => {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.id)) {
      throw new AppError('Invalid customer identifier', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const customer = await User.findOne({
      _id: req.params.id,
      role: 'customer',
      isDeleted: { $ne: true }
    }).select('_id fullName email phone avatar addresses isVerified isBlocked createdAt updatedAt');

    if (!customer) {
      throw new AppError('Customer not found', 404, ERROR_CODES.USER_NOT_FOUND);
    }

    const [financialMap, totalOrderMap, recentOrders] = await Promise.all([
      FinancialMetricsService.getCustomerFinancialSummary(customer._id),
      FinancialMetricsService.getCustomerTotalOrderCounts(customer._id),
      Order.find({ user: customer._id })
        .select('orderId totalAmount paymentMethod paymentStatus orderStatus items createdAt')
        .sort({ createdAt: -1, _id: -1 })
        .limit(10)
    ]);

    const custId = customer._id.toString();
    const fin = financialMap.get(custId);
    const totalOrders = totalOrderMap.get(custId) || 0;
    const realizedOrders = fin ? fin.realizedOrders : 0;
    const totalSpent = fin ? fin.totalSpent : 0;
    const averageOrderValue = fin ? fin.averageOrderValue : 0;
    const firstOrderDate = fin ? fin.firstOrderDate : null;
    const lastOrderDate = fin ? fin.lastOrderDate : null;

    const primaryAddress = Array.isArray(customer.addresses)
      ? (customer.addresses.find((a) => a.isDefault) || customer.addresses[0] || null)
      : null;

    return res.status(200).json({
      success: true,
      data: {
        id: custId,
        _id: custId,
        fullName: customer.fullName,
        email: customer.email,
        phone: customer.phone || '',
        avatar: customer.avatar || '',
        addresses: customer.addresses || [],
        primaryAddress,
        isVerified: Boolean(customer.isVerified),
        isBlocked: Boolean(customer.isBlocked),
        isActive: !customer.isBlocked,
        totalOrders,
        realizedOrders,
        totalSpent,
        averageOrderValue,
        firstOrderDate,
        lastOrderDate,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
        recentOrders
      }
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * @desc    Update customer profile (strict allowlist: fullName, phone)
 * @route   PATCH /api/customers/:id/profile
 * @access  Private (manager, admin, super_admin)
 */
exports.updateCustomerProfile = async (req, res, next) => {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.id)) {
      throw new AppError('Invalid customer identifier', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const customer = await User.findOne({
      _id: req.params.id,
      role: 'customer',
      isDeleted: { $ne: true }
    });

    if (!customer) {
      throw new AppError('Customer not found', 404, ERROR_CODES.USER_NOT_FOUND);
    }

    const payloadKeys = Object.keys(req.body);
    const ALLOWED_KEYS = new Set(['fullName', 'phone']);
    const unallowed = payloadKeys.filter((k) => !ALLOWED_KEYS.has(k));

    if (unallowed.length > 0) {
      throw new AppError(
        `Unallowed fields in profile update: ${unallowed.join(', ')}`,
        400,
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    const { fullName, phone } = req.body;
    if (fullName !== undefined) {
      if (typeof fullName !== 'string' || fullName.trim().length < 3 || fullName.trim().length > 100) {
        throw new AppError('Full name must be between 3 and 100 characters', 400, ERROR_CODES.VALIDATION_ERROR);
      }
      customer.fullName = fullName.trim();
    }

    if (phone !== undefined) {
      if (phone !== null && typeof phone !== 'string') {
        throw new AppError('Phone must be a string', 400, ERROR_CODES.VALIDATION_ERROR);
      }
      customer.phone = phone ? phone.trim().slice(0, 20) : '';
    }

    await customer.save();

    await AuditService.log({
      requestId: req.requestId,
      userId: req.user?.id || req.auth?.userId,
      eventName: 'CUSTOMER.PROFILE_UPDATED',
      status: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: {
        targetCustomerId: String(customer._id),
        modifiedFields: payloadKeys
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Customer profile updated successfully',
      data: {
        id: String(customer._id),
        _id: String(customer._id),
        fullName: customer.fullName,
        phone: customer.phone
      }
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * @desc    Toggle or set customer blocked status and revoke active sessions immediately on block
 * @route   PUT /api/customers/:id/block
 * @access  Private (admin, super_admin)
 */
exports.toggleBlockCustomer = async (req, res, next) => {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.id)) {
      throw new AppError('Invalid customer identifier', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const customer = await User.findOne({
      _id: req.params.id,
      role: 'customer',
      isDeleted: { $ne: true }
    });

    if (!customer) {
      throw new AppError('Customer not found', 404, ERROR_CODES.USER_NOT_FOUND);
    }

    const targetBlockedState = typeof req.body.isBlocked === 'boolean'
      ? req.body.isBlocked
      : !customer.isBlocked;

    let boundedReason = '';
    if (targetBlockedState) {
      if (!req.body.reason || typeof req.body.reason !== 'string' || req.body.reason.trim().length < 3) {
        throw new AppError('An explicit reason (at least 3 characters) is required when blocking a customer', 400, ERROR_CODES.VALIDATION_ERROR);
      }
      boundedReason = req.body.reason.trim().slice(0, 500);
      // Invalidate active tokens & revoke sessions immediately
      customer.tokenVersion = (customer.tokenVersion || 0) + 1;
      await SessionService.revokeAllSessions(customer._id, 'ACCOUNT_BLOCKED');
    } else {
      boundedReason = req.body.reason ? String(req.body.reason).trim().slice(0, 500) : 'Unblocked by admin';
    }

    customer.isBlocked = targetBlockedState;
    await customer.save();

    const action = customer.isBlocked ? 'CUSTOMER.BLOCKED' : 'CUSTOMER.UNBLOCKED';
    await AuditService.log({
      requestId: req.requestId,
      userId: req.user?.id || req.auth?.userId,
      eventName: action,
      status: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: {
        targetCustomerId: String(customer._id),
        isBlocked: customer.isBlocked,
        reason: boundedReason
      }
    });

    return res.status(200).json({
      success: true,
      message: customer.isBlocked ? 'Customer blocked successfully' : 'Customer unblocked successfully',
      data: {
        id: String(customer._id),
        _id: String(customer._id),
        fullName: customer.fullName,
        email: customer.email,
        isBlocked: customer.isBlocked,
        isActive: !customer.isBlocked
      }
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * @desc    Get customer statistics (reusing authoritative FinancialMetricsService)
 * @route   GET /api/customers/stats
 * @access  Private (support, manager, admin, super_admin)
 */
exports.getCustomerStats = async (req, res, next) => {
  try {
    const todayInterval = FinancialMetricsService.getTodayInterval();

    const [
      totalCustomers,
      activeCustomers,
      blockedCustomers,
      newCustomers,
      globalRevenue
    ] = await Promise.all([
      User.countDocuments({ role: 'customer', isDeleted: { $ne: true } }),
      User.countDocuments({ role: 'customer', isBlocked: { $ne: true }, isDeleted: { $ne: true } }),
      User.countDocuments({ role: 'customer', isBlocked: true, isDeleted: { $ne: true } }),
      User.countDocuments({ role: 'customer', isDeleted: { $ne: true }, createdAt: { $gte: todayInterval.start, $lt: todayInterval.end } }),
      FinancialMetricsService.aggregateRealizedRevenue(null)
    ]);

    return res.status(200).json({
      success: true,
      data: {
        totalCustomers,
        activeCustomers,
        blockedCustomers,
        newCustomers,
        totalRevenue: globalRevenue.realizedRevenue,
        averageOrderValue: totalCustomers > 0
          ? FinancialMetricsService.roundMoney(globalRevenue.realizedRevenue / totalCustomers)
          : 0
      }
    });
  } catch (error) {
    return next(error);
  }
};