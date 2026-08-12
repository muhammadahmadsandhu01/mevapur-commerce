const Product = require('../models/Product');
const InventoryTransaction = require('../models/InventoryTransaction');
const { AppError } = require('../common/errors/AppError');

/**
 * Restore a validated return snapshot inside the caller's refund transaction.
 * This function deliberately has no standalone transaction entry point: stock
 * may only move together with the confirmed refund and Return state changes.
 */
exports.restockInTransaction = async (entry, {
  session,
  adminId,
  refundId
}) => {
  if (!session?.inTransaction?.()) {
    throw new AppError(
      'Return inventory restoration requires an active transaction',
      500,
      'RETURN_TRANSACTION_REQUIRED'
    );
  }
  if (entry.inventoryRestockedAt) return false;

  for (const item of entry.items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new AppError(
        'Return inventory quantity is invalid',
        503,
        'RETURN_REFUND_STATE_UNAVAILABLE'
      );
    }

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
        'Return inventory could not be restored',
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
