const Order = require('../models/Order');
const Return = require('../models/Return');
const InventoryTransaction = require('../models/InventoryTransaction');
const { AppError } = require('../common/errors/AppError');

const historicalReferenceError = (message, code) => new AppError(
  message,
  409,
  code
);

const withSession = (query, session) => (
  session ? query.session(session) : query
);

const assertProductsDeletable = async (productIds, { session = null } = {}) => {
  if (!productIds.length) return;

  const orderReference = await withSession(
    Order.exists({ 'items.product': { $in: productIds } }),
    session
  );
  if (orderReference) {
    throw historicalReferenceError(
      'A product referenced by an order cannot be permanently deleted',
      'PRODUCT_HISTORICAL_ORDER_REFERENCE'
    );
  }

  const returnReference = await withSession(
    Return.exists({ 'items.product': { $in: productIds } }),
    session
  );
  if (returnReference) {
    throw historicalReferenceError(
      'A product referenced by a return cannot be permanently deleted',
      'PRODUCT_HISTORICAL_RETURN_REFERENCE'
    );
  }
  const inventoryReference = await withSession(
    InventoryTransaction.exists({ product: { $in: productIds } }),
    session
  );
  if (inventoryReference) {
    throw historicalReferenceError(
      'A product referenced by inventory history cannot be permanently deleted',
      'PRODUCT_HISTORICAL_INVENTORY_REFERENCE'
    );
  }
};

const assertVariantsRemovable = async (
  productId,
  variantIds,
  { session = null } = {}
) => {
  if (!variantIds.length) return;

  const historicalLine = {
    $elemMatch: {
      product: productId,
      variantId: { $in: variantIds }
    }
  };
  const orderReference = await withSession(
    Order.exists({ items: historicalLine }),
    session
  );
  if (orderReference) {
    throw historicalReferenceError(
      'A product variant referenced by an order cannot be removed',
      'PRODUCT_VARIANT_HISTORICAL_ORDER_REFERENCE'
    );
  }

  const returnReference = await withSession(
    Return.exists({ items: historicalLine }),
    session
  );
  if (returnReference) {
    throw historicalReferenceError(
      'A product variant referenced by a return cannot be removed',
      'PRODUCT_VARIANT_HISTORICAL_RETURN_REFERENCE'
    );
  }

  const inventoryReference = await withSession(
    InventoryTransaction.exists({ product: productId, variantId: { $in: variantIds } }),
    session
  );
  if (inventoryReference) {
    throw historicalReferenceError(
      'A product variant referenced by inventory history cannot be removed',
      'PRODUCT_VARIANT_HISTORICAL_INVENTORY_REFERENCE'
    );
  }
};

module.exports = {
  assertProductsDeletable,
  assertVariantsRemovable
};
