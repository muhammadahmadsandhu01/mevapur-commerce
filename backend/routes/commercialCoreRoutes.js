const express = require('express');
const { protect, admin } = require('../middleware/auth');
const validate = require('../middleware/validate');
const controller = require('../controllers/commercialCoreController');
const ERROR_CODES = require('../constants/errorCodes');
const { marketSchema, shippingZoneSchema, quoteSchema } = require('../validators/commercialCoreValidator');
const mongoose = require('mongoose');
const { z } = require('zod');

const router = express.Router();
const validation = (schema, source = 'body') => validate(schema, { source, code: ERROR_CODES.COMMERCIAL_CORE_VALIDATION_FAILED });
const zoneIdSchema = z.object({ id: z.string().refine((value) => mongoose.isObjectIdOrHexString(value), 'A valid shipping zone identifier is required') }).strict();

router.get('/market', controller.getMarket);
router.get('/shipping/quote', validation(quoteSchema, 'query'), controller.quoteShipping);
router.get('/shipping/zones', protect, admin, controller.listZones);
router.put('/market', protect, admin, validation(marketSchema), controller.updateMarket);
router.post('/shipping/zones', protect, admin, validation(shippingZoneSchema), controller.createZone);
router.put('/shipping/zones/:id', protect, admin, validation(zoneIdSchema, 'params'), validation(shippingZoneSchema), controller.updateZone);
router.delete('/shipping/zones/:id', protect, admin, validation(zoneIdSchema, 'params'), controller.deleteZone);

module.exports = router;
