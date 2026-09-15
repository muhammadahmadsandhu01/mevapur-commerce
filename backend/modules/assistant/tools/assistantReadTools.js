const mongoose = require('mongoose');
const Product = require('../../../models/Product');
const Order = require('../../../models/Order');
const Payment = require('../../../models/Payment');
const Refund = require('../../../models/Refund');
const ProductVisibilityPolicy = require('../../../services/product/ProductVisibilityPolicy');
const MarketService = require('../../../services/MarketService');
const MarketPriceBook = require('../../../models/MarketPriceBook');

const MAX_RESULT_ITEMS = 5;
const QUERY_TIMEOUT_MS = 2500;
const SAFE_SEARCH = /^[\p{L}\p{N}\s\-']{2,80}$/u;

const safeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const assertUserId = (userId) => {
  if (!mongoose.isValidObjectId(userId)) {
    throw new Error('ASSISTANT_AUTH_CONTEXT_INVALID');
  }
};

const resolveTargetMarket = async (marketCountry, market) => {
  const explicit = (marketCountry || market || '').trim().toUpperCase();
  if (explicit && /^[A-Z]{2}$/.test(explicit)) {
    return explicit;
  }
  try {
    const config = await MarketService.getConfig();
    return (config.merchantCountry || config.homeCountry || 'PK').toUpperCase();
  } catch {
    return 'PK';
  }
};

const searchPublicProducts = async ({ query, marketCountry, market }) => {
  const targetMarket = await resolveTargetMarket(marketCountry, market);
  const normalized = String(query || '').trim();
  if (!SAFE_SEARCH.test(normalized)) {
    throw new Error('ASSISTANT_PRODUCT_SEARCH_INVALID');
  }
  const pattern = new RegExp(safeRegex(normalized), 'i');
  const visibilityFilter = await ProductVisibilityPolicy.getPublicProductQueryFilter({
    marketCountry: targetMarket
  });
  const products = await Product.find({
    ...visibilityFilter,
    $and: [
      {
        $or: [
          { name: pattern },
          { shortDescription: pattern },
          { description: pattern }
        ]
      }
    ]
  })
    .select('name slug shortDescription price stock primaryImage rating')
    .limit(MAX_RESULT_ITEMS)
    .maxTimeMS(QUERY_TIMEOUT_MS)
    .lean();

  const now = new Date();
  const priceDocs = await MarketPriceBook.find({
    marketCountry: targetMarket,
    productId: { $in: products.map((p) => p._id) },
    scopeType: 'product',
    status: 'active',
    effectiveFrom: { $lte: now },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gte: now } }]
  }).lean();

  const priceMap = new Map();
  for (const doc of priceDocs) {
    priceMap.set(String(doc.productId), doc);
  }

  return products.map((product) => {
    const mp = priceMap.get(String(product._id));
    const price = mp ? (Number(mp.amountMinor) / (10 ** (mp.currencyExponent || 2))) : product.price;
    return {
      id: String(product._id),
      name: product.name,
      slug: product.slug,
      shortDescription: product.shortDescription,
      price,
      currency: mp?.currency || 'PKR',
      inStock: Number(product.stock) > 0,
      primaryImage: product.primaryImage,
      rating: product.rating
    };
  });
};

const getPublicProductDetails = async ({ productId, marketCountry, market }) => {
  const targetMarket = await resolveTargetMarket(marketCountry, market);
  if (!mongoose.isValidObjectId(productId)) {
    throw new Error('ASSISTANT_PRODUCT_ID_INVALID');
  }
  const product = await Product.findOne({
    _id: productId,
    isActive: true,
    status: 'published'
  })
    .select('name slug shortDescription description price stock primaryImage rating category subcategory isActive status')
    .maxTimeMS(QUERY_TIMEOUT_MS)
    .lean();

  if (!product) return null;

  const isEligible = await ProductVisibilityPolicy.isProductPubliclyEligible(product, {
    marketCountry: targetMarket
  });
  if (!isEligible) return null;

  const now = new Date();
  const marketPrice = await MarketPriceBook.findOne({
    marketCountry: targetMarket,
    productId: product._id,
    scopeType: 'product',
    status: 'active',
    effectiveFrom: { $lte: now },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gte: now } }]
  }).lean();

  const price = marketPrice
    ? (Number(marketPrice.amountMinor) / (10 ** (marketPrice.currencyExponent || 2)))
    : product.price;

  return {
    id: String(product._id),
    name: product.name,
    slug: product.slug,
    shortDescription: product.shortDescription,
    description: String(product.description || '').slice(0, 500),
    price,
    currency: marketPrice?.currency || 'PKR',
    inStock: Number(product.stock) > 0,
    primaryImage: product.primaryImage,
    rating: product.rating
  };
};

const getCurrentCustomerOrders = async ({ userId }) => {
  assertUserId(userId);
  return Order.find({ user: userId })
    .select('orderId orderStatus paymentStatus paymentMethod totalAmount createdAt')
    .sort({ createdAt: -1 })
    .limit(MAX_RESULT_ITEMS)
    .maxTimeMS(QUERY_TIMEOUT_MS)
    .lean();
};

const getCurrentCustomerOrderStatus = async ({ userId, orderId }) => {
  assertUserId(userId);
  const normalizedOrderId = String(orderId || '').trim();
  if (!normalizedOrderId) {
    throw new Error('ASSISTANT_ORDER_ID_REQUIRED');
  }

  const query = { user: userId };
  if (mongoose.isValidObjectId(normalizedOrderId)) {
    query.$or = [{ _id: normalizedOrderId }, { orderId: normalizedOrderId }];
  } else {
    query.orderId = normalizedOrderId;
  }

  const order = await Order.findOne(query)
    .select('orderId orderStatus paymentStatus paymentMethod totalAmount shippingAddress trackingNumber estimatedDelivery createdAt')
    .maxTimeMS(QUERY_TIMEOUT_MS)
    .lean();

  if (!order) {
    return null;
  }

  return {
    id: String(order._id),
    orderId: order.orderId,
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    totalAmount: order.totalAmount,
    trackingNumber: order.trackingNumber || null,
    estimatedDelivery: order.estimatedDelivery || null,
    createdAt: order.createdAt
  };
};

const getCurrentCustomerPaymentStatus = async ({ userId }) => {
  assertUserId(userId);
  return Payment.find({ user: userId })
    .select('order provider status amount currency customerReferenceMasked createdAt')
    .sort({ createdAt: -1 })
    .limit(MAX_RESULT_ITEMS)
    .maxTimeMS(QUERY_TIMEOUT_MS)
    .lean();
};

const getCurrentCustomerRefundStatus = async ({ userId }) => {
  assertUserId(userId);
  return Refund.find({ customer: userId })
    .select('refundNumber order provider status amount currency createdAt')
    .sort({ createdAt: -1 })
    .limit(MAX_RESULT_ITEMS)
    .maxTimeMS(QUERY_TIMEOUT_MS)
    .lean();
};

const aggregateBy = async (Model, field, match = {}) => Model.aggregate([
  { $match: match },
  { $group: { _id: `$${field}`, count: { $sum: 1 } } },
  { $sort: { count: -1, _id: 1 } },
  { $limit: 20 }
]).option({ maxTimeMS: QUERY_TIMEOUT_MS });

const getProductSummary = async () => {
  const [total, active, outOfStock] = await Promise.all([
    Product.countDocuments({}).maxTimeMS(QUERY_TIMEOUT_MS),
    Product.countDocuments({ isActive: true }).maxTimeMS(QUERY_TIMEOUT_MS),
    Product.countDocuments({ isActive: true, stock: { $lte: 0 } })
      .maxTimeMS(QUERY_TIMEOUT_MS)
  ]);
  return { total, active, outOfStock };
};

const getInventorySummary = async () => {
  const [summary] = await Product.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: null,
        productCount: { $sum: 1 },
        totalUnits: { $sum: '$stock' },
        lowStockCount: {
          $sum: { $cond: [{ $lte: ['$stock', '$lowStockThreshold'] }, 1, 0] }
        }
      }
    },
    { $project: { _id: 0 } }
  ]).option({ maxTimeMS: QUERY_TIMEOUT_MS });
  return summary || { productCount: 0, totalUnits: 0, lowStockCount: 0 };
};

const getLowStockSummary = async () => Product.find({
  isActive: true,
  $expr: { $lte: ['$stock', '$lowStockThreshold'] }
})
  .select('name sku stock lowStockThreshold')
  .sort({ stock: 1, name: 1 })
  .limit(MAX_RESULT_ITEMS)
  .maxTimeMS(QUERY_TIMEOUT_MS)
  .lean();

const getOrderStatusSummary = async () => aggregateBy(Order, 'orderStatus');
const getPaymentStatusSummary = async () => aggregateBy(Payment, 'status');
const getManualPaymentQueueSummary = async () => aggregateBy(
  Payment,
  'status',
  { paymentType: 'manual', status: 'Pending' }
);
const getRefundSummary = async () => aggregateBy(Refund, 'status');

const getProviderAvailabilitySummary = async () => {
  const providers = [
    ['cod', 'PAYMENT_PROVIDER_COD_ENABLED'],
    ['bank_transfer', 'PAYMENT_PROVIDER_BANK_TRANSFER_ENABLED'],
    ['raast', 'PAYMENT_PROVIDER_RAAST_ENABLED'],
    ['jazzcash', 'PAYMENT_PROVIDER_JAZZCASH_ENABLED'],
    ['easypaisa', 'PAYMENT_PROVIDER_EASYPAISA_ENABLED'],
    ['stripe', 'PAYMENT_PROVIDER_STRIPE_ENABLED']
  ];
  const configuredEdition = process.env.PAYMENT_EDITION;
  const edition = ['pakistan', 'international', 'full'].includes(
    configuredEdition
  )
    ? configuredEdition
    : 'pakistan';
  return {
    edition,
    providers: providers.map(([provider, variableName]) => ({
      provider,
      enabled: process.env[variableName] === 'true',
      merchantApprovalRequired: ['jazzcash', 'easypaisa'].includes(provider),
      merchantApproved: provider === 'jazzcash'
        ? process.env.JAZZCASH_OFFICIAL_CONTRACT_APPROVED === 'true'
        : provider === 'easypaisa'
          ? process.env.EASYPAISA_OFFICIAL_CONTRACT_APPROVED === 'true'
          : null
    }))
  };
};

const getCustomerReturnEligibleOrders = async ({ userId }) => {
  assertUserId(userId);
  return Order.find({
    user: userId,
    orderStatus: 'delivered'
  })
    .select('orderId totalAmount items createdAt')
    .sort({ createdAt: -1 })
    .limit(MAX_RESULT_ITEMS)
    .maxTimeMS(QUERY_TIMEOUT_MS)
    .lean();
};

const getCustomerPaymentAuditSummary = async ({ userId }) => {
  assertUserId(userId);
  const [payments, refunds] = await Promise.all([
    Payment.find({ user: userId })
      .select('orderId paymentMethod amount currency status createdAt')
      .sort({ createdAt: -1 })
      .limit(MAX_RESULT_ITEMS)
      .maxTimeMS(QUERY_TIMEOUT_MS)
      .lean(),
    Refund.find({ user: userId })
      .select('refundNumber amount currency status reason createdAt')
      .sort({ createdAt: -1 })
      .limit(MAX_RESULT_ITEMS)
      .maxTimeMS(QUERY_TIMEOUT_MS)
      .lean()
  ]);

  return {
    recentPayments: payments,
    recentRefunds: refunds
  };
};

const TOOL_DEFINITIONS = Object.freeze({
  searchPublicProducts: Object.freeze({
    audience: ['anonymous', 'customer', 'admin'],
    input: '{ query: string(2..80) }',
    readOnly: true
  }),
  getPublicProductDetails: Object.freeze({
    audience: ['anonymous', 'customer', 'admin'],
    input: '{ productId: ObjectId }',
    readOnly: true
  }),
  getCurrentCustomerOrders: Object.freeze({
    audience: ['customer'],
    input: '{ userId: authenticated-context-only }',
    readOnly: true
  }),
  getCurrentCustomerOrderStatus: Object.freeze({
    audience: ['customer'],
    input: '{ userId: authenticated-context-only, orderId: order-number }',
    readOnly: true
  }),
  getCurrentCustomerPaymentStatus: Object.freeze({
    audience: ['customer'],
    input: '{ userId: authenticated-context-only }',
    readOnly: true
  }),
  getCurrentCustomerRefundStatus: Object.freeze({
    audience: ['customer'],
    input: '{ userId: authenticated-context-only }',
    readOnly: true
  }),
  getProductSummary: Object.freeze({
    audience: ['admin'],
    input: '{}',
    readOnly: true
  }),
  getInventorySummary: Object.freeze({
    audience: ['admin'],
    input: '{}',
    readOnly: true
  }),
  getLowStockSummary: Object.freeze({
    audience: ['admin'],
    input: '{}',
    readOnly: true
  }),
  getOrderStatusSummary: Object.freeze({
    audience: ['admin'],
    input: '{}',
    readOnly: true
  }),
  getPaymentStatusSummary: Object.freeze({
    audience: ['admin'],
    input: '{}',
    readOnly: true
  }),
  getManualPaymentQueueSummary: Object.freeze({
    audience: ['admin'],
    input: '{}',
    readOnly: true
  }),
  getRefundSummary: Object.freeze({
    audience: ['admin'],
    input: '{}',
    readOnly: true
  }),
  getProviderAvailabilitySummary: Object.freeze({
    audience: ['admin'],
    input: '{}',
    readOnly: true
  })
});

module.exports = {
  TOOL_DEFINITIONS,
  searchPublicProducts,
  getPublicProductDetails,
  getCurrentCustomerOrders,
  getCurrentCustomerOrderStatus,
  getCurrentCustomerPaymentStatus,
  getCurrentCustomerRefundStatus,
  getProductSummary,
  getInventorySummary,
  getLowStockSummary,
  getOrderStatusSummary,
  getPaymentStatusSummary,
  getManualPaymentQueueSummary,
  getRefundSummary,
  getProviderAvailabilitySummary,
  getCustomerReturnEligibleOrders,
  getCustomerPaymentAuditSummary
};
