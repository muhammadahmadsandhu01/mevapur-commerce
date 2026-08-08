const mongoose = require('mongoose');
const Return = require('../models/Return');
const Product = require('../models/Product');

/** Restock only from an approved operational return transition, once. */
exports.restockOnce = async (returnId) => {
  const session = await mongoose.startSession();
  try {
    let restocked = false;
    await session.withTransaction(async () => {
      const entry = await Return.findById(returnId).select('+inventoryRestockedAt').session(session);
      if (!entry || entry.inventoryRestockedAt) return;
      for (const item of entry.items) {
        await Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } }, { session });
      }
      entry.inventoryRestockedAt = new Date();
      await entry.save({ session });
      restocked = true;
    });
    return restocked;
  } finally { await session.endSession(); }
};
