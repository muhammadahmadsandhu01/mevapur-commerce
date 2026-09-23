/**
 * @file checkoutQuoteController.js
 * @description Controller for Checkout Quote and International Route Eligibility.
 */

const CheckoutQuoteService = require('../services/checkout/CheckoutQuoteService');

exports.createQuote = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.user?.id || null;
    const merchantScopeId = req.user?.merchantScopeId || req.query?.merchantScopeId || req.body?.merchantScopeId || 'default';
    let shippingAddress = req.body.shippingAddress;
    if (!shippingAddress && req.body.destination) {
      const dest = req.body.destination;
      const country = (dest.countryCode || dest.country || req.body.destinationCountry || 'PK').toUpperCase();
      const city = dest.city || 'Lahore';
      const defaultProvince = country === 'PK' ? 'Punjab' : (country === 'AE' ? 'Dubai' : city || 'Federal');
      const address = dest.line1 || dest.address || 'Standard Delivery Address';
      shippingAddress = {
        fullName: dest.fullName || 'Valued Customer',
        phone: dest.phone || '+923001234567',
        address,
        addressLine1: address,
        city,
        locality: city,
        province: dest.province || dest.administrativeArea || defaultProvince,
        administrativeArea: dest.province || dest.administrativeArea || defaultProvince,
        postalCode: dest.postalCode || '54000',
        country,
        countryCode: country
      };
    } else if (shippingAddress) {
      const country = (shippingAddress.countryCode || shippingAddress.country || 'PK').toUpperCase();
      const city = shippingAddress.city || 'Lahore';
      const defaultProvince = country === 'PK' ? 'Punjab' : (country === 'AE' ? 'Dubai' : city || 'Federal');
      const address = shippingAddress.address || shippingAddress.addressLine1 || 'Standard Delivery Address';
      shippingAddress = {
        ...shippingAddress,
        fullName: shippingAddress.fullName || 'Valued Customer',
        phone: shippingAddress.phone || '+923001234567',
        address,
        addressLine1: address,
        city,
        locality: city,
        province: shippingAddress.province || shippingAddress.administrativeArea || defaultProvince,
        administrativeArea: shippingAddress.administrativeArea || shippingAddress.province || defaultProvince,
        country,
        countryCode: country
      };
    }

    const quote = await CheckoutQuoteService.generateQuote({
      userId,
      merchantScopeId,
      items: req.body.items,
      shippingAddress,
      currency: req.body.currency,
      couponCode: req.body.couponCode,
      shippingServiceLevel: req.body.shippingServiceLevel,
      shippingAdapter: req.body.shippingAdapter,
      guestVerificationToken: req.body.guestVerificationToken
    });

    res.status(200).json({
      success: true,
      data: {
        quote,
        codEligibility: quote.paymentEligibility?.cod,
        eligiblePaymentMethods: (quote.eligiblePaymentMethods || []).map((m) => m.code)
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
