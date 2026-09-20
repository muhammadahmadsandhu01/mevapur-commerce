/**
 * @file financeReconciliationController.js
 * @description Admin controller for financial reconciliation auditing and reports.
 */

'use strict';

const financeReconciliationService = require('../services/finance/FinanceReconciliationService');

exports.reconcilePayment = async (req, res, next) => {
  try {
    const report = await financeReconciliationService.reconcilePayment(req.params.paymentId);
    res.status(200).json({
      success: true,
      data: report
    });
  } catch (error) {
    next(error);
  }
};

exports.reconcilePeriod = async (req, res, next) => {
  try {
    const { startDate, endDate, currency } = req.query;
    const report = await financeReconciliationService.reconcilePeriod({
      startDate,
      endDate,
      currency
    });

    res.status(200).json({
      success: true,
      data: report
    });
  } catch (error) {
    next(error);
  }
};
