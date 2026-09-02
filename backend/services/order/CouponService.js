const mongoose = require('mongoose');
const Coupon = require('../../models/Coupon');
const CouponRedemption = require('../../models/CouponRedemption');
const Product = require('../../models/Product');
const { AppError } = require('../../common/errors/AppError');
const ERROR_CODES = require('../../constants/errorCodes');

class CouponService {
  roundMoney(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }

  /**
   * Helper to execute a callback inside a MongoDB transaction with bounded retry and fail-closed deployed detection
   */
  async withTransaction(callback) {
    let isDeployed = false;
    try {
      const { getRuntimeConfig } = require('../../config/runtime.config');
      isDeployed = Boolean(getRuntimeConfig().isDeployed);
    } catch {
      const candidate = (process.env.APP_ENV || process.env.NODE_ENV || 'development').toLowerCase();
      isDeployed = candidate === 'staging' || candidate === 'production';
    }

    let session;
    try {
      session = await mongoose.startSession();
    } catch (sessionErr) {
      if (isDeployed) {
        throw new AppError(
          'Database transactions are required but unavailable in deployed environments',
          503,
          ERROR_CODES.SERVICE_UNAVAILABLE || 'SERVICE_UNAVAILABLE'
        );
      }
      return await callback(null);
    }

    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      attempt++;
      try {
        let result;
        await session.withTransaction(async () => {
          result = await callback(session);
        });
        return result;
      } catch (error) {
        const isTransient = error.hasErrorLabel && (
          error.hasErrorLabel('TransientTransactionError') ||
          error.hasErrorLabel('UnknownTransactionCommitResult')
        );

        if (isTransient && attempt < maxRetries) {
          const jitter = Math.floor(Math.random() * 50) + 20 * attempt;
          await new Promise((resolve) => setTimeout(resolve, jitter));
          continue;
        }

        // Dev/test standalone fallback
        if (
          !isDeployed &&
          (error.message?.includes('replica set') || error.message?.includes('standalone'))
        ) {
          await session.endSession();
          return await callback(null);
        }

        throw error;
      } finally {
        if (attempt >= maxRetries || !session.inTransaction()) {
          await session.endSession();
        }
      }
    }
  }

  /**
   * Derive effective display status for coupon at query/runtime
   */
  getEffectiveStatus(coupon, now = new Date()) {
    if (coupon.status === 'draft') return 'draft';
    if (coupon.status === 'disabled') return 'disabled';
    if (coupon.status === 'archived') return 'archived';

    if (now < new Date(coupon.startDate)) return 'upcoming';
    if (now > new Date(coupon.endDate)) return 'expired';
    if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) return 'exhausted';
    return 'active';
  }

  /**
   * Authoritative discount calculation on eligible subtotal
   */
  calculateDiscount({ coupon, items, subtotal }) {
    let eligibleItems = items || [];

    if (coupon.applicableProducts && coupon.applicableProducts.length > 0) {
      const productIds = new Set(coupon.applicableProducts.map(String));
      eligibleItems = eligibleItems.filter((item) => productIds.has(String(item.product)));
    }

    if (coupon.applicableCategories && coupon.applicableCategories.length > 0) {
      const categoryIds = new Set(coupon.applicableCategories.map(String));
      eligibleItems = eligibleItems.filter(
        (item) => item.categoryId && categoryIds.has(String(item.categoryId))
      );
    }

    if (eligibleItems.length === 0) {
      throw new AppError(
        'Coupon does not apply to the selected products',
        400,
        ERROR_CODES.ORDER_COUPON_INVALID
      );
    }

    const eligibleSubtotal = this.roundMoney(
      eligibleItems.reduce((sum, item) => sum + (item.lineTotal || 0), 0)
    );

    const minPurchaseRequired = coupon.minPurchase || coupon.minOrderAmount || 0;
    if (minPurchaseRequired && eligibleSubtotal < minPurchaseRequired) {
      throw new AppError(
        `Minimum purchase amount of Rs. ${minPurchaseRequired} is required for this coupon`,
        400,
        ERROR_CODES.ORDER_COUPON_INVALID
      );
    }

    let discountAmount = 0;
    if (coupon.type === 'percentage') {
      discountAmount = this.roundMoney((eligibleSubtotal * coupon.value) / 100);
      if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
        discountAmount = coupon.maxDiscount;
      }
    } else if (coupon.type === 'fixed') {
      discountAmount = this.roundMoney(Math.min(coupon.value, eligibleSubtotal));
    } else if (coupon.type === 'freeshipping') {
      discountAmount = 0;
    }

    return {
      discountAmount,
      freeShipping: coupon.type === 'freeshipping',
      eligibleSubtotal
    };
  }

  /**
   * Transactional validation and reservation during checkout
   */
  async validateAndReserve({ code, subtotal, items, userId = null, checkoutKey = null, session = null }) {
    if (!code) {
      return {
        snapshot: null,
        discountAmount: 0,
        freeShipping: false
      };
    }

    const normalizedCode = String(code).trim().toUpperCase();
    const now = new Date();

    const reservationKey = checkoutKey || (userId ? `CK-${userId}-${Date.now()}` : `CK-ANON-${Date.now()}`);

    // If reservation already exists for this exact checkout key, return existing reservation snapshot
    if (checkoutKey) {
      const existingQuery = CouponRedemption.findOne({ checkoutKey, status: { $in: ['reserved', 'committed'] } });
      if (session) existingQuery.session(session);
      const existing = await existingQuery;
      if (existing) {
        return {
          snapshot: {
            couponId: existing.coupon,
            code: existing.discountSnapshot.code,
            type: existing.discountSnapshot.type,
            value: existing.discountSnapshot.value,
            discountAmount: existing.discountSnapshot.discountAmount
          },
          discountAmount: existing.discountSnapshot.discountAmount,
          freeShipping: existing.discountSnapshot.freeShipping,
          checkoutKey
        };
      }
    }

    // Atomic conditional increment on coupon
    const couponQuery = {
      code: normalizedCode,
      status: 'active',
      startDate: { $lte: now },
      endDate: { $gte: now },
      $or: [
        { usageLimit: 0 },
        { usageLimit: { $exists: false } },
        { $expr: { $lt: ['$usedCount', '$usageLimit'] } }
      ]
    };

    const couponUpdate = {
      $inc: { usedCount: 1 }
    };

    const options = session ? { session, new: true } : { new: true };
    const coupon = await Coupon.findOneAndUpdate(couponQuery, couponUpdate, options);

    if (!coupon) {
      const existingCoupon = await Coupon.findOne({ code: normalizedCode });
      if (!existingCoupon) {
        throw new AppError('Invalid coupon code', 400, ERROR_CODES.ORDER_COUPON_INVALID);
      }
      if (existingCoupon.status !== 'active') {
        throw new AppError('Coupon is not active', 400, ERROR_CODES.ORDER_COUPON_INVALID);
      }
      if (now < new Date(existingCoupon.startDate)) {
        throw new AppError('Coupon is not yet active', 400, ERROR_CODES.ORDER_COUPON_INVALID);
      }
      if (now > new Date(existingCoupon.endDate)) {
        throw new AppError('Coupon has expired', 400, ERROR_CODES.ORDER_COUPON_INVALID);
      }
      if (existingCoupon.usageLimit > 0 && existingCoupon.usedCount >= existingCoupon.usageLimit) {
        throw new AppError('Coupon usage limit reached', 409, ERROR_CODES.ORDER_COUPON_LIMIT_REACHED);
      }
      throw new AppError('Coupon is not valid for this order', 400, ERROR_CODES.ORDER_COUPON_INVALID);
    }

    // Check per-user limit
    const perUserLimit = coupon.perCustomerLimit || coupon.userPerCouponLimit || 0;
    if (userId) {
      if (perUserLimit > 0) {
        const redemptionsQuery = CouponRedemption.countDocuments({
          coupon: coupon._id,
          user: userId,
          status: { $in: ['reserved', 'committed'] }
        });
        if (session) redemptionsQuery.session(session);
        const userRedemptionCount = await redemptionsQuery;

        if (userRedemptionCount >= perUserLimit) {
          await Coupon.findOneAndUpdate(
            { _id: coupon._id },
            { $inc: { usedCount: -1 } },
            session ? { session } : {}
          );
          throw new AppError(
            `You have reached the usage limit (${perUserLimit}) for this coupon`,
            409,
            ERROR_CODES.ORDER_COUPON_LIMIT_REACHED
          );
        }
      }

      const existingUserEntry = coupon.redemptions && coupon.redemptions.find(
        (r) => String(r.user) === String(userId)
      );
      if (existingUserEntry) {
        await Coupon.updateOne(
          { _id: coupon._id, 'redemptions.user': userId },
          { $inc: { 'redemptions.$.count': 1 }, $set: { 'redemptions.$.lastUsedAt': new Date() } },
          session ? { session } : {}
        );
      } else {
        await Coupon.updateOne(
          { _id: coupon._id },
          { $push: { redemptions: { user: userId, count: 1, lastUsedAt: new Date() } } },
          session ? { session } : {}
        );
      }
    }

    let discountCalculation;
    try {
      discountCalculation = this.calculateDiscount({ coupon, items, subtotal });
    } catch (calcError) {
      await Coupon.findOneAndUpdate(
        { _id: coupon._id },
        { $inc: { usedCount: -1 } },
        session ? { session } : {}
      );
      if (userId) {
        await Coupon.updateOne(
          { _id: coupon._id, 'redemptions.user': userId },
          { $inc: { 'redemptions.$.count': -1 } },
          session ? { session } : {}
        );
      }
      throw calcError;
    }

    const { discountAmount, freeShipping } = discountCalculation;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minute reservation TTL

    const createOptions = session ? { session } : {};
    await CouponRedemption.create([{
      coupon: coupon._id,
      user: userId || null,
      checkoutKey: reservationKey,
      status: 'reserved',
      discountSnapshot: {
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        discountAmount,
        freeShipping
      },
      expiresAt
    }], createOptions);

    return {
      snapshot: {
        couponId: coupon._id,
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        discountAmount
      },
      discountAmount,
      freeShipping,
      checkoutKey: reservationKey
    };
  }

  /**
   * Commit a reserved coupon redemption upon successful order placement / payment
   * Unsets expiresAt to permanently protect committed redemptions from reservation expiry reconciliation.
   */
  async commitRedemption({ checkoutKey, orderId, session = null }) {
    if (!checkoutKey) return;

    const query = {
      checkoutKey,
      status: 'reserved'
    };

    const update = {
      $set: {
        status: 'committed',
        orderId: orderId || null,
        committedAt: new Date(),
        expiresAt: null
      }
    };

    const options = session ? { session, new: true } : { new: true };
    return await CouponRedemption.findOneAndUpdate(query, update, options);
  }

  /**
   * Restores coupon usage on order cancellation or payment failure
   * Exactly-once transition prevents multiple decrements
   */
  async restoreUsage({ checkoutKey, couponSnapshot, userId = null, releaseReason = 'order_cancelled', session = null }) {
    let redemption = null;

    if (checkoutKey) {
      redemption = await CouponRedemption.findOneAndUpdate(
        { checkoutKey, status: { $in: ['reserved', 'committed'] } },
        {
          $set: {
            status: 'released',
            releasedAt: new Date(),
            releaseReason: String(releaseReason).slice(0, 200)
          }
        },
        session ? { session, new: true } : { new: true }
      );
    }

    if (!redemption && couponSnapshot?.couponId && userId) {
      const active = await CouponRedemption.findOne({
        coupon: couponSnapshot.couponId,
        user: userId,
        status: { $in: ['reserved', 'committed'] }
      }).sort({ createdAt: -1 });

      if (active) {
        redemption = await CouponRedemption.findOneAndUpdate(
          { _id: active._id, status: { $in: ['reserved', 'committed'] } },
          {
            $set: {
              status: 'released',
              releasedAt: new Date(),
              releaseReason: String(releaseReason).slice(0, 200)
            }
          },
          session ? { session, new: true } : { new: true }
        );
      }
    }

    // If redemption already released or not found in active state, do not release twice
    if (!redemption) {
      return { restored: false, alreadyReleased: true };
    }

    const couponId = redemption.coupon || couponSnapshot?.couponId;

    if (couponId) {
      const updateCouponQuery = Coupon.findOneAndUpdate(
        { _id: couponId, usedCount: { $gt: 0 } },
        { $inc: { usedCount: -1 } },
        { session, new: true }
      );
      await updateCouponQuery;
      if (userId) {
        await Coupon.updateOne(
          { _id: couponId, 'redemptions.user': userId, 'redemptions.count': { $gt: 0 } },
          { $inc: { 'redemptions.$.count': -1 } },
          session ? { session } : {}
        );
      }
    }

    return { restored: true, redemption };
  }

  /**
   * Reconciles and releases a single expired reservation.
   * Strict predicate: immutable _id, status === 'reserved', expiresAt <= asOfDate
   * Shares a transaction with the Coupon usedCount decrement.
   */
  async releaseExpiredReservation({ reservationId, asOfDate = new Date() }) {
    return await this.withTransaction(async (session) => {
      // Conditional mutation requiring all 3 predicates
      const query = {
        _id: reservationId,
        status: 'reserved',
        expiresAt: { $lte: asOfDate }
      };

      const update = {
        $set: {
          status: 'released',
          releasedAt: new Date(),
          releaseReason: 'reservation_expired'
        }
      };

      const options = session ? { session, new: true } : { new: true };
      const redemption = await CouponRedemption.findOneAndUpdate(query, update, options);

      if (!redemption) {
        return { released: false, reason: 'predicate_mismatch_or_already_transitioned' };
      }

      const couponId = redemption.coupon;
      if (couponId) {
        const updateCouponQuery = Coupon.findOneAndUpdate(
          { _id: couponId, usedCount: { $gt: 0 } },
          { $inc: { usedCount: -1 } },
          session ? { session, new: true } : { new: true }
        );
        const updatedCoupon = await updateCouponQuery;
        if (!updatedCoupon) {
          // If decrement cannot occur, abort inside transaction so redemption remains reserved
          throw new AppError('Failed to decrement coupon usedCount: count is zero or coupon missing', 409, ERROR_CODES.ORDER_COUPON_INVALID);
        }

        if (redemption.user) {
          await Coupon.updateOne(
            { _id: couponId, 'redemptions.user': redemption.user, 'redemptions.count': { $gt: 0 } },
            { $inc: { 'redemptions.$.count': -1 } },
            session ? { session } : {}
          );
        }
      }

      return { released: true, redemption };
    });
  }

  /**
   * Public non-binding coupon preview validation
   * Authoritatively reconstructs prices and categories from database without trusting client amounts
   */
  async preview({ code, items, subtotal = 0, userId = null }) {
    if (!code) {
      throw new AppError('Coupon code is required', 400, ERROR_CODES.ORDER_COUPON_INVALID);
    }

    const normalizedCode = String(code).trim().toUpperCase();
    const now = new Date();

    const coupon = await Coupon.findOne({ code: normalizedCode });
    if (!coupon) {
      throw new AppError('Invalid coupon code', 400, ERROR_CODES.ORDER_COUPON_INVALID);
    }

    const isCouponActive = coupon.status === 'active' || (coupon.isActive && !coupon.status);
    if (!isCouponActive) {
      throw new AppError('Coupon is not active', 400, ERROR_CODES.ORDER_COUPON_INVALID);
    }

    if (now < new Date(coupon.startDate)) {
      throw new AppError('Coupon is not yet active', 400, ERROR_CODES.ORDER_COUPON_INVALID);
    }

    if (now > new Date(coupon.endDate)) {
      throw new AppError('Coupon has expired', 400, ERROR_CODES.ORDER_COUPON_INVALID);
    }

    if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
      throw new AppError('Coupon usage limit reached', 409, ERROR_CODES.ORDER_COUPON_LIMIT_REACHED);
    }

    const perUserLimit = coupon.perCustomerLimit || coupon.userPerCouponLimit || 0;
    if (userId && perUserLimit > 0) {
      const userRedemptionCount = await CouponRedemption.countDocuments({
        coupon: coupon._id,
        user: userId,
        status: { $in: ['reserved', 'committed'] }
      });

      if (userRedemptionCount >= perUserLimit) {
        throw new AppError(
          `You have reached the usage limit (${perUserLimit}) for this coupon`,
          409,
          ERROR_CODES.ORDER_COUPON_LIMIT_REACHED
        );
      }
    }

    // Resolve authoritative product pricing if items provided
    let resolvedItems = [];
    let calculatedSubtotal = 0;

    if (Array.isArray(items) && items.length > 0) {
      const productIds = items.map((i) => i.productId || i.product).filter(Boolean);
      const dbProducts = await Product.find({ _id: { $in: productIds } }).lean();
      const productMap = new Map(dbProducts.map((p) => [String(p._id), p]));

      for (const item of items) {
        const pId = String(item.productId || item.product);
        const product = productMap.get(pId);
        if (!product || !product.isActive) {
          throw new AppError(
            `Product not available: ${item.name || pId}`,
            400,
            ERROR_CODES.ORDER_PRODUCT_UNAVAILABLE
          );
        }

        const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
        let unitPrice = product.price;

        if (item.variantId && Array.isArray(product.variants)) {
          const variant = product.variants.find((v) => String(v._id) === String(item.variantId));
          if (variant && variant.price !== undefined) {
            unitPrice = variant.price;
          }
        }

        const lineTotal = this.roundMoney(unitPrice * qty);
        calculatedSubtotal += lineTotal;
        resolvedItems.push({
          product: product._id,
          categoryId: product.category || null,
          quantity: qty,
          unitPrice,
          lineTotal
        });
      }
    } else {
      calculatedSubtotal = Number(subtotal) || 0;
      resolvedItems = [{
        product: new mongoose.Types.ObjectId(),
        lineTotal: calculatedSubtotal,
        quantity: 1
      }];
    }

    const { discountAmount, freeShipping, eligibleSubtotal } = this.calculateDiscount({
      coupon,
      items: resolvedItems,
      subtotal: calculatedSubtotal
    });

    return {
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      discountAmount,
      estimatedDiscount: discountAmount,
      freeShipping,
      eligibleSubtotal,
      subtotal: this.roundMoney(calculatedSubtotal),
      newSubtotal: this.roundMoney(Math.max(0, calculatedSubtotal - discountAmount)),
      appliedAt: new Date().toISOString(),
      expiresAt: coupon.endDate,
      isNonBindingPreview: true
    };
  }
}

module.exports = new CouponService();
