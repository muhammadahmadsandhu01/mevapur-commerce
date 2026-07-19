const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Create a Payment Intent for Stripe
 * @param {number} amount - Amount in cents (e.g., $10.00 = 1000)
 * @param {string} currency - Currency code (e.g., 'usd', 'pkr')
 * @returns {Promise<Object>} - Client Secret and Payment Intent ID
 */
exports.createPaymentIntent = async (amount, currency = 'usd') => {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount), // Ensure integer
      currency,
      payment_method_types: ['card'],
      metadata: {
        integration_check: 'accept_a_payment',
        store: 'MevaPur'
      }
    });

    return {
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    };
  } catch (error) {
    console.error('Stripe Payment Intent Error:', error);
    throw new Error(`Payment initialization failed: ${error.message}`);
  }
};

/**
 * Verify Payment Status
 * @param {string} paymentIntentId 
 * @returns {Promise<boolean>}
 */
exports.verifyPayment = async (paymentIntentId) => {
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    return paymentIntent.status === 'succeeded';
  } catch (error) {
    console.error('Stripe Verification Error:', error);
    throw new Error('Payment verification failed');
  }
};