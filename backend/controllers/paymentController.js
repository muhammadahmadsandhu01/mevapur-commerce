const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const crypto = require('crypto');
const axios = require('axios');
const Order = require('../models/Order');

/**
 * ==========================================
 * Create Stripe Payment Intent
 * POST /api/payments/create-payment-intent
 * ==========================================
 */
exports.createPaymentIntent = async (req, res) => {
  try {

    const {amount, currency = 'pkr', orderId, customerName, customerEmail} = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment amount'
      });
    }

    const paymentIntent = await stripe.paymentIntents.create({

      amount: Math.round(Number(amount) * 100),

      currency,

      automatic_payment_methods: {
        enabled: true
      },

      metadata: {
        source: 'MevaPur',
        orderId: orderId || '',
        customerName: customerName || '',
        customerEmail: customerEmail || ''
    }

    });

    return res.status(200).json({

      success: true,

      clientSecret: paymentIntent.client_secret,

      paymentIntentId: paymentIntent.id

    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({

      success: false,

      message: error.message

    });

  }
};


/**
 * ==========================================
 * Verify Stripe Payment
 * POST /api/payments/verify
 * ==========================================
 */

exports.verifyStripePayment = async (req, res) => {

  try {

    const {

      paymentIntentId

    } = req.body;

    if (!paymentIntentId) {

      return res.status(400).json({

        success: false,

        message: 'Payment Intent ID missing'

      });

    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    return res.json({

      success: true,

      status: paymentIntent.status,

      paymentIntent

    });

  }

  catch (error) {

    console.error(error);

    return res.status(500).json({

      success: false,

      message: error.message

    });

  }

};



/**
 * ==========================================
 * JazzCash Placeholder
 * ==========================================
 */

exports.createJazzCashPayment = async (req, res) => {

  return res.json({

    success: true,

    message: 'JazzCash integration will be added here.'

  });

};