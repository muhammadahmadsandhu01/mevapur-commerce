const Coupon = require('../models/Coupon');
const { logActivity } = require('../middleware/activityLogger');  

// @desc    Get all coupons with filtering
// @route   GET /api/coupons
// @access  Private/Admin
exports.getCoupons = async (req, res) => {
  try {
    const { search = '', status = 'all' } = req.query;
    let query = {};
    const now = new Date();

    if (search) {
      query.code = { $regex: search, $options: 'i' };
    }

    // 🌟 Enhanced status filtering to match frontend exactly
    if (status === 'active') {
      query.isActive = true;
      query.startDate = { $lte: now };
      query.endDate = { $gte: now };
    } else if (status === 'expired') {
      query.endDate = { $lt: now };
    } else if (status === 'upcoming') {
      query.startDate = { $gt: now };
    } else if (status === 'inactive') {
      query.isActive = false;
    }

    const coupons = await Coupon.find(query).sort({ createdAt: -1 });

    res.json({
      success: true,
      data: coupons
    });
  } catch (error) {
    console.error('Get coupons error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get single coupon
// @route   GET /api/coupons/:id
// @access  Private/Admin
exports.getCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }

    res.json({
      success: true,
      data: coupon
    });
  } catch (error) {
    console.error('Get coupon error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Create coupon
// @route   POST /api/coupons
// @access  Private/Admin
exports.createCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.create(req.body);

    await logActivity(req, 'COUPON_CREATE', 
      `Created coupon: ${coupon.code}`, 
      { 
        couponId: coupon._id, 
        code: coupon.code,
        type: coupon.type,
        value: coupon.value
      }
    );

    res.status(201).json({
      success: true,
      message: 'Coupon created successfully',
      data: coupon
    });
  } catch (error) {
    console.error('Create coupon error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Coupon code already exists' });
    }
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update coupon
// @route   PUT /api/coupons/:id
// @access  Private/Admin
exports.updateCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }

    await logActivity(req, 'COUPON_UPDATE', 
      `Updated coupon: ${coupon.code}`, 
      { couponId: coupon._id, code: coupon.code, changes: req.body }
    );

    res.json({
      success: true,
      message: 'Coupon updated successfully',
      data: coupon
    });
  } catch (error) {
    console.error('Update coupon error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Coupon code already exists' });
    }
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Delete coupon
// @route   DELETE /api/coupons/:id
// @access  Private/Admin
exports.deleteCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndDelete(req.params.id);

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }

    await logActivity(req, 'COUPON_DELETE', 
      `Deleted coupon: ${coupon.code}`, 
      { couponId: coupon._id, code: coupon.code }
    );

    res.json({
      success: true,
      message: 'Coupon deleted successfully'
    });
  } catch (error) {
    console.error('Delete coupon error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get coupon statistics
// @route   GET /api/coupons/stats
// @access  Private/Admin
exports.getCouponStats = async (req, res) => {
  try {
    const now = new Date();
    
    const totalCoupons = await Coupon.countDocuments();
    const activeCoupons = await Coupon.countDocuments({ 
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now }
    });
    const expiredCoupons = await Coupon.countDocuments({ endDate: { $lt: now } });
    const upcomingCoupons = await Coupon.countDocuments({ startDate: { $gt: now } });

    // 🌟 Accurate aggregation for total usage
    const usageStats = await Coupon.aggregate([
      { $group: { _id: null, totalUsed: { $sum: '$usedCount' } } }
    ]);

    res.json({
      success: true,
      data: {
        total: totalCoupons,
        active: activeCoupons,
        expired: expiredCoupons,
        upcoming: upcomingCoupons,
        totalUsage: usageStats[0]?.totalUsed || 0
      }
    });
  } catch (error) {
    console.error('Coupon stats error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};