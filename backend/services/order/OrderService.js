const crypto = require('crypto');
const mongoose = require('mongoose');
const Order = require('../../models/Order');
const Product = require('../../models/Product');
const CouponService = require('./CouponService');
const ShippingService = require('./ShippingService');
const TaxService = require('./TaxService');
const InventoryService = require('./InventoryService');
const MarketService = require('../MarketService');
const paymentProviderRegistry = require('../../modules/payments/core/providerRegistry');
const { AppError } = require('../../common/errors/AppError');
const ERROR_CODES = require('../../constants/errorCodes');
const {
  ORDER_STATUSES,
  ORDER_TRANSITIONS,
  CUSTOMER_CANCELLABLE_STATUSES,
  ORDER_LIMITS
} = require('../../constants/orderConstants');

class OrderService {
  roundMoney(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }

  normalizeCountry(value) {
    const normalized = String(value || '').trim().toUpperCase();
    return normalized === 'PAKISTAN' ? 'PK' : normalized;
  }

  hashRequest(orderData) {
    const canonicalItems = [...orderData.items]
      .map((item) => ({
        productId: item.productId,
        variantId: item.variantId || null,
        quantity: item.quantity
      }))
      .sort((left, right) => (
        `${left.productId}:${left.variantId || ''}`
          .localeCompare(`${right.productId}:${right.variantId || ''}`)
      ));

    const canonical = {
      items: canonicalItems,
      shippingAddress: orderData.shippingAddress,
      paymentMethod: orderData.paymentMethod,
      currency: orderData.currency || null,
      couponCode: orderData.couponCode || null,
      customerNote: orderData.customerNote || null
    };

    return crypto
      .createHash('sha256')
      .update(JSON.stringify(canonical))
      .digest('hex');
  }

  assertReplayMatches(order, requestHash) {
    if (order.requestHash !== requestHash) {
      throw new AppError(
        'Idempotency-Key was already used with a different order request',
        409,
        ERROR_CODES.ORDER_IDEMPOTENCY_CONFLICT
      );
    }
  }

  async findIdempotentOrder(userId, idempotencyKey, session = null) {
    let query = Order.findOne({ user: userId, idempotencyKey })
      .select('+requestHash +idempotencyKey');
    if (session) query = query.session(session);
    return query;
  }

  async resolveItems(items, session) {
    const resolved = [];
    const resolvedKeys = new Set();

    for (const item of items) {
      const product = await Product.findById(item.productId).session(session);
      if (!product || !product.isActive) {
        throw new AppError(
          'A selected product is unavailable',
          409,
          ERROR_CODES.ORDER_PRODUCT_UNAVAILABLE
        );
      }

      let variant = null;
      if (item.variantId) {
        variant = product.variants.id(item.variantId);
        if (!variant) {
          throw new AppError(
            `Selected variant is unavailable for ${product.name}`,
            409,
            ERROR_CODES.ORDER_VARIANT_NOT_FOUND
          );
        }
      } else if (product.variants.length > 0) {
        variant = product.variants.find((entry) => entry.isDefault)
          || product.variants[0];
      }

      const resolvedKey = `${product._id}:${variant?._id || 'root'}`;
      if (resolvedKeys.has(resolvedKey)) {
        throw new AppError(
          'Duplicate product/variant lines are not allowed',
          400,
          ERROR_CODES.ORDER_VALIDATION_FAILED
        );
      }
      resolvedKeys.add(resolvedKey);

      const price = this.roundMoney(variant ? variant.price : product.price);
      if (!Number.isFinite(price) || price < 0) {
        throw new AppError(
          'A selected product has an invalid price',
          409,
          ERROR_CODES.ORDER_PRODUCT_UNAVAILABLE
        );
      }

      const lineTotal = this.roundMoney(price * item.quantity);
      const variantLabel = variant
        ? variant.attributes
          .map((attribute) => `${attribute.name}: ${attribute.value}`)
          .join(', ')
        : '';

      resolved.push({
        product: product._id,
        variantId: variant?._id || null,
        isDefaultVariant: Boolean(variant?.isDefault),
        name: product.name,
        sku: variant?.sku || product.sku || '',
        variant: variantLabel,
        price,
        quantity: item.quantity,
        lineTotal,
        image: variant?.images?.[0]
          || product.primaryImage
          || product.images?.[0]
          || product.image
          || '',
        categoryId: product.category || null
      });
    }

    return resolved;
  }

  isRetryableTransactionError(error) {
    return (
      error?.hasErrorLabel?.('TransientTransactionError')
      || error?.hasErrorLabel?.('UnknownTransactionCommitResult')
      || error?.code === 112
      || error?.codeName === 'WriteConflict'
    );
  }

  async runTransaction(work) {
    let lastError;

    for (
      let attempt = 1;
      attempt <= ORDER_LIMITS.MAX_TRANSACTION_ATTEMPTS;
      attempt += 1
    ) {
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        const result = await work(session, attempt);
        await session.commitTransaction();
        await session.endSession();
        return result;
      } catch (error) {
        lastError = error;
        if (session.inTransaction()) {
          await session.abortTransaction();
        }
        await session.endSession();

        if (
          !this.isRetryableTransactionError(error)
          || attempt === ORDER_LIMITS.MAX_TRANSACTION_ATTEMPTS
        ) {
          throw error;
        }
      }
    }

    throw lastError;
  }

  async waitForIdempotentOrder(userId, idempotencyKey) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const order = await this.findIdempotentOrder(userId, idempotencyKey);
      if (order) return order;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return null;
  }

  isIdempotencyDuplicate(error) {
    return error?.code === 11000 && (
      error?.keyPattern?.idempotencyKey
      || String(error.message).includes('unique_user_order_idempotency')
      || String(error.message).includes('idempotencyKey')
    );
  }

  isOrderIdDuplicate(error) {
    return error?.code === 11000 && (
      error?.keyPattern?.orderId
      || String(error.message).includes('orderId')
    );
  }

  async createOrder({ userId, orderData, idempotencyKey }) {
    const requestHash = this.hashRequest(orderData);
    const existing = await this.findIdempotentOrder(userId, idempotencyKey);
    if (existing) {
      this.assertReplayMatches(existing, requestHash);
      return { order: existing, isReplay: true };
    }

    const orderObjectId = new mongoose.Types.ObjectId();
    let orderId = Order.generateOrderId();

    for (
      let idAttempt = 1;
      idAttempt <= ORDER_LIMITS.MAX_ORDER_ID_ATTEMPTS;
      idAttempt += 1
    ) {
      try {
        return await this.runTransaction(async (session) => {
          const replay = await this.findIdempotentOrder(
            userId,
            idempotencyKey,
            session
          );
          if (replay) {
            this.assertReplayMatches(replay, requestHash);
            return { order: replay, isReplay: true };
          }

          const market = await MarketService.getConfig();
          const currency = orderData.currency || market.defaultCurrency;
          const shippingAddress = {
            ...orderData.shippingAddress,
            country: this.normalizeCountry(orderData.shippingAddress.country)
          };
          await MarketService.assertEligible({ country: shippingAddress.country, currency });
          const pricedItems = await this.resolveItems(orderData.items, session);
          const subtotal = this.roundMoney(
            pricedItems.reduce((sum, item) => sum + item.lineTotal, 0)
          );

          const coupon = await CouponService.validateAndReserve({
            code: orderData.couponCode,
            subtotal,
            items: pricedItems,
            userId,
            session
          });
          const afterDiscount = this.roundMoney(
            Math.max(0, subtotal - coupon.discountAmount)
          );
          const shippingQuote = await ShippingService.quote({
            country: shippingAddress.country,
            currency,
            subtotal: afterDiscount,
            city: orderData.shippingAddress.city,
            region: orderData.shippingAddress.province,
            postalCode: orderData.shippingAddress.postalCode
          });
          const shippingCost = coupon.freeShipping ? 0 : shippingQuote.shippingAmount;
          const taxAmount = this.roundMoney(
            TaxService.calculate(afterDiscount, orderData.shippingAddress)
          );
          const totalAmount = this.roundMoney(
            afterDiscount + shippingCost + taxAmount
          );
          const paymentProvider = paymentProviderRegistry.resolve(
            orderData.paymentMethod,
            {
              country: shippingAddress.country,
              currency,
              amount: totalAmount
            }
          );
          const paymentManifest = paymentProvider.getManifest();

          const persistedItems = pricedItems.map(({ categoryId, ...item }) => item);
          const [order] = await Order.create([{
            _id: orderObjectId,
            orderId,
            user: userId,
            idempotencyKey,
            requestHash,
            items: persistedItems,
            shippingAddress,
            paymentMethod: orderData.paymentMethod,
            paymentStatus: 'Pending',
            payment: {
              provider: paymentManifest.displayName,
              currency,
              paidAt: null
            },
            coupon: coupon.snapshot || undefined,
            subtotal,
            shippingCost,
            shippingQuote: {
              zoneId: shippingQuote.zone.id,
              zoneName: shippingQuote.zone.name,
              deliveryMinDays: shippingQuote.deliveryMinDays,
              deliveryMaxDays: shippingQuote.deliveryMaxDays,
              remoteArea: shippingQuote.remoteArea
            },
            taxAmount,
            discount: coupon.discountAmount,
            totalAmount,
            customerNote: orderData.customerNote || '',
            orderStatus: ORDER_STATUSES.PENDING,
            statusTimeline: [{
              status: ORDER_STATUSES.PENDING,
              actor: userId,
              actorRole: 'customer',
              note: 'Order placed'
            }]
          }], { session });

          await InventoryService.reserve(persistedItems, {
            session,
            orderId,
            orderObjectId,
            userId
          });

          return { order, isReplay: false };
        });
      } catch (error) {
        if (this.isIdempotencyDuplicate(error)) {
          const replay = await this.waitForIdempotentOrder(
            userId,
            idempotencyKey
          );
          if (replay) {
            this.assertReplayMatches(replay, requestHash);
            return { order: replay, isReplay: true };
          }
        }

        if (
          this.isOrderIdDuplicate(error)
          && idAttempt < ORDER_LIMITS.MAX_ORDER_ID_ATTEMPTS
        ) {
          orderId = Order.generateOrderId();
          continue;
        }

        throw error;
      }
    }

    throw new AppError(
      'Order identifier generation failed',
      503,
      ERROR_CODES.ORDER_TRANSACTION_FAILED
    );
  }

  referenceQuery(reference) {
    return mongoose.isObjectIdOrHexString(reference)
      ? { _id: reference }
      : { orderId: reference };
  }

  async getOrderForUser(reference, user) {
    const order = await Order.findOne(this.referenceQuery(reference))
      .populate('user', 'fullName email phone role');

    if (!order) {
      throw new AppError(
        'Order not found',
        404,
        ERROR_CODES.ORDER_NOT_FOUND
      );
    }

    const ownerId = order.user?._id || order.user;
    const isAdmin = ['admin', 'super_admin'].includes(user.role);
    if (!isAdmin && String(ownerId) !== String(user.id)) {
      throw new AppError(
        'You cannot access this order',
        403,
        ERROR_CODES.ORDER_FORBIDDEN
      );
    }

    return order;
  }

  async getCustomerOrders(userId, { page, limit, status }) {
    const query = { user: userId };
    if (status) query.orderStatus = status;
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      Order.find(query)
        .select('-adminNotes')
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit),
      Order.countDocuments(query)
    ]);

    return {
      orders,
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit))
      }
    };
  }

  escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  async getAdminOrders({
    page,
    limit,
    status,
    search,
    startDate,
    endDate,
    sortBy = 'createdAt-desc'
  }) {
    const query = {};
    if (status) query.orderStatus = status;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(`${startDate}T00:00:00.000Z`);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(`${endDate}T23:59:59.999Z`);
      }
    }
    if (search) {
      const escaped = this.escapeRegex(search);
      query.$or = [
        { orderId: { $regex: `^${escaped}`, $options: 'i' } },
        { 'shippingAddress.fullName': { $regex: escaped, $options: 'i' } }
      ];
    }

    const sortOptions = {
      'createdAt-desc': { createdAt: -1, _id: -1 },
      'createdAt-asc': { createdAt: 1, _id: 1 },
      'totalAmount-desc': { totalAmount: -1, createdAt: -1, _id: -1 },
      'totalAmount-asc': { totalAmount: 1, createdAt: -1, _id: -1 }
    };
    const skip = (page - 1) * limit;
    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate('user', 'fullName email')
        .sort(sortOptions[sortBy])
        .skip(skip)
        .limit(limit),
      Order.countDocuments(query)
    ]);

    return {
      orders,
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit))
      }
    };
  }

  async cancelOrder({ reference, actor, reason = '', isAdmin = false }) {
    return this.runTransaction(async (session) => {
      const order = await Order.findOne(this.referenceQuery(reference)).session(session);
      if (!order) {
        throw new AppError(
          'Order not found',
          404,
          ERROR_CODES.ORDER_NOT_FOUND
        );
      }

      if (!isAdmin && String(order.user) !== String(actor.id)) {
        throw new AppError(
          'You cannot cancel this order',
          403,
          ERROR_CODES.ORDER_FORBIDDEN
        );
      }

      if (order.orderStatus === ORDER_STATUSES.CANCELLED) {
        return { order, isReplay: true };
      }

      if (!CUSTOMER_CANCELLABLE_STATUSES.includes(order.orderStatus)) {
        throw new AppError(
          `Order cannot be cancelled from ${order.orderStatus}`,
          409,
          ERROR_CODES.ORDER_STATUS_TRANSITION_INVALID
        );
      }

      if (order.inventoryRestoredAt || order.couponRestoredAt) {
        throw new AppError(
          'Order cancellation state is inconsistent',
          409,
          ERROR_CODES.ORDER_TRANSACTION_FAILED
        );
      }

      await InventoryService.restore(order, {
        session,
        userId: actor.id
      });
      order.inventoryRestoredAt = new Date();

      if (order.coupon?.couponId) {
        await CouponService.restoreUsage(order.coupon, order.user, session);
        order.couponRestoredAt = new Date();
      }

      order.orderStatus = ORDER_STATUSES.CANCELLED;
      order.cancelReason = reason;
      order.cancelledAt = new Date();
      order.statusTimeline.push({
        status: ORDER_STATUSES.CANCELLED,
        actor: actor.id,
        actorRole: actor.role,
        note: reason || 'Order cancelled'
      });
      await order.save({ session });

      return { order, isReplay: false };
    });
  }

  async transitionOrder({ reference, actor, orderStatus, adminNote = '' }) {
    if (orderStatus === ORDER_STATUSES.CANCELLED) {
      return this.cancelOrder({
        reference,
        actor,
        reason: adminNote,
        isAdmin: true
      });
    }

    return this.runTransaction(async (session) => {
      const order = await Order.findOne(this.referenceQuery(reference)).session(session);
      if (!order) {
        throw new AppError(
          'Order not found',
          404,
          ERROR_CODES.ORDER_NOT_FOUND
        );
      }

      if (order.orderStatus === orderStatus) {
        return { order, isReplay: true };
      }

      const allowed = ORDER_TRANSITIONS[order.orderStatus] || [];
      if (!allowed.includes(orderStatus)) {
        throw new AppError(
          `Order cannot transition from ${order.orderStatus} to ${orderStatus}`,
          409,
          ERROR_CODES.ORDER_STATUS_TRANSITION_INVALID
        );
      }

      order.orderStatus = orderStatus;
      order.statusTimeline.push({
        status: orderStatus,
        actor: actor.id,
        actorRole: actor.role,
        note: adminNote || `Order moved to ${orderStatus}`
      });
      if (adminNote) {
        order.adminNotes.push({
          note: adminNote,
          addedBy: actor.id
        });
      }
      if (orderStatus === ORDER_STATUSES.DELIVERED) {
        order.deliveredAt = new Date();
      }
      await order.save({ session });

      return { order, isReplay: false };
    });
  }

  async updateTracking({ reference, actor, courierCompany, trackingNumber }) {
    return this.runTransaction(async (session) => {
      const order = await Order.findOne(this.referenceQuery(reference)).session(session);
      if (!order) throw new AppError('Order not found', 404, ERROR_CODES.ORDER_NOT_FOUND);
      if (order.orderStatus === ORDER_STATUSES.CANCELLED) {
        throw new AppError('Tracking cannot be changed on a cancelled order', 409, ERROR_CODES.ORDER_STATUS_TRANSITION_INVALID);
      }
      const nextCourier = courierCompany === undefined ? order.courierCompany : courierCompany;
      const nextTracking = trackingNumber === undefined ? order.trackingNumber : trackingNumber;
      const isReplay = nextCourier === order.courierCompany && nextTracking === order.trackingNumber;
      if (!isReplay) {
        order.courierCompany = nextCourier;
        order.trackingNumber = nextTracking;
        order.adminNotes.push({ note: 'Shipment tracking updated', addedBy: actor.id });
        await order.save({ session });
      }
      return { order, isReplay };
    });
  }
}

module.exports = new OrderService();
