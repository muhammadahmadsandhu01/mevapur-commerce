const Coupon = require('../../models/Coupon');
const { AppError } = require('../../common/errors/AppError');
const ERROR_CODES = require('../../constants/errorCodes');

class CouponService {
  roundMoney(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }

  async validateAndReserve({
    code,
    subtotal,
    items,
    userId,
    session
  }) {
    if (!code) {
      return {
        snapshot: null,
        discountAmount: 0,
        freeShipping: false
      };
    }

    const now = new Date();
    const normalizedCode = code.trim().toUpperCase();
    const coupon = await Coupon.findOne({ code: normalizedCode }).session(session);

    if (!coupon) {
      throw new AppError(
        'Invalid coupon code',
        400,
        ERROR_CODES.ORDER_COUPON_INVALID
      );
    }

    if (!coupon.isActive || now < coupon.startDate || now > coupon.endDate) {
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

    let eligibleItems = items;
    if (coupon.applicableProducts.length > 0) {
      const productIds = new Set(coupon.applicableProducts.map(String));
      eligibleItems = eligibleItems.filter((item) => productIds.has(String(item.product)));
    }
    if (coupon.applicableCategories.length > 0) {
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
      eligibleItems.reduce((sum, item) => sum + item.lineTotal, 0)
    );

    let discountAmount = 0;
    if (coupon.type === 'percentage') {
      discountAmount = this.roundMoney((eligibleSubtotal * coupon.value) / 100);
      if (coupon.maxDiscount > 0 && discountAmount > coupon.maxDiscount) {
        discountAmount = coupon.maxDiscount;
      }
    } else if (coupon.type === 'fixed') {
      discountAmount = coupon.value;
    }

    discountAmount = this.roundMoney(Math.min(discountAmount, subtotal));

    const globalLimit = coupon.usageLimit > 0
      ? { usedCount: { $lt: coupon.usageLimit } }
      : {};
    const baseQuery = {
      _id: coupon._id,
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
      ...globalLimit
    };

    let reservedCoupon;
    if (coupon.perCustomerLimit > 0) {
      reservedCoupon = await Coupon.findOneAndUpdate(
        {
          ...baseQuery,
          redemptions: {
            $elemMatch: {
              user: userId,
              count: { $lt: coupon.perCustomerLimit }
            }
          }
        },
        {
          $inc: {
            usedCount: 1,
            'redemptions.$.count': 1
          },
          $set: {
            'redemptions.$.lastUsedAt': now
          }
        },
        { session, new: true }
      );

      if (!reservedCoupon) {
        reservedCoupon = await Coupon.findOneAndUpdate(
          {
            ...baseQuery,
            'redemptions.user': { $ne: userId }
          },
          {
            $inc: { usedCount: 1 },
            $push: {
              redemptions: {
                user: userId,
                count: 1,
                lastUsedAt: now
              }
            }
          },
          { session, new: true }
        );
      }
    } else {
      reservedCoupon = await Coupon.findOneAndUpdate(
        baseQuery,
        { $inc: { usedCount: 1 } },
        { session, new: true }
      );
    }

    if (!reservedCoupon) {
      throw new AppError(
        'Coupon usage limit reached',
        409,
        ERROR_CODES.ORDER_COUPON_LIMIT_REACHED
      );
    }

    return {
      snapshot: {
        couponId: coupon._id,
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        discountAmount
      },
      discountAmount,
      freeShipping: coupon.type === 'freeshipping'
    };
  }

  async restoreUsage(couponSnapshot, userId, session) {
    if (!couponSnapshot?.couponId) return;

    const coupon = await Coupon.findById(couponSnapshot.couponId).session(session);
    if (!coupon) {
      throw new AppError(
        'Coupon usage could not be restored',
        409,
        ERROR_CODES.ORDER_TRANSACTION_FAILED
      );
    }

    const update = {
      $inc: { usedCount: -1 }
    };
    const query = {
      _id: coupon._id,
      usedCount: { $gt: 0 }
    };

    if (coupon.perCustomerLimit > 0) {
      query.redemptions = {
        $elemMatch: {
          user: userId,
          count: { $gt: 0 }
        }
      };
      update.$inc['redemptions.$.count'] = -1;
    }

    const restored = await Coupon.findOneAndUpdate(query, update, {
      session,
      new: true
    });

    if (!restored) {
      throw new AppError(
        'Coupon usage was already restored or is inconsistent',
        409,
        ERROR_CODES.ORDER_TRANSACTION_FAILED
      );
    }
  }
}

module.exports = new CouponService();
