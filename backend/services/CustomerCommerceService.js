const User = require('../models/User');
const Product = require('../models/Product');
const Wishlist = require('../models/Wishlist');
const Review = require('../models/Review');
const Return = require('../models/Return');
const Refund = require('../models/Refund');
const Notification = require('../models/Notification');
const Order = require('../models/Order');
const MarketService = require('./MarketService');
const ReturnService = require('./ReturnService');
const ReviewService = require('./ReviewService');
const { AppError } = require('../common/errors/AppError');
const ERROR_CODES = require('../constants/errorCodes');

const customerProfile = (user) => ({
  id: String(user._id), fullName: user.fullName, email: user.email, phone: user.phone || '',
  avatar: user.avatar || '', isVerified: Boolean(user.isVerified), createdAt: user.createdAt
});
const addressView = (address) => ({ id: String(address._id), fullName: address.fullName, phone: address.phone, address: address.address, addressLine2: address.addressLine2 || '', city: address.city, province: address.state || address.province || '', postalCode: address.postalCode || '', country: address.country, isDefault: Boolean(address.isDefault) });
const returnView = (entry) => ({ id: String(entry._id), returnNumber: entry.returnNumber, order: entry.order, items: entry.items.map((item) => ({ product: item.product, name: item.name, quantity: item.quantity, price: item.price, reason: item.reason, reasonDetails: item.reasonDetails || '' })), status: entry.status, refundMethod: entry.refundMethod, refundAmount: entry.refundAmount, customerNotes: entry.customerNotes || '', rejectedReason: entry.rejectedReason || '', createdAt: entry.createdAt, approvedAt: entry.approvedAt || null, refundedAt: entry.refundedAt || null });
const refundView = (entry) => ({ id: String(entry._id), refundNumber: entry.refundNumber, order: entry.order, amount: entry.amount, currency: entry.currency, status: entry.status, reason: entry.reason || '', completedAt: entry.completedAt || null, createdAt: entry.createdAt });
const ownOrder = async (userId, reference) => {
  const references = [{ orderId: reference }];
  if (/^[a-fA-F0-9]{24}$/.test(reference)) references.unshift({ _id: reference });
  const order = await Order.findOne({ user: userId, $or: references });
  if (!order) throw new AppError('Order not found', 404, ERROR_CODES.ORDER_NOT_FOUND);
  return order;
};

class CustomerCommerceService {
  async getProfile(userId) { return customerProfile(await User.findById(userId)); }
  async updateProfile(userId, input) {
    const user = await User.findById(userId);
    if (!user) throw new AppError('User not found', 404, ERROR_CODES.USER_NOT_FOUND);
    if (input.fullName !== undefined) user.fullName = input.fullName;
    if (input.phone !== undefined) user.phone = input.phone;
    if (input.avatar !== undefined) user.avatar = input.avatar;
    await user.save();
    return customerProfile(user);
  }

  async listAddresses(userId) { const user = await User.findById(userId); return (user?.addresses || []).map(addressView); }
  async assertEligibleCountry(country) { const market = await MarketService.getConfig(); await MarketService.assertEligible({ country, currency: market.defaultCurrency }); }
  async createAddress(userId, input) {
    await this.assertEligibleCountry(input.country);
    const user = await User.findById(userId);
    if (!user) throw new AppError('User not found', 404, ERROR_CODES.USER_NOT_FOUND);
    if (input.isDefault || user.addresses.length === 0) user.addresses.forEach((address) => { address.isDefault = false; });
    user.addresses.push({ fullName: input.fullName, phone: input.phone, address: input.address, addressLine2: input.addressLine2 || '', city: input.city, state: input.province, postalCode: input.postalCode || '', country: input.country, isDefault: input.isDefault || user.addresses.length === 0 });
    await user.save(); return addressView(user.addresses[user.addresses.length - 1]);
  }
  async updateAddress(userId, addressId, input) {
    if (input.country) await this.assertEligibleCountry(input.country);
    const user = await User.findById(userId); const address = user?.addresses.id(addressId);
    if (!address) throw new AppError('Address not found', 404, ERROR_CODES.CUSTOMER_ADDRESS_NOT_FOUND);
    Object.assign(address, { ...(input.fullName !== undefined && { fullName: input.fullName }), ...(input.phone !== undefined && { phone: input.phone }), ...(input.address !== undefined && { address: input.address }), ...(input.addressLine2 !== undefined && { addressLine2: input.addressLine2 }), ...(input.city !== undefined && { city: input.city }), ...(input.province !== undefined && { state: input.province }), ...(input.postalCode !== undefined && { postalCode: input.postalCode }), ...(input.country !== undefined && { country: input.country }) });
    if (input.isDefault) { user.addresses.forEach((entry) => { entry.isDefault = String(entry._id) === String(address._id); }); }
    await user.save(); return addressView(address);
  }
  async deleteAddress(userId, addressId) {
    const user = await User.findById(userId); const address = user?.addresses.id(addressId);
    if (!address) throw new AppError('Address not found', 404, ERROR_CODES.CUSTOMER_ADDRESS_NOT_FOUND);
    const wasDefault = address.isDefault; address.deleteOne();
    if (wasDefault && user.addresses.length) user.addresses[0].isDefault = true;
    await user.save();
  }

  async listWishlist(userId) {
    return Wishlist.find({ user: userId })
      .populate({ path: 'product', match: { isActive: true }, select: 'name slug price salePrice images stock variants attributes' })
      .sort({ createdAt: -1 })
      .then((items) => items.filter((item) => item.product).map((item) => ({
        id: String(item._id),
        product: {
          _id: item.product._id,
          id: String(item.product._id),
          name: item.product.name,
          slug: item.product.slug,
          price: item.product.price,
          salePrice: item.product.salePrice,
          images: item.product.images || [],
          stock: item.product.stock,
          hasVariants: Boolean(item.product.variants && item.product.variants.length > 0),
          variants: item.product.variants || [],
          attributes: item.product.attributes || []
        }
      })));
  }
  async addWishlist(userId, productId) {
    const product = await Product.findOne({ _id: productId, isActive: true });
    if (!product) throw new AppError('Product is unavailable', 404, ERROR_CODES.ORDER_PRODUCT_UNAVAILABLE);
    try { const item = await Wishlist.findOneAndUpdate({ user: userId, product: productId }, { $setOnInsert: { user: userId, product: productId } }, { new: true, upsert: true, setDefaultsOnInsert: true }); return { id: String(item._id), product }; }
    catch (error) { if (error?.code === 11000) return this.addWishlist(userId, productId); throw error; }
  }
  async removeWishlist(userId, productId) { const result = await Wishlist.deleteOne({ user: userId, product: productId }); if (!result.deletedCount) throw new AppError('Wishlist item not found', 404, ERROR_CODES.CUSTOMER_WISHLIST_NOT_FOUND); }

  async listMyReviews(userId, query = {}) {
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 12, 50);
    const skip = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      Review.find({ user: userId })
        .populate({
          path: 'product',
          select: 'name slug price salePrice images stock hasVariants variants attributes isActive'
        })
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit),
      Review.countDocuments({ user: userId })
    ]);

    const reviewView = (entry) => ({
      id: String(entry._id),
      product: entry.product ? {
        id: String(entry.product._id || entry.product),
        name: entry.product.name || 'Unavailable Product',
        slug: entry.product.slug || '',
        price: entry.product.price,
        salePrice: entry.product.salePrice,
        images: entry.product.images || [],
        stock: entry.product.stock,
        hasVariants: Boolean(entry.product.hasVariants),
        variants: entry.product.variants || [],
        attributes: entry.product.attributes || [],
        isActive: Boolean(entry.product.isActive)
      } : null,
      rating: entry.rating,
      title: entry.title || '',
      comment: entry.comment,
      status: entry.status,
      isVerifiedPurchase: Boolean(entry.isVerifiedPurchase),
      adminReply: entry.adminReply || '',
      repliedAt: entry.repliedAt || null,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt
    });

    return {
      reviews: reviews.map(reviewView),
      total,
      page,
      limit
    };
  }

  async listPublicReviews(productId, query) {
    return await ReviewService.listPublicReviews(productId, query);
  }
  async submitReview(userId, input) {
    return await ReviewService.submitReview({
      userId,
      productId: input.productId,
      rating: input.rating,
      title: input.title,
      comment: input.comment
    });
  }
  async updateReview(userId, reviewId, input) {
    return await ReviewService.updateCustomerReview({
      userId,
      reviewId,
      rating: input.rating,
      title: input.title,
      comment: input.comment
    });
  }
  async deleteReview(userId, reviewId) {
    await ReviewService.withdrawCustomerReview({ userId, reviewId });
  }

  async listReturns(userId, query) { const result = await Return.find({ customer: userId }).sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit); return { returns: result.map(returnView), total: await Return.countDocuments({ customer: userId }) }; }
  async requestReturn(userId, input) {
    return ReturnService.requestCustomerReturn(userId, input);
  }
  async listRefunds(userId, query) { const items = await Refund.find({ customer: userId }).select('refundNumber order amount currency status reason completedAt createdAt').sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit); return { refunds: items.map(refundView), total: await Refund.countDocuments({ customer: userId }) }; }

  async invoice(userId, reference) { const order = await ownOrder(userId, reference); return { orderNumber: order.orderId, date: order.createdAt, customer: { fullName: order.shippingAddress.fullName }, shippingAddress: order.shippingAddress, items: order.items.map((item) => ({ name: item.name, sku: item.sku, quantity: item.quantity, unitPrice: item.price, lineTotal: item.lineTotal })), subtotal: order.subtotal, discount: order.discount, shipping: order.shippingCost, tax: order.taxAmount, total: order.totalAmount, currency: order.payment.currency, paymentMethod: order.paymentMethod, paymentStatus: order.paymentStatus }; }
  async tracking(userId, reference) { const order = await ownOrder(userId, reference); return { orderNumber: order.orderId, orderStatus: order.orderStatus, timeline: order.statusTimeline.map((entry) => ({ status: entry.status, timestamp: entry.timestamp, note: entry.note || '' })), courierCompany: order.courierCompany || '', trackingNumber: order.trackingNumber || '' }; }
  async listNotifications(userId, query) { const notifications = await Notification.find({ recipient: userId }).select('type title message isRead priority actionUrl createdAt').sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit); return { notifications, total: await Notification.countDocuments({ recipient: userId }), unreadCount: await Notification.countDocuments({ recipient: userId, isRead: false }) }; }
  async markNotificationRead(userId, notificationId) { const result = await Notification.findOneAndUpdate({ _id: notificationId, recipient: userId }, { $set: { isRead: true } }, { new: true }); if (!result) throw new AppError('Notification not found', 404, ERROR_CODES.CUSTOMER_NOTIFICATION_NOT_FOUND); return result; }
  async markAllNotificationsRead(userId) { await Notification.updateMany({ recipient: userId, isRead: false }, { $set: { isRead: true } }); }
}

module.exports = new CustomerCommerceService();
