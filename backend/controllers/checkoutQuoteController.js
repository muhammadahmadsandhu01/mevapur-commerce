/**
 * @file checkoutQuoteController.js
 * @description Controller for Checkout Quote and International Route Eligibility.
 */

const CheckoutQuoteService = require('../services/checkout/CheckoutQuoteService');

exports.createQuote = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.user?.id || null;
    const quote = await CheckoutQuoteService.generateQuote({
      userId,
      items: req.body.items,
      shippingAddress: req.body.shippingAddress,
      currency: req.body.currency,
      couponCode: req.body.couponCode,
      shippingServiceLevel: req.body.shippingServiceLevel,
      shippingAdapter: req.body.shippingAdapter
    });

    res.status(200).json({
      success: true,
      data: {
        quote
      },
      meta: {
        requestId: req.id || undefined
      }
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'test' && !error.isOperational) {
      console.error('QUOTE_CONTROLLER_UNHANDLED_ERROR:', error);
    }
    next(error);
  }
};

exports.verifyQuote = async (req, res, next) => {
  try {
    const { quote } = req.body;
    const isValid = CheckoutQuoteService.verifyQuoteIntegrity(quote);

    res.status(200).json({
      success: true,
      data: {
        valid: isValid,
        quoteId: quote?.quoteId
      }
    });
  } catch (error) {
    next(error);
  }
};
