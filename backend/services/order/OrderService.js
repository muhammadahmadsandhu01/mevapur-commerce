const mongoose = require('mongoose');
const Order = require('../../models/Order');
const Product = require('../../models/Product');

// Import Local Services from the SAME folder
const CouponService = require('./CouponService');
const ShippingService = require('./ShippingService');
const TaxService = require('./TaxService');
const InventoryService = require('./InventoryService');

class OrderService {
  async createOrder(userId, orderData) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { items, shippingAddress, paymentMethod, couponCode, notes } = orderData;

      // 1. Calculate Subtotal (Server-Side from DB Prices)
      let subtotal = 0;
      const processedItems = [];

      for (const item of items) {
        const product = await Product.findById(item.product).session(session);
        if (!product) throw new Error(`Product not found: ${item.product}`);
        
        const price = product.price; // Always take current price from DB
        subtotal += price * item.quantity;

        processedItems.push({
          product: product._id,
          name: product.name,
          price: price,
          quantity: item.quantity,
          image: product.image || '',
          sku: product.sku || ''
        });
      }

      // 2. Validate & Calculate Coupon
      const couponResult = await CouponService.validateAndCalculate(couponCode, subtotal);
      const discountAmount = couponResult.discountAmount;
      const afterDiscount = subtotal - discountAmount;

      // 3. Calculate Shipping
      const shippingCost = ShippingService.calculate(shippingAddress, afterDiscount);

      // 4. Calculate Tax
      const taxAmount = TaxService.calculate(afterDiscount, shippingAddress);

      // 5. Grand Total
      const grandTotal = afterDiscount + shippingCost + taxAmount;

      // 6. Check & Reserve Stock
      await InventoryService.checkAndReserve(items, session);

      // 7. Create Order Record
      const orderDoc = {
        user: userId,
        items: processedItems,
        shippingAddress,
        paymentMethod,
        paymentStatus: paymentMethod === 'COD' ? 'Pending' : 'Paid', // Adjust based on actual payment flow
        payment: {
          provider: paymentMethod === 'COD' ? 'COD' : paymentMethod === 'jazzcash' ? 'JazzCash' : 'Stripe',
          currency: 'PKR',
          paidAt: paymentMethod === 'COD' ? null : new Date()
        },
        subtotal,
        shippingCost,
        discount: discountAmount,
        totalAmount: grandTotal,
        notes: notes || '',
        orderStatus: 'Pending',
        statusTimeline: [{
          status: 'Pending',
          timestamp: Date.now(),
          note: 'Order placed successfully'
        }]
      };

      if (couponResult.appliedCoupon) {
        orderDoc.coupon = couponResult.appliedCoupon;
      }

      const [order] = await Order.create([orderDoc], { session });

      // 8. Update Coupon Usage
      if (couponResult.appliedCoupon) {
        await CouponService.incrementUsage(couponResult.appliedCoupon, session);
      }

      await session.commitTransaction();
      session.endSession();

      return order;

    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  }
}

module.exports = new OrderService();