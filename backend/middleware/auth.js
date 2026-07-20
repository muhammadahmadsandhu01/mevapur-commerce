const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { logger } = require('./logger');

/*
|--------------------------------------------------------------------------
| Authenticate User
|--------------------------------------------------------------------------
*/

exports.protect = async (req, res, next) => {
    try {

        let token;

        if (
            req.headers.authorization &&
            req.headers.authorization.startsWith('Bearer ')
        ) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Authentication token is required.'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await User.findById(decoded.id)
            .select('-password')
            .lean();

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not found.'
            });
        }

        if (user.isDeleted) {
            return res.status(403).json({
                success: false,
                message: 'This account has been deleted.'
            });
        }

        if (user.isBlocked) {
            return res.status(403).json({
                success: false,
                message: 'Your account has been blocked.'
            });
        }

        req.user = user;

        next();

    } catch (error) {

        logger.error(`Authentication Error: ${error.message}`);

        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Session expired. Please login again.'
            });
        }

        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid authentication token.'
            });
        }

        return res.status(500).json({
            success: false,
            message: 'Authentication failed.'
        });

    }
};

/*
|--------------------------------------------------------------------------
| Admin Only
|--------------------------------------------------------------------------
*/

exports.admin = (req, res, next) => {

    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required.'
        });
    }

    const allowedRoles = ['admin', 'super_admin'];

    if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({
            success: false,
            message: 'Admin access required.'
        });
    }

    next();

};

/*
|--------------------------------------------------------------------------
| Super Admin Only
|--------------------------------------------------------------------------
*/

exports.superAdmin = (req, res, next) => {

    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required.'
        });
    }

    if (req.user.role !== 'super_admin') {
        return res.status(403).json({
            success: false,
            message: 'Super Admin access required.'
        });
    }

    next();

};

/*
|--------------------------------------------------------------------------
| Dynamic Role Authorization
|--------------------------------------------------------------------------
*/

exports.checkRoles = (...roles) => {

    return (req, res, next) => {

        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required.'
            });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `Access denied. Allowed roles: ${roles.join(', ')}`
            });
        }

        next();

    };

};