const User = require('../models/User');
const Order = require('../models/Order');
const { logActivity } = require('../middleware/activityLogger');  

// @desc    Get all customers
// @route   GET /api/customers
// @access  Private/Admin
exports.getCustomers = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
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
    const pages = Math.ceil(total / limit);

    const customers = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    // Add order stats for each customer
    const customersWithStats = await Promise.all(
      customers.map(async (customer) => {
        const orderCount = await Order.countDocuments({ user: customer._id });
        const totalSpent = await Order.aggregate([
          { $match: { user: customer._id, orderStatus: { $ne: 'Cancelled' } } },
          { $group: { _id: null, total: { $sum: '$totalAmount' } } }
        ]);

        return {
          ...customer.toObject(),
          orderCount,
          totalSpent: totalSpent[0]?.total || 0
        };
      })
    );

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

// @desc    Get single customer
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

    const orders = await Order.find({ user: customer._id })
      .sort({ createdAt: -1 })
      .limit(20);

    const totalSpent = await Order.aggregate([
      { $match: { user: customer._id, orderStatus: { $ne: 'Cancelled' } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);

    res.json({
      success: true,
      data: {
        ...customer.toObject(),
        totalSpent: totalSpent[0]?.total || 0,
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
      message: customer.isBlocked ? 'Customer blocked' : 'Customer unblocked',
      data: customer
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

    res.json({
      success: true,
      data: {
        totalCustomers,
        activeCustomers,
        blockedCustomers,
        newCustomers
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