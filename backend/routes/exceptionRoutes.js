/**
 * @file exceptionRoutes.js
 * @description Admin Exception Queue Routes for Phase 8.
 */

'use strict';

const express = require('express');
const { protect, admin } = require('../middleware/auth');
const controller = require('../controllers/exceptionController');

const router = express.Router();

router.use(protect, admin);

router.get('/export', controller.exportExceptionsCsv);
router.get('/', controller.listExceptions);
router.get('/:id', controller.getExceptionById);
router.post('/:id/acknowledge', controller.acknowledgeException);
router.post('/:id/assign', controller.assignException);
router.post('/:id/escalate', controller.escalateException);
router.post('/:id/resolve', controller.resolveException);
router.post('/:id/retry', controller.retryException);

module.exports = router;
