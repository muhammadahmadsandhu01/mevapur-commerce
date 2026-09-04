const express = require('express');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');
const controller = require('../controllers/accountController');
const schemas = require('../validators/customerCommerceValidator');
const ERROR_CODES = require('../constants/errorCodes');

const router = express.Router();
const checked = (schema, source = 'body') => validate(schema, { source, code: ERROR_CODES.CUSTOMER_VALIDATION_FAILED });

router.get('/reviews/product/:productId', checked(schemas.productParam, 'params'), checked(schemas.pagination, 'query'), controller.listPublicReviews);
router.use(protect);
router.get('/profile', controller.getProfile); router.patch('/profile', checked(schemas.profileSchema), controller.updateProfile);
router.get('/addresses', controller.listAddresses); router.post('/addresses', checked(schemas.addressBody), controller.createAddress); router.patch('/addresses/:id', checked(schemas.idParam, 'params'), checked(schemas.addressUpdateSchema), controller.updateAddress); router.delete('/addresses/:id', checked(schemas.idParam, 'params'), controller.deleteAddress);
router.get('/wishlist', controller.listWishlist); router.post('/wishlist/:productId', checked(schemas.productParam, 'params'), controller.addWishlist); router.delete('/wishlist/:productId', checked(schemas.productParam, 'params'), controller.removeWishlist);
router.get('/reviews', checked(schemas.pagination, 'query'), controller.listMyReviews);
router.post('/reviews', checked(schemas.reviewSubmitSchema), controller.submitReview); router.patch('/reviews/:id', checked(schemas.idParam, 'params'), checked(schemas.reviewUpdateSchema), controller.updateReview); router.delete('/reviews/:id', checked(schemas.idParam, 'params'), controller.deleteReview);
router.get('/returns', checked(schemas.pagination, 'query'), controller.listReturns); router.post('/returns', checked(schemas.returnRequestSchema), controller.requestReturn); router.get('/refunds', checked(schemas.pagination, 'query'), controller.listRefunds);
router.get('/orders/:id/invoice', checked(schemas.idParam, 'params'), controller.invoice); router.get('/orders/:id/tracking', checked(schemas.idParam, 'params'), controller.tracking);
router.get('/notifications', checked(schemas.pagination, 'query'), controller.notifications); router.put('/notifications/mark-all-read', controller.markAllNotificationsRead); router.put('/notifications/:id/read', checked(schemas.idParam, 'params'), controller.markNotificationRead);

module.exports = router;
