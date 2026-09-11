const crypto = require('crypto');
const mongoose = require('mongoose');
const Order = require('../../models/Order');
const Product = require('../../models/Product');
const Payment = require('../../models/Payment');
const CouponService = require('./CouponService');
const ShippingService = require('./ShippingService');
const TaxService = require('./TaxService');
const InventoryService = require('./InventoryService');
const ProductVisibilityPolicy = require('../product/ProductVisibilityPolicy');
const MarketService = require('../MarketService');
const AuditService = require('../AuditService');
const logger = require('../../utils/logger');
const paymentProviderRegistry = require('../../modules/payments/core/providerRegistry');
const { AppError } = require('../../common/errors/AppError');
const ERROR_CODES = require('../../constants/errorCodes');
const {
  ORDER_STATUSES,
  ORDER_TRANSITIONS,
  CUSTOMER_CANCELLABLE_STATUSES,
  ORDER_LIMITS
} = require('../../constants/orderConstants');
const { PAYMENT_STATUSES } = require('../../constants/paymentConstants');
const {
  MoneyMapper,
  RolloutAuthority,
  Address,
  Phone,
  CountryRegistry,
  CurrencyRegistry
} = require('../../modules/commerce');

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
    const activeCategoryIds = await ProductVisibilityPolicy.getActiveCategoryIds({ session });

    for (const item of items) {
      const product = await Product.findById(item.productId).session(session);
      if (!product || !product.isActive || product.status !== 'published') {
        throw new AppError(
          'A selected product is unavailable',
          409,
          ERROR_CODES.ORDER_PRODUCT_UNAVAILABLE
        );
      }

      const isCategoryEligible = await ProductVisibilityPolicy.isProductCategoryEligible(product, {
        session,
        activeCategoryIds
      });
      if (!isCategoryEligible) {
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

const { MoneyMapper, CountryRegistry, Phone, RolloutAuthority } = require('../../modules/commerce');

      const rawPrice = variant
        ? (variant.salePrice > 0 ? variant.salePrice : variant.price)
        : product.price;
      const price = this.roundMoney(rawPrice);
      if (!Number.isFinite(price) || price <= 0) {
        throw new AppError(
          'A selected product has an invalid price',
          409,
          ERROR_CODES.ORDER_PRODUCT_UNAVAILABLE
        );
      }

      const lineTotal = this.roundMoney(price * item.quantity);
      const unitPriceExact = MoneyMapper.fromLegacy(price, 'PKR');
      const lineTotalExact = MoneyMapper.fromLegacy(lineTotal, 'PKR');

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
        unitPriceExact,
        quantity: item.quantity,
        lineTotal,
        lineTotalExact,
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
    let isDeployed = false;
    try {
      const { getRuntimeConfig } = require('../../config/runtime.config');
      isDeployed = Boolean(getRuntimeConfig().isDeployed);
    } catch {
      const candidate = (process.env.APP_ENV || process.env.NODE_ENV || 'development').toLowerCase();
      isDeployed = candidate === 'staging' || candidate === 'production';
    }

    let lastError;

    for (
      let attempt = 1;
      attempt <= ORDER_LIMITS.MAX_TRANSACTION_ATTEMPTS;
      attempt += 1
    ) {
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
        return await work(null, 1);
      }
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

        const jitter = Math.floor(Math.random() * 50) + 25 * attempt;
        await new Promise((resolve) => setTimeout(resolve, jitter));
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

          let countryCode = 'PK';
          if (orderData.shippingAddress.country) {
            const rawCountry = orderData.shippingAddress.country;
            if (rawCountry.toUpperCase() === 'PAKISTAN' || rawCountry.toUpperCase() === 'PK') {
              countryCode = 'PK';
            } else if (CountryRegistry.has(rawCountry)) {
              countryCode = CountryRegistry.get(rawCountry).alpha2;
            } else {
              countryCode = rawCountry;
            }
          }

          let phoneE164 = undefined;
          let phoneExtension = undefined;
          if (orderData.shippingAddress.phone) {
            try {
              const parsedPhone = Phone.parse(orderData.shippingAddress.phone, { defaultCountry: countryCode || 'PK' });
              phoneE164 = parsedPhone.e164;
              phoneExtension = parsedPhone.extension || undefined;
            } catch {
              // Preserve raw phone for compatibility
            }
          }

          const shippingAddress = {
            ...orderData.shippingAddress,
            country: this.normalizeCountry(orderData.shippingAddress.country),
            countryCode,
            administrativeArea: orderData.shippingAddress.province || orderData.shippingAddress.state || '',
            phoneE164,
            phoneExtension
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
            checkoutKey: idempotencyKey,
            currency,
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

          // Exact Money Persistence Snapshots
          const subtotalExact = MoneyMapper.fromLegacy(subtotal, currency);
          const discountExact = MoneyMapper.fromLegacy(coupon.discountAmount, currency);
          const shippingCostExact = MoneyMapper.fromLegacy(shippingCost, currency);
          const taxAmountExact = MoneyMapper.fromLegacy(taxAmount, currency);
          const totalAmountExact = MoneyMapper.fromLegacy(totalAmount, currency);

          const effectiveMode = await MarketService.getEffectiveRolloutMode();
          if (effectiveMode === 'shadow_write' || effectiveMode === 'exact_read') {
            RolloutAuthority.assertWriteParity(subtotal, subtotalExact);
            RolloutAuthority.assertWriteParity(totalAmount, totalAmountExact);
          }

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
            currency,
            subtotalExact,
            discountExact,
            shippingCostExact,
            taxAmountExact,
            totalAmountExact,
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

          if (coupon.checkoutKey) {
            await CouponService.commitRedemption({
              checkoutKey: coupon.checkoutKey,
              orderId: order._id,
              session
            });
          }

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
    customer,
    search,
    startDate,
    endDate,
    sortBy = 'createdAt-desc'
  }) {
    const query = {};
    if (status) query.orderStatus = status;
    if (customer) query.user = customer;
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
        await CouponService.restoreUsage({
          couponSnapshot: order.coupon,
          userId: order.user,
          releaseReason: 'order_cancelled',
          session
        });
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

  async markCodPaid({ reference, actor, adminNote = '' }) {
    return this.runTransaction(async (session) => {
      const order = await Order.findOne(this.referenceQuery(reference)).session(session);
      if (!order) {
        throw new AppError(
          'Order not found',
          404,
          ERROR_CODES.ORDER_NOT_FOUND
        );
      }

      if (String(order.paymentMethod).toLowerCase() !== 'cod') {
        throw new AppError(
          'Only COD orders can have payment status updated manually',
          409,
          ERROR_CODES.ORDER_MANUAL_PAYMENT_FORBIDDEN
        );
      }

      if (order.orderStatus !== ORDER_STATUSES.DELIVERED) {
        throw new AppError(
          'Only delivered orders can have COD payment marked as paid',
          409,
          ERROR_CODES.ORDER_NOT_DELIVERED
        );
      }

      if (order.paymentStatus === 'Paid') {
        return { order, idempotentReplay: true };
      }

      if (order.paymentStatus !== 'Pending') {
        throw new AppError(
          `Order payment status cannot transition from ${order.paymentStatus} to Paid`,
          409,
          ERROR_CODES.PAYMENT_STATUS_TRANSITION_INVALID
        );
      }

      const previousPaymentStatus = order.paymentStatus;
      const sanitizedNote = typeof adminNote === 'string'
        ? adminNote.replace(/[\r\n\x00-\x1F\x7F]+/g, ' ').trim().slice(0, 500)
        : '';

      order.paymentStatus = 'Paid';
      if (!order.payment.paidAt) {
        order.payment.paidAt = new Date();
      }

      if (sanitizedNote) {
        order.adminNotes.push({
          note: sanitizedNote,
          addedBy: actor.id,
          addedAt: new Date()
        });
      }

      const existingPayment = await Payment.findOne({ order: order._id }).session(session);
      if (existingPayment && existingPayment.status !== PAYMENT_STATUSES.COMPLETED) {
        const prevPaymentStatus = existingPayment.status;
        existingPayment.status = PAYMENT_STATUSES.COMPLETED;
        existingPayment.paidAmount = existingPayment.amount;
        existingPayment.collectedBy = actor.id;
        existingPayment.collectedAt = order.payment.paidAt;
        existingPayment.completedAt = order.payment.paidAt;
        if (sanitizedNote) {
          existingPayment.verificationNote = sanitizedNote.slice(0, 300);
        }
        if (Array.isArray(existingPayment.history)) {
          existingPayment.history.push({
            previousStatus: prevPaymentStatus,
            newStatus: PAYMENT_STATUSES.COMPLETED,
            source: 'admin',
            timestamp: new Date()
          });
        }
        await existingPayment.save({ session });
      }

      await order.save({ session });

      logger.orderEvent(
        'ORDER_PAYMENT_STATUS_CHANGED',
        order._id,
        actor.id,
        'COD payment marked as Paid',
        {
          orderId: order._id,
          publicOrderId: order.orderId,
          previousPaymentStatus,
          newPaymentStatus: 'Paid',
          adminId: actor.id,
          timestamp: order.payment.paidAt,
          adminNote: sanitizedNote
        }
      );

      await AuditService.log({
        userId: actor.id,
        eventName: 'PAYMENT.COMPLETED',
        action: 'COD_PAYMENT_COLLECTED',
        status: 'SUCCESS',
        metadata: {
          orderId: String(order._id),
          publicOrderId: order.orderId,
          previousPaymentStatus,
          newPaymentStatus: 'Paid',
          adminId: String(actor.id),
          timestamp: order.payment.paidAt.toISOString(),
          adminNote: sanitizedNote
        }
      }, session);

      return { order, idempotentReplay: false };
    });
  }
}

module.exports = new OrderService();
