const Coupon = require('../models/Coupon');
const CouponRedemption = require('../models/CouponRedemption');
const CouponService = require('../services/order/CouponService');
const AuditService = require('../services/AuditService');
const { logActivity } = require('../middleware/activityLogger');
const { AppError } = require('../common/errors/AppError');
const ERROR_CODES = require('../constants/errorCodes');

const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// @desc    Get all coupons with server-side pagination and derived status
// @route   GET /api/coupons
// @access  Private (support, manager, admin, super_admin)
exports.getCoupons = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 15,
      search = '',
      status = 'all'
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 15));
    const skip = (pageNum - 1) * limitNum;
    const now = new Date();

    let query = {};

    if (search && typeof search === 'string' && search.trim()) {
      const sanitized = escapeRegex(search.trim().slice(0, 100));
      query.$or = [
        { code: { $regex: sanitized, $options: 'i' } },
        { description: { $regex: sanitized, $options: 'i' } }
      ];
    }

    if (status === 'active') {
      query.status = 'active';
      query.startDate = { $lte: now };
      query.endDate = { $gte: now };
    } else if (status === 'expired') {
      query.$or = [
        { status: 'active', endDate: { $lt: now } },
        { status: 'expired' }
      ];
    } else if (status === 'upcoming') {
      query.status = 'active';
      query.startDate = { $gt: now };
    } else if (status === 'disabled') {
      query.status = 'disabled';
    } else if (status === 'archived') {
      query.status = 'archived';
    } else if (status === 'draft') {
      query.status = 'draft';
    }

    const total = await Coupon.countDocuments(query);
    const pages = Math.ceil(total / limitNum) || 1;

    const coupons = await Coupon.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limitNum);

    const formattedCoupons = coupons.map((c) => {
      const doc = c.toObject();
      doc.effectiveStatus = CouponService.getEffectiveStatus(c, now);
      return doc;
    });

    res.json({
      success: true,
      data: formattedCoupons,
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
    console.error('Get coupons error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get single coupon
// @route   GET /api/coupons/:id
// @access  Private (support, manager, admin, super_admin)
exports.getCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }

    const doc = coupon.toObject();
    doc.effectiveStatus = CouponService.getEffectiveStatus(coupon);

    res.json({ success: true, data: doc });
  } catch (error) {
    console.error('Get coupon error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create coupon
// @route   POST /api/coupons
// @access  Private (manager, admin, super_admin)
exports.createCoupon = async (req, res) => {
  try {
    const {
      code,
      type,
      value,
      minOrderAmount = 0,
      maxDiscount = 0,
      usageLimit = 0,
      perCustomerLimit = 0,
      startDate,
      endDate,
      status = 'active',
      applicableProducts = [],
      applicableCategories = [],
      description = ''
    } = req.body;

    if (!code || !type || value === undefined || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Code, type, value, startDate, and endDate are required'
      });
    }

    if (type === 'freeshipping') {
      return res.status(400).json({
        success: false,
        message: 'Free shipping coupon creation is currently unavailable until carrier discount snapshotting is fully enabled'
      });
    }

    if (!['percentage', 'fixed'].includes(type)) {
      return res.status(400).json({ success: false, message: 'Invalid coupon type' });
    }

    const normalizedCode = String(code).trim().toUpperCase();
    const existing = await Coupon.findOne({ code: normalizedCode });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Coupon code already exists' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
      return res.status(400).json({ success: false, message: 'Invalid start or end date' });
    }

    const coupon = await Coupon.create({
      code: normalizedCode,
      type,
      value: Number(value),
      minOrderAmount: Number(minOrderAmount) || 0,
      maxDiscount: Number(maxDiscount) || 0,
      usageLimit: Number(usageLimit) || 0,
      usedCount: 0,
      perCustomerLimit: Number(perCustomerLimit) || 0,
      status: status || 'active',
      startDate: start,
      endDate: end,
      applicableProducts,
      applicableCategories,
      description: String(description).slice(0, 500).trim()
    });

    await AuditService.log({
      eventName: 'COUPON.CREATED',
      userId: req.user.id,
      status: 'SUCCESS',
      metadata: { couponId: String(coupon._id), code: coupon.code, type: coupon.type, value: coupon.value }
    });

    await logActivity(req, 'COUPON_CREATE', `Created coupon: ${coupon.code}`, {
      couponId: coupon._id,
      code: coupon.code,
      type: coupon.type,
      value: coupon.value
    });

    res.status(201).json({
      success: true,
      message: 'Coupon created successfully',
      data: coupon
    });
  } catch (error) {
    console.error('Create coupon error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update coupon (with optimistic concurrency check)
// @route   PUT /api/coupons/:id
// @access  Private (manager, admin, super_admin)
exports.updateCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }

    // Optimistic concurrency check if __v provided
    if (req.body.__v !== undefined && coupon.__v !== req.body.__v) {
      return res.status(409).json({
        success: false,
        code: 'VERSION_CONFLICT',
        message: 'Coupon was modified by another administrator. Please reload and try again.'
      });
    }

    const {
      type,
      value,
      minOrderAmount,
      maxDiscount,
      usageLimit,
      perCustomerLimit,
      status,
      startDate,
      endDate,
      applicableProducts,
      applicableCategories,
      description
    } = req.body;

    if (type && type === 'freeshipping') {
      return res.status(400).json({
        success: false,
        message: 'Free shipping coupon type is currently unsupported'
      });
    }

    // If coupon is already in use, block changing code or type to preserve audit consistency
    if (coupon.usedCount > 0 && req.body.code && req.body.code.trim().toUpperCase() !== coupon.code) {
      return res.status(400).json({
        success: false,
        message: 'Cannot change coupon code after it has already been used in orders'
      });
    }

    if (type !== undefined) coupon.type = type;
    if (value !== undefined) coupon.value = Number(value);
    if (minOrderAmount !== undefined) coupon.minOrderAmount = Number(minOrderAmount);
    if (maxDiscount !== undefined) coupon.maxDiscount = Number(maxDiscount);
    if (usageLimit !== undefined) coupon.usageLimit = Number(usageLimit);
    if (perCustomerLimit !== undefined) coupon.perCustomerLimit = Number(perCustomerLimit);
    if (status !== undefined) coupon.status = status;
    if (startDate) coupon.startDate = new Date(startDate);
    if (endDate) coupon.endDate = new Date(endDate);
    if (applicableProducts !== undefined) coupon.applicableProducts = applicableProducts;
    if (applicableCategories !== undefined) coupon.applicableCategories = applicableCategories;
    if (description !== undefined) coupon.description = String(description).slice(0, 500).trim();

    await coupon.save();

    await AuditService.log({
      eventName: 'COUPON.UPDATED',
      userId: req.user.id,
      status: 'SUCCESS',
      metadata: { couponId: String(coupon._id), code: coupon.code }
    });

    await logActivity(req, 'COUPON_UPDATE', `Updated coupon: ${coupon.code}`, {
      couponId: coupon._id,
      code: coupon.code
    });

    res.json({
      success: true,
      message: 'Coupon updated successfully',
      data: coupon
    });
  } catch (error) {
    console.error('Update coupon error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Disable coupon
// @route   PATCH /api/coupons/:id/disable
// @access  Private (manager, admin, super_admin)
exports.disableCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });

    coupon.status = 'disabled';
    await coupon.save();

    await AuditService.log({
      eventName: 'COUPON.DISABLED',
      userId: req.user.id,
      status: 'SUCCESS',
      metadata: { couponId: String(coupon._id), code: coupon.code }
    });

    res.json({ success: true, message: 'Coupon disabled successfully', data: coupon });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Archive coupon
// @route   PATCH /api/coupons/:id/archive
// @access  Private (manager, admin, super_admin)
exports.archiveCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });

    coupon.status = 'archived';
    await coupon.save();

    await AuditService.log({
      eventName: 'COUPON.ARCHIVED',
      userId: req.user.id,
      status: 'SUCCESS',
      metadata: { couponId: String(coupon._id), code: coupon.code }
    });

    res.json({ success: true, message: 'Coupon archived successfully', data: coupon });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete unused draft coupon (SuperAdmin only)
// @route   DELETE /api/coupons/:id/draft
// @access  Private (super_admin)
exports.deleteDraftCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }

    if (coupon.usedCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete a coupon that has already been used in orders. Please archive or disable it.'
      });
    }

    const hasRedemptions = await CouponRedemption.exists({ coupon: coupon._id });
    if (hasRedemptions) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete a coupon with existing redemption history. Please archive instead.'
      });
    }

    await Coupon.findByIdAndDelete(req.params.id);

    await AuditService.log({
      eventName: 'COUPON.DRAFT_DELETED',
      userId: req.user.id,
      status: 'SUCCESS',
      metadata: { couponId: String(coupon._id), code: coupon.code }
    });

    res.json({ success: true, message: 'Unused draft coupon deleted successfully' });
  } catch (error) {
    console.error('Delete coupon error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Validate coupon code (Public non-binding preview during checkout)
// @route   POST /api/coupons/validate
// @access  Public
exports.validateCoupon = async (req, res) => {
  try {
    const { code, items, subtotal } = req.body;
    const userId = req.user?.id || null; // From verified auth token only; never body

    const previewResult = await CouponService.preview({
      code,
      items,
      subtotal,
      userId
    });

    res.json({
      success: true,
      message: 'Coupon is valid',
      data: previewResult
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      message: error.message,
      code: error.code || ERROR_CODES.ORDER_COUPON_INVALID
    });
  }
};

// @desc    Get coupon statistics (global)
// @route   GET /api/coupons/stats
// @access  Private (support, manager, admin, super_admin)
exports.getCouponStats = async (req, res) => {
  try {
    const now = new Date();
    const totalCoupons = await Coupon.countDocuments();
    const activeCoupons = await Coupon.countDocuments({
      status: 'active',
      startDate: { $lte: now },
      endDate: { $gte: now }
    });
    const upcomingCoupons = await Coupon.countDocuments({
      status: 'active',
      startDate: { $gt: now }
    });
    const expiredCoupons = await Coupon.countDocuments({
      $or: [
        { status: 'active', endDate: { $lt: now } },
        { status: 'expired' }
      ]
    });
    const disabledCoupons = await Coupon.countDocuments({ status: 'disabled' });
    const archivedCoupons = await Coupon.countDocuments({ status: 'archived' });

    const usageStats = await Coupon.aggregate([
      { $group: { _id: null, totalUsed: { $sum: '$usedCount' } } }
    ]);

    res.json({
      success: true,
      data: {
        total: totalCoupons,
        active: activeCoupons,
        upcoming: upcomingCoupons,
        expired: expiredCoupons,
        disabled: disabledCoupons,
        archived: archivedCoupons,
        totalUsage: usageStats[0]?.totalUsed || 0
      }
    });
  } catch (error) {
    console.error('Coupon stats error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};