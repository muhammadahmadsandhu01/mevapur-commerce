const Product = require('../models/Product');
const InventoryTransaction = require('../models/InventoryTransaction');
const { AppError } = require('../common/errors/AppError');

const assertTransaction = (session) => {
  if (!session?.inTransaction?.()) {
    throw new AppError(
      'Return inventory restoration requires an active transaction',
      500,
      'RETURN_TRANSACTION_REQUIRED'
    );
  }
};

const assertQuantity = (item) => {
  if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
    throw new AppError(
      'Return inventory quantity is invalid',
      503,
      'RETURN_REFUND_STATE_UNAVAILABLE'
    );
  }
};

const assertRestockableInTransaction = async (entry, { session }) => {
  assertTransaction(session);
  if (entry.inventoryRestockedAt) return false;

  for (const item of entry.items) {
    assertQuantity(item);
    const product = await Product.findById(item.product)
      .select('stock variants._id variants.stock')
      .session(session);
    if (!product) {
      throw new AppError(
        'The historical return product no longer exists',
        409,
        'RETURN_INVENTORY_PRODUCT_MISSING'
      );
    }
    if (item.variantId && !product.variants.id(item.variantId)) {
      throw new AppError(
        'The historical return variant no longer exists',
        409,
        'RETURN_INVENTORY_VARIANT_MISSING'
      );
    }
  }
  return true;
};

/**
 * Restore a validated return snapshot inside the caller's refund transaction.
 * This function deliberately has no standalone transaction entry point: stock
 * may only move together with the confirmed refund and Return state changes.
 */
const restockInTransaction = async (entry, {
  session,
  adminId,
  refundId
}) => {
  assertTransaction(session);
  if (entry.inventoryRestockedAt) return false;

  // Validate every historical reference before the first stock write so a
  // missing later line can never commit a partial restock.
  await assertRestockableInTransaction(entry, { session });

  for (const item of entry.items) {
    const query = { _id: item.product };
    const increment = {};
    if (item.variantId) {
      query['variants._id'] = item.variantId;
      increment['variants.$.stock'] = item.quantity;
      if (item.isDefaultVariant) increment.stock = item.quantity;
    } else {
      increment.stock = item.quantity;
    }

    const productBefore = await Product.findOneAndUpdate(
      query,
      { $inc: increment },
      { session, new: false }
    );
    if (!productBefore) {
      throw new AppError(
        'Return inventory changed while it was being restored',
        503,
        'RETURN_REFUND_STATE_UNAVAILABLE'
      );
    }

    const previousStock = item.variantId
      ? productBefore.variants.id(item.variantId).stock
      : productBefore.stock;
    await InventoryTransaction.create([{
      product: item.product,
      variantId: item.variantId || null,
      order: entry.order,
      operationKey: `${entry._id}:${item.orderLineKey}:return`,
      type: 'return',
      quantity: item.quantity,
      previousStock,
      newStock: previousStock + item.quantity,
      reason: 'Stock restored after confirmed return refund',
      reference: entry.returnNumber,
      performedBy: adminId,
      metadata: {
        returnId: String(entry._id),
        refundId: String(refundId)
      }
    }], { session });
  }

  entry.inventoryRestockedAt = new Date();
  return true;
};

module.exports = {
  assertRestockableInTransaction,
  restockInTransaction
};
