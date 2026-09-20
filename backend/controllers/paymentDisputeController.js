/**
 * @file paymentDisputeController.js
 * @description Admin controller for payment disputes and chargeback operations.
 */

'use strict';

const paymentDisputeService = require('../services/payment/PaymentDisputeService');

exports.listDisputes = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const { status, search } = req.query;

    const result = await paymentDisputeService.listDisputes({
      page,
      limit,
      status,
      search
    });

    res.status(200).json({
      success: true,
      data: result.disputes,
      pagination: result.pagination
    });
  } catch (error) {
    next(error);
  }
};

exports.getDispute = async (req, res, next) => {
  try {
    const dispute = await paymentDisputeService.getDispute(req.params.id);
    res.status(200).json({
      success: true,
      data: dispute
    });
  } catch (error) {
    next(error);
  }
};

exports.submitEvidence = async (req, res, next) => {
  try {
    const { trackingNumber, customerCommunication, refundPolicyDisclosure, notes, documents } = req.body;
    const dispute = await paymentDisputeService.submitEvidence(req.params.id, {
      adminId: req.user._id,
      trackingNumber,
      customerCommunication,
      refundPolicyDisclosure,
      notes,
      documents
    });

    res.status(200).json({
      success: true,
      message: 'Dispute evidence submitted successfully',
      data: dispute
    });
  } catch (error) {
    next(error);
  }
};
