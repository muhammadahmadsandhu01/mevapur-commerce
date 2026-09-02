const User = require('../models/User');
const StaffInvitation = require('../models/StaffInvitation');
const AuthService = require('../services/AuthService');
const PolicyService = require('../services/PolicyService');
const SessionService = require('../services/SessionService');
const { logActivity } = require('../middleware/activityLogger');
const { AppError } = require('../common/errors/AppError');
const ERROR_CODES = require('../constants/errorCodes');
const { CANONICAL_ROLES, STAFF_ROLES } = require('../constants/roleConstants');

// @desc    Get all staff users (exclude customers)
// @route   GET /api/users/staff
// @access  Private/Admin
exports.getStaffUsers = async (req, res, next) => {
  try {
    const { search = '', role = '' } = req.query;

    let query = { role: { $in: STAFF_ROLES }, isDeleted: false };

    if (search) {
      const sanitizedSearch = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { fullName: { $regex: sanitizedSearch, $options: 'i' } },
        { email: { $regex: sanitizedSearch, $options: 'i' } }
      ];
    }

    if (role && STAFF_ROLES.includes(role)) {
      query.role = role;
    }

    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: users
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all customers (For Admin Customers Page)
// @route   GET /api/users/customers
// @access  Private/Admin
exports.getCustomers = async (req, res, next) => {
  try {
    const { search = '', page = 1, limit = 15 } = req.query;
    
    let query = { role: CANONICAL_ROLES.CUSTOMER, isDeleted: false };

    if (search) {
      const sanitizedSearch = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { fullName: { $regex: sanitizedSearch, $options: 'i' } },
        { email: { $regex: sanitizedSearch, $options: 'i' } },
        { phone: { $regex: sanitizedSearch, $options: 'i' } }
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 15));
    const skip = (pageNum - 1) * limitNum;

    const [customers, total] = await Promise.all([
      User.find(query)
        .select('-password')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      User.countDocuments(query)
    ]);

    const pages = Math.ceil(total / limitNum) || 1;

    res.json({
      success: true,
      data: customers,
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
    next(error);
  }
};

// @desc    Invite staff user
// @route   POST /api/users/invite
// @access  Private/SuperAdmin
exports.inviteStaffUser = async (req, res, next) => {
  try {
    const { email, role } = req.body;
    const result = await AuthService.inviteStaff({
      email,
      role,
      invitedBy: req.user._id,
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    await logActivity(req, 'STAFF_INVITE',
      `Invited staff user ${email} with role ${role}`,
      { email, role, invitationId: result.invitationId }
    );

    res.status(201).json({
      success: true,
      message: 'Staff invitation sent successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

// @desc    List staff invitations
// @route   GET /api/users/invitations
// @access  Private/SuperAdmin
exports.listInvitations = async (req, res, next) => {
  try {
    const { status, page, limit } = req.query;
    const result = await AuthService.listInvitations({ status, page, limit });
    res.json({
      success: true,
      data: result.invitations,
      pagination: result.pagination
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Resend staff invitation
// @route   POST /api/users/invitations/:id/resend
// @access  Private/SuperAdmin
exports.resendInvitation = async (req, res, next) => {
  try {
    const result = await AuthService.resendInvitation({
      invitationId: req.params.id,
      invitedBy: req.user._id,
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Staff invitation resent successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Revoke staff invitation
// @route   DELETE /api/users/invitations/:id
// @access  Private/SuperAdmin
exports.revokeInvitation = async (req, res, next) => {
  try {
    const result = await AuthService.revokeInvitation({
      invitationId: req.params.id,
      revokedBy: req.user._id,
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Staff invitation revoked successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create staff user (direct provisioning for scripts/superadmins)
// @route   POST /api/users/staff
// @access  Private/SuperAdmin
exports.createStaffUser = async (req, res, next) => {
  try {
    const { fullName, email, phone, role, password } = req.body;
    const normalizedEmail = (email || '').toLowerCase().trim();

    if (!STAFF_ROLES.includes(role)) {
      throw new AppError(`Invalid staff role: ${role}`, 400, ERROR_CODES.AUTH_ROLE_NOT_FOUND);
    }

    const existingUser = await User.findOne({ email: normalizedEmail, isDeleted: false });
    if (existingUser) {
      throw new AppError('User already exists with this email', 400, ERROR_CODES.AUTH_EMAIL_EXISTS);
    }

    const user = await User.create({
      fullName: (fullName || '').trim(),
      email: normalizedEmail,
      phone: (phone || '').trim(),
      role,
      password,
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
    if (error.code === 11000) {
      return next(new AppError('Email already in use', 400, ERROR_CODES.AUTH_EMAIL_EXISTS));
    }
    next(error);
  }
};

// @desc    Update staff user role/status
// @route   PUT /api/users/staff/:id
// @access  Private/SuperAdmin
exports.updateStaffUser = async (req, res, next) => {
  try {
    const { role, isBlocked, fullName, phone } = req.body;
    const userId = req.params.id;

    if (String(userId) === String(req.user._id || req.user.id)) {
      throw new AppError('You cannot modify your own administrative role or status', 400, ERROR_CODES.AUTH_FORBIDDEN);
    }

    const user = await User.findById(userId);
    if (!user || user.isDeleted) {
      throw new AppError('User not found', 404, ERROR_CODES.USER_NOT_FOUND);
    }

    // Protect against demoting or blocking the last active SuperAdmin
    if (user.role === CANONICAL_ROLES.SUPER_ADMIN && (role !== CANONICAL_ROLES.SUPER_ADMIN || isBlocked === true)) {
      const activeSuperAdminCount = await User.countDocuments({
        role: CANONICAL_ROLES.SUPER_ADMIN,
        isBlocked: false,
        isDeleted: false
      });

      if (activeSuperAdminCount <= 1) {
        throw new AppError(
          'Cannot demote or block the only active Super Admin account',
          400,
          ERROR_CODES.AUTH_SUPERADMIN_DEMOTION_FORBIDDEN
        );
      }
    }

    let roleOrStatusChanged = false;
    if (fullName) user.fullName = fullName.trim();
    if (phone !== undefined) user.phone = phone.trim();
    if (role && STAFF_ROLES.includes(role) && user.role !== role) {
      user.role = role;
      roleOrStatusChanged = true;
    }
    if (isBlocked !== undefined && user.isBlocked !== isBlocked) {
      user.isBlocked = Boolean(isBlocked);
      roleOrStatusChanged = true;
    }

    if (roleOrStatusChanged) {
      user.tokenVersion = Number(user.tokenVersion || 0) + 1;
      await SessionService.revokeAllSessions(user._id, 'ROLE_OR_STATUS_MODIFIED');
    }

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
        isBlocked: user.isBlocked,
        mfaEnabled: user.mfaEnabled
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete staff user
// @route   DELETE /api/users/staff/:id
// @access  Private/SuperAdmin
exports.deleteStaffUser = async (req, res, next) => {
  try {
    const userId = req.params.id;

    if (String(userId) === String(req.user._id || req.user.id)) {
      throw new AppError('You cannot delete your own account', 400, ERROR_CODES.AUTH_FORBIDDEN);
    }

    const user = await User.findById(userId);
    if (!user || user.isDeleted) {
      throw new AppError('User not found', 404, ERROR_CODES.USER_NOT_FOUND);
    }

    if (user.role === CANONICAL_ROLES.SUPER_ADMIN) {
      const activeSuperAdminCount = await User.countDocuments({
        role: CANONICAL_ROLES.SUPER_ADMIN,
        isBlocked: false,
        isDeleted: false
      });

      if (activeSuperAdminCount <= 1) {
        throw new AppError(
          'Cannot delete the only active Super Admin account',
          400,
          ERROR_CODES.AUTH_SUPERADMIN_DEMOTION_FORBIDDEN
        );
      }
    }

    user.isDeleted = true;
    user.tokenVersion = Number(user.tokenVersion || 0) + 1;
    await user.save();
    await SessionService.revokeAllSessions(user._id, 'USER_DELETED');

    await logActivity(req, 'USER_DELETE', 
      `Deleted staff user: ${user.fullName}`, 
      { userId: user._id }
    );

    res.json({
      success: true,
      message: 'Staff user deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get Roles & Permissions Matrix
// @route   GET /api/users/roles-matrix
// @access  Private/Staff
exports.getRolesMatrix = (req, res) => {
  const matrix = PolicyService.getAllRolePermissions();
  res.json({
    success: true,
    data: matrix
  });
};