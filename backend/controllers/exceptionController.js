/**
 * @file exceptionController.js
 * @description Admin Exception Management Controller for Phase 8.
 * Provides endpoints for exception queue listings, lifecycle mutations,
 * details inspection, retry actions, and formula-safe CSV export.
 */

'use strict';

const exceptionQueueService = require('../services/exception/ExceptionQueueService');

exports.listExceptions = async (req, res, next) => {
  try {
    const result = await exceptionQueueService.listExceptions(req.query);
    res.status(200).json({
      success: true,
      data: result.exceptions,
      pagination: result.pagination,
      metrics: result.metrics
    });
  } catch (error) {
    next(error);
  }
};

exports.getExceptionById = async (req, res, next) => {
  try {
    const exception = await exceptionQueueService.getExceptionById(req.params.id);
    res.status(200).json({
      success: true,
      data: { exception }
    });
  } catch (error) {
    next(error);
  }
};

exports.acknowledgeException = async (req, res, next) => {
  try {
    const exception = await exceptionQueueService.acknowledgeException(req.params.id, req.user.id, { req });
    res.status(200).json({
      success: true,
      message: 'Exception acknowledged',
      data: { exception }
    });
  } catch (error) {
    next(error);
  }
};

exports.assignException = async (req, res, next) => {
  try {
    const { assignedTo } = req.body;
    const exception = await exceptionQueueService.assignException(req.params.id, assignedTo, req.user.id, { req });
    res.status(200).json({
      success: true,
      message: 'Exception assigned',
      data: { exception }
    });
  } catch (error) {
    next(error);
  }
};

exports.escalateException = async (req, res, next) => {
  try {
    const { escalatedTo, reason } = req.body;
    const exception = await exceptionQueueService.escalateException(req.params.id, { escalatedTo, reason }, req.user.id, { req });
    res.status(200).json({
      success: true,
      message: 'Exception escalated',
      data: { exception }
    });
  } catch (error) {
    next(error);
  }
};

exports.resolveException = async (req, res, next) => {
  try {
    const { resolutionReason, resolutionCode } = req.body;
    const exception = await exceptionQueueService.resolveException(req.params.id, { resolutionReason, resolutionCode }, req.user.id, { req });
    res.status(200).json({
      success: true,
      message: 'Exception resolved',
      data: { exception }
    });
  } catch (error) {
    next(error);
  }
};

exports.retryException = async (req, res, next) => {
  try {
    const result = await exceptionQueueService.retryException(req.params.id, req.user.id, { req });
    res.status(200).json({
      success: true,
      message: 'Exception retry initiated',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

exports.exportExceptionsCsv = async (req, res, next) => {
  try {
    const csv = await exceptionQueueService.exportCsv(req.query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="exceptions-export-${Date.now()}.csv"`);
    res.status(200).send(csv);
  } catch (error) {
    next(error);
  }
};
