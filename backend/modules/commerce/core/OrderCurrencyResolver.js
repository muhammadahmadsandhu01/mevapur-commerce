/**
 * @file OrderCurrencyResolver.js
 * @description Canonical Authoritative Currency Resolver for Orders and Payments.
 *
 * Enforces:
 * 1. Multi-source authoritative consistency across all present persisted fields:
 *    - order.totalAmountExact.currency
 *    - order.subtotalExact.currency
 *    - order.pricingSnapshot.currency
 *    - order.payment.currency
 *    - order.currency
 *    - order.marketSnapshot.baseCurrency / order.marketConfig.baseCurrency
 *    - payment.amountExact.currency
 *    - payment.currency
 * 2. Deterministic fail-closed on any conflicting sources (409 PAYMENT_ORDER_CURRENCY_MISMATCH).
 * 3. Commercial currency validation against CurrencyRegistry (422 PAYMENT_CURRENCY_REQUIRED / 400 REFUND_CURRENCY_UNRESOLVED).
 * 4. Exact-read rollout mode contract verification (500 COMMERCE_ORDER_CURRENCY_MISSING / COMMERCE_PAYMENT_CURRENCY_MISSING).
 * 5. Rejection of un-persisted, client-controlled, or phantom markers.
 * 6. Deterministic fail-closed for unproven missing currency records.
 */

'use strict';

const { AppError } = require('../../../common/errors/AppError');
const CurrencyRegistry = require('../registries/currencyRegistry');
const RolloutAuthority = require('../persistence/RolloutAuthority');

class OrderCurrencyResolver {
  /**
   * Resolves authoritative currency for an Order and/or Payment record.
   * @param {Object} params
   * @param {Object} [params.order] - Persisted Mongoose Order document or snapshot object
   * @param {Object} [params.payment] - Persisted Mongoose Payment document or snapshot object
   * @param {string} [params.context='order'] - Context of resolution ('order', 'payment', 'refund')
   * @returns {string} Normalized 3-letter ISO 4217 uppercase currency code
   */
  static resolve({ order = null, payment = null, context = 'order' } = {}) {
    if (!order && !payment) {
      if (context === 'refund' || context === 'payment') {
        throw new AppError('Payment record is required for currency resolution', 400, 'PAYMENT_NOT_FOUND');
      }
      throw new AppError('Order record is required for currency resolution', 400, 'ORDER_NOT_FOUND');
    }

    const candidateSources = [];

    if (payment) {
      const rawPayment = payment._doc || payment;
      if (rawPayment.amountExact?.currency) {
        candidateSources.push({ name: 'payment.amountExact', value: rawPayment.amountExact.currency });
      }
      if (rawPayment.currency) {
        candidateSources.push({ name: 'payment.currency', value: rawPayment.currency });
      }
    }

    if (order) {
      const rawOrder = order._doc || order;
      if (rawOrder.totalAmountExact?.currency) {
        candidateSources.push({ name: 'order.totalAmountExact', value: rawOrder.totalAmountExact.currency });
      }
      if (rawOrder.subtotalExact?.currency) {
        candidateSources.push({ name: 'order.subtotalExact', value: rawOrder.subtotalExact.currency });
      }
      if (rawOrder.pricingSnapshot?.currency) {
        candidateSources.push({ name: 'order.pricingSnapshot', value: rawOrder.pricingSnapshot.currency });
      }
      if (rawOrder.payment?.currency) {
        candidateSources.push({ name: 'order.payment.currency', value: rawOrder.payment.currency });
      }
      if (rawOrder.currency) {
        candidateSources.push({ name: 'order.currency', value: rawOrder.currency });
      }
      const marketCurr = rawOrder.marketSnapshot?.baseCurrency || rawOrder.marketConfig?.baseCurrency;
      if (marketCurr) {
        candidateSources.push({ name: 'order.marketSnapshot', value: marketCurr });
      }
    }

    const presentCurrencies = candidateSources
      .filter((s) => typeof s.value === 'string' && s.value.trim().length > 0)
      .map((s) => ({ name: s.name, currency: s.value.trim().toUpperCase() }));

    // 1. If present currencies exist, assert they all agree
    if (presentCurrencies.length > 0) {
      const canonicalCurrency = presentCurrencies[0].currency;
      for (let i = 1; i < presentCurrencies.length; i += 1) {
        if (presentCurrencies[i].currency !== canonicalCurrency) {
          if (context === 'refund' || (payment && order)) {
            throw new AppError(
              `Payment currency (${canonicalCurrency}) does not match order currency (${presentCurrencies[i].currency})`,
              409,
              'PAYMENT_ORDER_CURRENCY_MISMATCH'
            );
          }
          throw new AppError(
            `Order currency conflict detected between ${presentCurrencies[0].name} (${canonicalCurrency}) and ${presentCurrencies[i].name} (${presentCurrencies[i].currency})`,
            409,
            'PAYMENT_ORDER_CURRENCY_MISMATCH'
          );
        }
      }

      if (!CurrencyRegistry.has(canonicalCurrency)) {
        if (context === 'refund') {
          throw new AppError(
            `Payment currency '${canonicalCurrency}' is not recognized in CurrencyRegistry`,
            400,
            'REFUND_CURRENCY_UNRESOLVED'
          );
        }
        throw new AppError(
          `Order currency '${canonicalCurrency}' is not recognized in CurrencyRegistry`,
          422,
          'PAYMENT_CURRENCY_REQUIRED'
        );
      }

      // In exact_read mode, verify that the required exact-money contract is satisfied
      const effectiveMode = RolloutAuthority.getRuntimeAuthorizedMode();
      if (effectiveMode === RolloutAuthority.MODES.EXACT_READ) {
        if (context === 'refund' || (payment && !order)) {
          const rawPayment = payment?._doc || payment;
          if (!rawPayment?.amountExact?.currency) {
            throw new AppError(
              'Payment record does not satisfy exact-money contract in exact_read mode',
              500,
              'COMMERCE_PAYMENT_CURRENCY_MISSING'
            );
          }
        } else {
          const rawOrder = order?._doc || order;
          if (!rawOrder?.totalAmountExact?.currency) {
            throw new AppError(
              'Order record does not satisfy exact-money contract in exact_read mode',
              500,
              'COMMERCE_ORDER_CURRENCY_MISSING'
            );
          }
        }
      }

      return canonicalCurrency;
    }

    // 2. No authoritative currency was found -> Evaluate rollout mode
    const effectiveMode = RolloutAuthority.getRuntimeAuthorizedMode();
    if (effectiveMode === RolloutAuthority.MODES.EXACT_READ) {
      if (context === 'refund') {
        throw new AppError(
          'Payment record is missing currency in active rollout mode',
          500,
          'COMMERCE_PAYMENT_CURRENCY_MISSING'
        );
      }
      throw new AppError(
        'Order record is missing authoritative currency in active rollout mode',
        500,
        'COMMERCE_ORDER_CURRENCY_MISSING'
      );
    }

    if (effectiveMode === RolloutAuthority.MODES.SHADOW_WRITE) {
      if (context === 'refund') {
        throw new AppError(
          'Payment record is missing currency in active rollout mode',
          500,
          'COMMERCE_PAYMENT_CURRENCY_MISSING'
        );
      }
      throw new AppError(
        'Order record is missing authoritative currency in active rollout mode',
        500,
        'COMMERCE_ORDER_CURRENCY_MISSING'
      );
    }

    // In legacy mode without authoritative currency, fail closed
    if (context === 'refund') {
      throw new AppError(
        'Unable to authoritatively resolve payment currency for refund',
        400,
        'REFUND_CURRENCY_UNRESOLVED'
      );
    }

    throw new AppError(
      'Unable to authoritatively resolve order currency for payment',
      422,
      'PAYMENT_CURRENCY_REQUIRED'
    );
  }

  /**
   * Resolves order currency using canonical resolver.
   */
  static resolveOrderCurrency(order) {
    return this.resolve({ order, context: 'order' });
  }

  /**
   * Resolves payment currency using canonical resolver with optional linked order.
   */
  static resolvePaymentCurrency(payment, order = null) {
    return this.resolve({ payment, order, context: 'refund' });
  }
}

module.exports = OrderCurrencyResolver;
