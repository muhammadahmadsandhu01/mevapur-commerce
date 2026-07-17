const User = require('../models/User');
const Order = require('../models/Order');
const { logActivity } = require('../middleware/activityLogger');  

// @desc    Get all customers with order stats (Optimized)
// @route   GET /api/customers
// @access  Private/Admin
exports.getCustomers = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 15, 
      search = '',
      status = ''
    } = req.query;

    let query = { role: 'customer' };

    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    if (status === 'active') {
      query.isBlocked = { $ne: true };
    } else if (status === 'blocked') {
      query.isBlocked = true;
    }

    const skip = (page - 1) * limit;
    const total = await User.countDocuments(query);
    const pages = Math.ceil(total / limit) || 1;

    // 1. Get customers first
    const customers = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    const customerIds = customers.map(c => c._id);

    // 2. 🌟 OPTIMIZED: Get all order stats in a SINGLE aggregation query instead of looping
    const orderStats = await Order.aggregate([
      { $match: { user: { $in: customerIds }, orderStatus: { $ne: 'Cancelled' } } },
      { 
        $group: { 
          _id: '$user', 
          orderCount: { $sum: 1 }, 
          totalSpent: { $sum: '$totalAmount' } 
        } 
      }
    ]);

    // 3. Map stats back to customers
    const statsMap = new Map(orderStats.map(stat => [stat._id.toString(), stat]));

    const customersWithStats = customers.map(customer => {
      const custId = customer._id.toString();
      const stats = statsMap.get(custId) || { orderCount: 0, totalSpent: 0 };
      
      return {
        ...customer.toObject(),
        orderCount: stats.orderCount,
        totalSpent: stats.totalSpent,
        averageOrderValue: stats.orderCount > 0 ? (stats.totalSpent / stats.orderCount) : 0
      };
    });

    res.json({
      success: true,
      data: customersWithStats,
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
    console.error('Get customers error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get single customer with full order history
// @route   GET /api/customers/:id
// @access  Private/Admin
exports.getCustomer = async (req, res) => {
  try {
    const customer = await User.findById(req.params.id).select('-password');

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Fetch recent orders
    const orders = await Order.find({ user: customer._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('items.product', 'name images');

    // Fetch total spent
    const totalSpentAgg = await Order.aggregate([
      { $match: { user: customer._id, orderStatus: { $ne: 'Cancelled' } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);

    // Fetch first and last order dates
    const orderDates = await Order.find({ user: customer._id })
      .sort({ createdAt: 1 })
      .select('createdAt')
      .limit(1);
    
    const lastOrder = await Order.findOne({ user: customer._id }).sort({ createdAt: -1 }).select('createdAt');

    res.json({
      success: true,
      data: {
        ...customer.toObject(),
        totalSpent: totalSpentAgg[0]?.total || 0,
        firstOrderDate: orderDates[0]?.createdAt || null,
        lastOrderDate: lastOrder?.createdAt || null,
        orders
      }
    });
  } catch (error) {
    console.error('Get customer error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Toggle customer block status
// @route   PUT /api/customers/:id/block
// @access  Private/Admin
exports.toggleBlockCustomer = async (req, res) => {
  try {
    const customer = await User.findById(req.params.id);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    customer.isBlocked = !customer.isBlocked;
    await customer.save();

    const action = customer.isBlocked ? 'CUSTOMER_BLOCK' : 'CUSTOMER_UNBLOCK';
    const description = customer.isBlocked 
      ? `Blocked customer: ${customer.fullName}` 
      : `Unblocked customer: ${customer.fullName}`;
    
    await logActivity(req, action, description, { 
      customerId: customer._id,
      customerName: customer.fullName,
      customerEmail: customer.email,
      isBlocked: customer.isBlocked
    });

    res.json({
      success: true,
      message: customer.isBlocked ? 'Customer blocked successfully' : 'Customer unblocked successfully',
      data: {
        id: customer._id,
        fullName: customer.fullName,
        email: customer.email,
        isBlocked: customer.isBlocked
      }
    });
  } catch (error) {
    console.error('Toggle block error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get customer statistics
// @route   GET /api/customers/stats
// @access  Private/Admin
exports.getCustomerStats = async (req, res) => {
  try {
    const totalCustomers = await User.countDocuments({ role: 'customer' });
    const activeCustomers = await User.countDocuments({ role: 'customer', isBlocked: { $ne: true } });
    const blockedCustomers = await User.countDocuments({ role: 'customer', isBlocked: true });
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const newCustomers = await User.countDocuments({
      role: 'customer',
      createdAt: { $gte: today }
    });

    // Total revenue from customers
    const totalRevenue = await Order.aggregate([
      { $match: { orderStatus: { $ne: 'Cancelled' } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);

    res.json({
      success: true,
      data: {
        totalCustomers,
        activeCustomers,
        blockedCustomers,
        newCustomers,
        totalRevenue: totalRevenue[0]?.total || 0
      }
    });
  } catch (error) {
    console.error('Customer stats error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};