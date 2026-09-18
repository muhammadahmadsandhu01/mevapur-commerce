/**
 * @file checkoutSessionController.js
 * @description Controller for Phase 6D-5A two-phase checkout sessions.
 */

'use strict';

const CheckoutSessionService = require('../services/order/CheckoutSessionService');
const CheckoutSession = require('../models/CheckoutSession');
const { AppError } = require('../common/errors/AppError');
const ERROR_CODES = require('../constants/errorCodes');

exports.createSession = async (req, res, next) => {
  try {
    const idempotencyKey = req.headers['idempotency-key'];
    if (!idempotencyKey) {
      throw new AppError('The Idempotency-Key header is required', 400, 'IDEMPOTENCY_KEY_REQUIRED');
    }

    const userId = req.user?._id;
    const result = await CheckoutSessionService.createSession({
      userId,
      sessionData: req.body,
      idempotencyKey
    });

    const statusCode = result.isReplay ? 200 : 201;
    res.status(statusCode).json({
      success: true,
      data: result.session,
      isReplay: result.isReplay
    });
  } catch (error) {
    next(error);
  }
};

exports.getSession = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?._id;
    const isAdmin = req.user?.role === 'admin' || req.user?.role === 'super_admin';

    const session = await CheckoutSessionService.getSanitizedSession(sessionId, userId, isAdmin);
    res.status(200).json({
      success: true,
      data: session
    });
  } catch (error) {
    next(error);
  }
};

exports.cancelSession = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?._id;
    const reason = req.body?.reason || 'CUSTOMER_CANCELLED';

    const result = await CheckoutSessionService.cancelSession({
      sessionId,
      userId,
      reason
    });

    res.status(200).json({
      success: true,
      data: {
        sessionId: result.session.sessionId,
        status: result.session.status
      },
      isReplay: result.isReplay
    });
  } catch (error) {
    next(error);
  }
};

exports.listConflicts = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const conflicts = await CheckoutSession.find({ status: 'conflict' })
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await CheckoutSession.countDocuments({ status: 'conflict' });

    res.status(200).json({
      success: true,
      data: conflicts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
};
