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
      eligibleItems.reduce((sum, item) => sum + (Number(item.lineTotal) || (Number(item.price) * Number(item.quantity)) || 0), 0)
    );

    let discountAmount = 0;
    if (coupon.type === 'percentage') {
      discountAmount = this.roundMoney((eligibleSubtotal * coupon.value) / 100);
      if (coupon.maxDiscount > 0 && discountAmount > coupon.maxDiscount) {
        discountAmount = coupon.maxDiscount;
      }
      discountAmount = this.roundMoney(Math.min(discountAmount, eligibleSubtotal));
    } else if (coupon.type === 'fixed') {
      // Fixed discount is capped by eligibleSubtotal
      discountAmount = this.roundMoney(Math.min(coupon.value, eligibleSubtotal));
    } else if (coupon.type === 'freeshipping') {
      discountAmount = 0;
    }

    discountAmount = this.roundMoney(Math.min(discountAmount, subtotal));

    return {
      eligibleItems,
      eligibleSubtotal,
      discountAmount,
      freeShipping: coupon.type === 'freeshipping'
    };
  }

  /**
   * Transactional reservation during order checkout
   */
  async validateAndReserve({
    code,
    subtotal,
    items,
    userId = null,
    checkoutKey = null,
    session = null
  }) {
    if (!code) {
      return {
        snapshot: null,
        discountAmount: 0,
        freeShipping: false
      };
    }

    const now = new Date();
    const normalizedCode = String(code).trim().toUpperCase();

    const couponQuery = Coupon.findOne({ code: normalizedCode });
    if (session) couponQuery.session(session);
    const coupon = await couponQuery;

    if (!coupon) {
      throw new AppError(
        'Invalid coupon code',
        400,
        ERROR_CODES.ORDER_COUPON_INVALID
      );
    }

    if (coupon.status !== 'active' || !coupon.isActive || now < coupon.startDate || now > coupon.endDate) {
      throw new AppError(
        'Coupon is expired or inactive',
        400,
        ERROR_CODES.ORDER_COUPON_INVALID
      );
    }

    if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
      throw new AppError(
        'Coupon usage limit reached',
        409,
        ERROR_CODES.ORDER_COUPON_LIMIT_REACHED
      );
    }

    if (coupon.minOrderAmount > subtotal) {
      throw new AppError(
        `Coupon requires a minimum order of ${coupon.minOrderAmount}`,
        400,
        ERROR_CODES.ORDER_COUPON_INVALID
      );
    }

    // Per-customer limit check via CouponRedemption ledger
    if (coupon.perCustomerLimit > 0 && userId) {
      const redemptionQuery = CouponRedemption.countDocuments({
        coupon: coupon._id,
        user: userId,
        status: { $in: ['reserved', 'committed'] }
      });
      if (session) redemptionQuery.session(session);
      const usedByCustomer = await redemptionQuery;

      if (usedByCustomer >= coupon.perCustomerLimit) {
        throw new AppError(
          `You have already reached the usage limit (${coupon.perCustomerLimit}) for this coupon`,
          409,
          ERROR_CODES.ORDER_COUPON_LIMIT_REACHED
        );
      }
    }

    const { discountAmount, freeShipping } = this.calculateDiscount({
      coupon,
      items,
      subtotal
    });

    const reservationKey = checkoutKey || `CHK-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes reservation TTL

    // Atomic increment on coupon
    const updateCouponQuery = Coupon.findOneAndUpdate(
      {
        _id: coupon._id,
        status: 'active',
        ...(coupon.usageLimit > 0 ? { usedCount: { $lt: coupon.usageLimit } } : {})
      },
      { $inc: { usedCount: 1 } },
      { session, new: true }
    );

    const reservedCoupon = await updateCouponQuery;
    if (!reservedCoupon) {
      throw new AppError(
        'Coupon usage limit reached',
        409,
        ERROR_CODES.ORDER_COUPON_LIMIT_REACHED
      );
    }

    // If user provided, atomically maintain legacy redemptions array on coupon
    if (userId) {
      const incRes = await Coupon.updateOne(
        { _id: coupon._id, 'redemptions.user': userId },
        { $inc: { 'redemptions.$.count': 1 } },
        session ? { session } : {}
      );
      if (incRes.matchedCount === 0) {
        await Coupon.updateOne(
          { _id: coupon._id },
          { $push: { redemptions: { user: userId, count: 1 } } },
          session ? { session } : {}
        );
      }
    }

    // Record redemption in ledger
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
   */
  async commitRedemption({ checkoutKey, orderId, session = null }) {
    if (!checkoutKey) return;

    const query = {
      checkoutKey,
      status: 'reserved'
    };

    const update = {
      status: 'committed',
      orderId: orderId || null,
      committedAt: new Date()
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
      const q = CouponRedemption.findOne({ checkoutKey });
      if (session) q.session(session);
      redemption = await q;
    }

    if (!redemption && couponSnapshot?.couponId && userId) {
      const q = CouponRedemption.findOne({
        coupon: couponSnapshot.couponId,
        user: userId,
        status: { $in: ['reserved', 'committed'] }
      }).sort({ createdAt: -1 });
      if (session) q.session(session);
      redemption = await q;
    }

    // If redemption already released or not found in active state, do not release twice
    if (!redemption || redemption.status === 'released') {
      return;
    }

    const couponId = redemption.coupon || couponSnapshot?.couponId;

    redemption.status = 'released';
    redemption.releasedAt = new Date();
    redemption.releaseReason = String(releaseReason).slice(0, 200);
    await redemption.save({ session });

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
  }

  /**
   * Public non-binding coupon preview validation
   * Authoritatively reconstructs prices and categories from database without trusting client amounts
   */
  async preview({ code, items = [], subtotal: rawSubtotal = 0, userId = null }) {
    if (!code || typeof code !== 'string' || !code.trim()) {
      throw new AppError('Coupon code is required', 400, ERROR_CODES.ORDER_COUPON_INVALID);
    }

    const now = new Date();
    const normalizedCode = code.trim().toUpperCase();
    const coupon = await Coupon.findOne({ code: normalizedCode });

    if (!coupon) {
      throw new AppError('Invalid coupon code', 404, ERROR_CODES.ORDER_COUPON_INVALID);
    }

    if (coupon.status !== 'active' || !coupon.isActive) {
      throw new AppError('This coupon is currently inactive', 400, ERROR_CODES.ORDER_COUPON_INVALID);
    }

    if (now < coupon.startDate) {
      throw new AppError(
        `This coupon will be active from ${coupon.startDate.toLocaleDateString()}`,
        400,
        ERROR_CODES.ORDER_COUPON_INVALID
      );
    }

    if (now > coupon.endDate) {
      throw new AppError('This coupon has expired', 400, ERROR_CODES.ORDER_COUPON_INVALID);
    }

    if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
      throw new AppError('This coupon has reached its usage limit', 400, ERROR_CODES.ORDER_COUPON_LIMIT_REACHED);
    }

    // Reconstruct items authoritatively from Product collection
    let resolvedItems = [];
    let subtotal = Number(rawSubtotal) || 0;

    if (Array.isArray(items) && items.length > 0) {
      const productIds = items.map((i) => i.product || i.productId).filter(Boolean);
      const products = await Product.find({ _id: { $in: productIds }, isActive: true });
      const productMap = new Map(products.map((p) => [String(p._id), p]));

      subtotal = 0;
      for (const item of items) {
        const pId = String(item.product || item.productId);
        const product = productMap.get(pId);
        if (!product) continue;

        const quantity = Math.max(1, parseInt(item.quantity, 10) || 1);
        let price = product.price;

        if (item.variantId && product.variants && product.variants.length > 0) {
          const variant = product.variants.id(item.variantId);
          if (variant) {
            price = variant.salePrice > 0 ? variant.salePrice : variant.price;
          }
        }

        const lineTotal = this.roundMoney(price * quantity);
        subtotal = this.roundMoney(subtotal + lineTotal);

        resolvedItems.push({
          product: product._id,
          categoryId: product.category,
          price,
          quantity,
          lineTotal
        });
      }
    }

    if (coupon.minOrderAmount > 0 && subtotal < coupon.minOrderAmount) {
      throw new AppError(
        `Minimum order amount for this coupon is ${coupon.minOrderAmount}`,
        400,
        ERROR_CODES.ORDER_COUPON_INVALID
      );
    }

    // Per-customer preview check if authenticated
    if (coupon.perCustomerLimit > 0 && userId) {
      const usedByCustomer = await CouponRedemption.countDocuments({
        coupon: coupon._id,
        user: userId,
        status: { $in: ['reserved', 'committed'] }
      });
      if (usedByCustomer >= coupon.perCustomerLimit) {
        throw new AppError(
          `You have reached the redemption limit for this coupon`,
          400,
          ERROR_CODES.ORDER_COUPON_LIMIT_REACHED
        );
      }
    }

    let discountAmount = 0;
    let eligibleSubtotal = subtotal;

    if (resolvedItems.length > 0) {
      const calcResult = this.calculateDiscount({
        coupon,
        items: resolvedItems,
        subtotal
      });
      discountAmount = calcResult.discountAmount;
      eligibleSubtotal = calcResult.eligibleSubtotal;
    } else {
      if (coupon.type === 'percentage') {
        discountAmount = this.roundMoney((subtotal * coupon.value) / 100);
        if (coupon.maxDiscount > 0 && discountAmount > coupon.maxDiscount) {
          discountAmount = coupon.maxDiscount;
        }
      } else if (coupon.type === 'fixed') {
        discountAmount = this.roundMoney(Math.min(coupon.value, subtotal));
      }
    }

    return {
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      discountAmount,
      estimatedDiscount: discountAmount,
      eligibleSubtotal,
      minOrderAmount: coupon.minOrderAmount,
      maxDiscount: coupon.maxDiscount,
      freeShipping: coupon.type === 'freeshipping',
      isNonBindingPreview: true
    };
  }
}

module.exports = new CouponService();
