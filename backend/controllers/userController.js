const User = require('../models/User');
const { logActivity } = require('../middleware/activityLogger');

// @desc    Get all staff users (exclude customers)
// @route   GET /api/users/staff
// @access  Private/Admin
exports.getStaffUsers = async (req, res) => {
  try {
    const { search = '', role = '' } = req.query;

    let query = { role: { $ne: 'customer' } };

    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    if (role) {
      query.role = role;
    }

    const users = await User.find(query).select('-password').sort({ createdAt: -1 });

    res.json({
      success: true,
      data: users
    });
  } catch (error) {
    console.error('Get staff users error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get all customers (For Admin Customers Page)
// @route   GET /api/users/customers
// @access  Private/Admin
exports.getCustomers = async (req, res) => {
  try {
    const { search = '', page = 1, limit = 15 } = req.query;
    
    let query = { role: 'customer' };

    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;
    const total = await User.countDocuments(query);
    const pages = Math.ceil(total / limit) || 1;

    const customers = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    res.json({
      success: true,
      data: customers,
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

// @desc    Create staff user
// @route   POST /api/users/staff
// @access  Private/SuperAdmin
exports.createStaffUser = async (req, res) => {
  try {
    const { fullName, email, phone, role, password } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    // 🌟 FIX: Pass plain text password. The pre('save') hook in User.js 
    // will automatically hash it. Manual hashing here causes double-hashing!
    const user = await User.create({
      fullName,
      email,
      phone,
      role,
      password, // Plain text password
      isVerified: true,
      isBlocked: false
    });

    await logActivity(req, 'USER_CREATE', 
      `Created staff user: ${user.fullName} with role ${user.role}`, 
      { userId: user._id, role: user.role }
    );

    res.status(201).json({
      success: true,
      message: 'Staff user created successfully',
      data: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Create staff user error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Email already in use' });
    }
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update staff user role/status
// @route   PUT /api/users/staff/:id
// @access  Private/SuperAdmin
exports.updateStaffUser = async (req, res) => {
  try {
    const { role, isBlocked, fullName, phone } = req.body;
    const userId = req.params.id;

    // Prevent self-modification
    if (userId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot modify your own account'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (fullName) user.fullName = fullName;
    if (phone) user.phone = phone;
    if (role) user.role = role;
    if (isBlocked !== undefined) user.isBlocked = isBlocked;

    await user.save();

    await logActivity(req, 'USER_UPDATE', 
      `Updated staff user: ${user.fullName}`, 
      { userId: user._id, changes: req.body }
    );

    res.json({
      success: true,
      message: 'Staff user updated successfully',
      data: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isBlocked: user.isBlocked
      }
    });
  } catch (error) {
    console.error('Update staff user error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Delete staff user
// @route   DELETE /api/users/staff/:id
// @access  Private/SuperAdmin
exports.deleteStaffUser = async (req, res) => {
  try {
    const userId = req.params.id;

    if (userId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete your own account'
      });
    }

    const user = await User.findByIdAndDelete(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    await logActivity(req, 'USER_DELETE', 
      `Deleted staff user: ${user.fullName}`, 
      { userId: user._id }
    );

    res.json({
      success: true,
      message: 'Staff user deleted successfully'
    });
  } catch (error) {
    console.error('Delete staff user error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};