const Product = require('../../models/Product');
const { OutOfStockError, NotFoundError } = require('../../errors/AppError');

class InventoryService {
  /**
   * Check and Reserve Stock
   * @description Validates stock availability and decrements it within a transaction.
   * @param {Array} items - Array of { product: ID, quantity: Number }
   * @param {Session} session - MongoDB transaction session
   * @throws {NotFoundError} If product does not exist
   * @throws {OutOfStockError} If stock is insufficient
   */
  async checkAndReserve(items, session) {
    for (const item of items) {
      const product = await Product.findById(item.product).session(session);
      
      if (!product) {
        throw new NotFoundError(`Product ${item.product}`);
      }

      if (!product.isActive) {
        throw new OutOfStockError(product.name, 0, item.quantity); // Treat inactive as 0 stock
      }

      const availableStock = product.stock || 0;
      if (availableStock < item.quantity) {
        throw new OutOfStockError(product.name, availableStock, item.quantity);
      }

      // Reserve stock (decrement immediately within transaction)
      product.stock = availableStock - item.quantity;
      await product.save({ session });
    }
  }

  /**
   * Restore Stock
   * @description Reverts stock decrement on order cancellation/failure.
   * @param {Array} orderItems - Array of ordered items
   * @param {Session} session - MongoDB transaction session
   */
  async restore(orderItems, session) {
    for (const item of orderItems) {
      const product = await Product.findById(item.product).session(session);
      if (product) {
        product.stock += item.quantity;
        await product.save({ session });
      }
    }
  }
}

module.exports = new InventoryService();