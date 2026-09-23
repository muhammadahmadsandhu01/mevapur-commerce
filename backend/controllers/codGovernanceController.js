/**
 * @file codGovernanceController.js
 * @description Administrative and Guest Authentication Controller for Pakistan COD Policies.
 * Manages domestic serviceability rules, customer manual blocks, temporary locks,
 * administrative overrides, delivery outcome recording, and guest phone verification.
 */

'use strict';

const mongoose = require('mongoose');
const CodServiceabilityRule = require('../models/CodServiceabilityRule');
const CustomerCodRestriction = require('../models/CustomerCodRestriction');
const defaultCodPolicyService = require('../services/payment/CodEligibilityPolicyService');
const defaultGuestVerificationService = require('../services/auth/GuestPhoneVerificationService');
const defaultOrderDeliveryOutcomeService = require('../services/order/OrderDeliveryOutcomeService');
const ProductMarketOffering = require('../models/ProductMarketOffering');
const AuditLog = require('../models/AuditLog');
const crypto = require('crypto');
const { AppError } = require('../common/errors/AppError');
const logger = require('../utils/logger');

async function recordAuditLog({ req, eventName, details = {}, status = 'SUCCESS' }) {
  try {
    await AuditLog.create({
      eventId: crypto.randomUUID(),
      requestId: req?.headers?.['x-request-id'] || crypto.randomUUID(),
      userId: req?.user?._id || null,
      eventName,
      status,
      ipAddress: req?.ip || req?.connection?.remoteAddress || '127.0.0.1',
      userAgent: req?.headers?.['user-agent'] || 'backend-governance',
      metadata: details
    });
  } catch (err) {
    logger.warn('Failed to record COD governance audit log', { error: err.message });
  }
}

// --- Serviceability Rules Governance ---

exports.listServiceabilityRules = async (req, res, next) => {
  try {
    const {
      merchantScopeId = 'default',
      countryCode = 'PK',
      city,
      status,
      limit = 100,
      skip = 0
    } = req.query;

    const query = { merchantScopeId, countryCode: countryCode.toUpperCase() };
    if (city) {
      query.normalizedCity = city.trim().toUpperCase();
    }
    if (status) {
      query.status = status;
    }

    const [rules, total] = await Promise.all([
      CodServiceabilityRule.find(query)
        .sort({ normalizedCity: 1, normalizedPostalCode: 1, createdAt: -1 })
        .skip(Number(skip))
        .limit(Number(limit)),
      CodServiceabilityRule.countDocuments(query)
    ]);

    return res.status(200).json({
      success: true,
      data: { rules, total }
    });
  } catch (error) {
    return next(error);
  }
};

exports.upsertServiceabilityRule = async (req, res, next) => {
  try {
    const {
      merchantScopeId = 'default',
      countryCode = 'PK',
      city,
      postalCode = '',
      zoneKey = '',
      isServiceable = true,
      status = 'active',
      effectiveFrom = new Date(),
      effectiveTo = null,
      notes = ''
    } = req.body;

    if (!city || typeof city !== 'string' || !city.trim()) {
      throw new AppError('City is required for COD serviceability rule', 400, 'CITY_REQUIRED');
    }

    const normalizedCity = city.trim().toUpperCase();
    const normalizedPostalCode = postalCode ? String(postalCode).trim() : '';

    let rule = await CodServiceabilityRule.findOne({
      merchantScopeId,
      countryCode: countryCode.toUpperCase(),
      normalizedCity,
      normalizedPostalCode
    });

    if (rule) {
      rule.isServiceable = Boolean(isServiceable);
      rule.zoneKey = zoneKey ? String(zoneKey).trim().toUpperCase() : '';
      rule.status = status;
      rule.effectiveFrom = effectiveFrom ? new Date(effectiveFrom) : rule.effectiveFrom;
      rule.effectiveTo = effectiveTo ? new Date(effectiveTo) : null;
      rule.notes = notes;
      rule.lockVersion = (rule.lockVersion || 1) + 1;
      rule.updatedBy = req.user?._id || null;
      await rule.save();
    } else {
      rule = await CodServiceabilityRule.create({
        merchantScopeId,
        countryCode: countryCode.toUpperCase(),
        normalizedCity,
        normalizedPostalCode,
        zoneKey: zoneKey ? String(zoneKey).trim().toUpperCase() : '',
        isServiceable: Boolean(isServiceable),
        status,
        effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
        effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
        notes,
        createdBy: req.user?._id || null,
        updatedBy: req.user?._id || null
      });
    }

    logger.info('COD serviceability rule saved', {
      ruleId: String(rule._id),
      city: normalizedCity,
      postalCode: normalizedPostalCode,
      isServiceable: rule.isServiceable
    });

    return res.status(200).json({
      success: true,
      data: rule
    });
  } catch (error) {
    return next(error);
  }
};

// --- Customer COD Risk Governance ---

exports.getCustomerCodStatus = async (req, res, next) => {
  try {
    const customerId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      throw new AppError('Invalid customer ID format', 400, 'INVALID_CUSTOMER_ID');
    }

    const merchantScopeId = req.query.merchantScopeId || 'default';
    const atDate = req.query.atDate ? new Date(req.query.atDate) : new Date();

    const restriction = await CustomerCodRestriction.findOne({
      merchantScopeId,
      customerId
    });

    if (!restriction) {
      return res.status(200).json({
        success: true,
        data: {
          customerId,
          merchantScopeId,
          restricted: false,
          reasonCode: null,
          manualBlockActive: false,
          temporaryLockActive: false,
          temporaryLockUntil: null,
          overrideActive: false,
          overrideMode: 'NONE'
        }
      });
    }

    const evaluation = restriction.evaluateStatus(atDate);

    return res.status(200).json({
      success: true,
      data: {
        customerId,
        merchantScopeId,
        restricted: evaluation.restricted,
        reasonCode: evaluation.reasonCode,
        manualBlockActive: Boolean(restriction.manualBlockActive),
        manualBlockReasonCode: restriction.manualBlockReasonCode,
        temporaryLockActive: restriction.isTemporaryLockActive(atDate),
        temporaryLockUntil: restriction.temporaryLockUntil,
        temporaryLockReasonCode: restriction.temporaryLockReasonCode,
        automaticLockSource: restriction.automaticLockSource,
        overrideActive: evaluation.overrideActive,
        overrideMode: restriction.overrideMode,
        overrideUntil: restriction.overrideUntil,
        overrideReasonCode: restriction.overrideReasonCode
      }
    });
  } catch (error) {
    return next(error);
  }
};

exports.blockCustomerCod = async (req, res, next) => {
  try {
    const customerId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      throw new AppError('Invalid customer ID format', 400, 'INVALID_CUSTOMER_ID');
    }

    const {
      merchantScopeId = 'default',
      reasonCode = 'COD_CUSTOMER_BLOCKED',
      notes = ''
    } = req.body;

    let restriction = await CustomerCodRestriction.findOne({
      merchantScopeId,
      customerId
    });

    if (!restriction) {
      restriction = new CustomerCodRestriction({
        merchantScopeId,
        customerId,
        lockVersion: 1
      });
    }

    restriction.manualBlockActive = true;
    restriction.manualBlockReasonCode = reasonCode;
    restriction.manualBlockedAt = new Date();
    restriction.manualBlockedBy = req.user?._id || null;
    restriction.lockVersion = (restriction.lockVersion || 1) + 1;

    await restriction.save();

    logger.warn('Customer COD manually blocked', {
      customerId,
      merchantScopeId,
      actor: req.user?._id,
      notes
    });

    await recordAuditLog({
      req,
      eventName: 'COD.CUSTOMER.BLOCKED',
      details: {
        customerId,
        reasonCode: restriction.manualBlockReasonCode
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Customer COD blocked successfully',
      data: restriction
    });
  } catch (error) {
    return next(error);
  }
};

exports.unblockCustomerCod = async (req, res, next) => {
  try {
    const customerId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      throw new AppError('Invalid customer ID format', 400, 'INVALID_CUSTOMER_ID');
    }

    const merchantScopeId = req.body.merchantScopeId || 'default';

    const restriction = await CustomerCodRestriction.findOne({
      merchantScopeId,
      customerId
    });

    if (restriction) {
      restriction.manualBlockActive = false;
      restriction.manualBlockReasonCode = null;
      restriction.manualBlockedAt = null;
      restriction.manualBlockedBy = null;
      restriction.lockVersion = (restriction.lockVersion || 1) + 1;
      await restriction.save();
    }

    logger.info('Customer COD unblocked', { customerId, merchantScopeId, actor: req.user?._id });

    await recordAuditLog({
      req,
      eventName: 'COD.CUSTOMER.UNBLOCKED',
      details: {
        customerId
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Customer COD unblocked successfully',
      data: restriction
    });
  } catch (error) {
    return next(error);
  }
};

exports.overrideCustomerCod = async (req, res, next) => {
  try {
    const customerId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      throw new AppError('Invalid customer ID format', 400, 'INVALID_CUSTOMER_ID');
    }

    const {
      merchantScopeId = 'default',
      overrideMode = 'NONE',
      overrideUntil = null,
      overrideReasonCode = null
    } = req.body;

    if (!['NONE', 'UNTIL', 'INDEFINITE'].includes(overrideMode)) {
      throw new AppError('Invalid override mode. Must be NONE, UNTIL, or INDEFINITE', 400, 'INVALID_OVERRIDE_MODE');
    }

    if (overrideMode === 'UNTIL' && (!overrideUntil || new Date(overrideUntil).getTime() <= Date.now())) {
      throw new AppError('Future overrideUntil date required when overrideMode is UNTIL', 400, 'INVALID_OVERRIDE_DATE');
    }

    let restriction = await CustomerCodRestriction.findOne({
      merchantScopeId,
      customerId
    });

    if (!restriction) {
      restriction = new CustomerCodRestriction({
        merchantScopeId,
        customerId,
        lockVersion: 1
      });
    }

    restriction.overrideMode = overrideMode;
    restriction.overrideUntil = overrideMode === 'UNTIL' ? new Date(overrideUntil) : null;
    restriction.overrideReasonCode = overrideReasonCode || (overrideMode !== 'NONE' ? 'ADMIN_AUTHORIZED_EXCEPTION' : null);
    restriction.overrideActor = overrideMode !== 'NONE' ? (req.user?._id || null) : null;
    restriction.overrideCreatedAt = overrideMode !== 'NONE' ? new Date() : null;
    restriction.lockVersion = (restriction.lockVersion || 1) + 1;

    await restriction.save();

    logger.info('Customer COD override updated', {
      customerId,
      merchantScopeId,
      overrideMode,
      overrideUntil,
      actor: req.user?._id
    });

    await recordAuditLog({
      req,
      eventName: 'COD.CUSTOMER.OVERRIDDEN',
      details: {
        customerId,
        overrideMode: restriction.overrideMode,
        overrideUntil: restriction.overrideUntil
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Customer COD override saved successfully',
      data: restriction
    });
  } catch (error) {
    return next(error);
  }
};

// --- Courier Delivery Outcome Recording ---

exports.recordDeliveryOutcome = async (req, res, next) => {
  try {
    const orderId = req.params.id;
    const {
      merchantScopeId = 'default',
      outcomeCode,
      eventId = null,
      occurredAt = new Date(),
      metadata = {}
    } = req.body;

    const result = await defaultOrderDeliveryOutcomeService.recordDeliveryOutcome({
      merchantScopeId,
      orderId,
      outcomeCode,
      eventId,
      occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
      actor: req.user,
      metadata
    });

    await recordAuditLog({
      req,
      eventName: 'COD.DELIVERY_OUTCOME.RECORDED',
      details: {
        orderId,
        outcomeCode,
        eventId: result.event?.eventId || eventId
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Delivery outcome recorded successfully',
      data: result
    });
  } catch (error) {
    return next(error);
  }
};

// --- Offering COD Eligibility Governance ---

exports.listOfferings = async (req, res, next) => {
  try {
    const { merchantScopeId = 'default', limit = 100, skip = 0, codEligible } = req.query;
    const query = { merchantScopeId, marketCountry: 'PK' };
    if (codEligible !== undefined) {
      query.codEligible = codEligible === 'true';
    }

    const [offerings, total] = await Promise.all([
      ProductMarketOffering.find(query)
        .populate('productId', 'name sku price images')
        .sort({ updatedAt: -1 })
        .skip(Number(skip))
        .limit(Number(limit)),
      ProductMarketOffering.countDocuments(query)
    ]);

    return res.status(200).json({
      success: true,
      data: { offerings, total }
    });
  } catch (error) {
    return next(error);
  }
};

exports.updateOfferingEligibility = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { codEligible, merchantScopeId } = req.body;

    if (typeof codEligible !== 'boolean') {
      throw new AppError('codEligible boolean is required', 400, 'INVALID_COD_ELIGIBLE');
    }

    const query = { _id: id };
    if (merchantScopeId) {
      query.merchantScopeId = merchantScopeId;
    }

    const offering = await ProductMarketOffering.findOne(query);
    if (!offering) {
      throw new AppError('Product market offering not found', 404, 'OFFERING_NOT_FOUND');
    }

    offering.codEligible = codEligible;
    offering.lockVersion = (offering.lockVersion || 1) + 1;
    await offering.save();

    await recordAuditLog({
      req,
      eventName: 'COD.OFFERING_ELIGIBILITY.UPDATED',
      details: {
        offeringId: id,
        sku: offering.sku,
        codEligible
      }
    });

    return res.status(200).json({
      success: true,
      message: `Offering COD eligibility updated to ${codEligible}`,
      data: { offering }
    });
  } catch (error) {
    return next(error);
  }
};

// --- Governance Audit History ---

exports.listAuditHistory = async (req, res, next) => {
  try {
    const { limit = 50, skip = 0 } = req.query;
    const query = { eventName: { $regex: '^COD\\.' } };

    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .sort({ createdAt: -1 })
        .skip(Number(skip))
        .limit(Number(limit))
        .lean(),
      AuditLog.countDocuments(query)
    ]);

    return res.status(200).json({
      success: true,
      data: { auditLogs: logs, logs, total }
    });
  } catch (error) {
    return next(error);
  }
};

// --- Guest Phone Verification Endpoints ---

exports.requestPhoneChallenge = async (req, res, next) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      throw new AppError('Phone number is required', 400, 'PHONE_REQUIRED');
    }

    const clientIp = req.ip || req.connection?.remoteAddress || '127.0.0.1';
    const result = await defaultGuestVerificationService.createChallenge({ phone, clientIp });

    return res.status(200).json({
      success: true,
      message: 'Verification code sent successfully',
      data: result
    });
  } catch (error) {
    return next(error);
  }
};

exports.verifyPhoneOtp = async (req, res, next) => {
  try {
    const { challengeId, otp } = req.body;
    if (!challengeId || !otp) {
      throw new AppError('Challenge ID and OTP are required', 400, 'OTP_REQUIRED');
    }

    const result = await defaultGuestVerificationService.verifyOtp({ challengeId, otp });

    return res.status(200).json({
      success: true,
      message: 'Phone verified successfully',
      data: result
    });
  } catch (error) {
    return next(error);
  }
};
