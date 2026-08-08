const express = require('express');
const rateLimit = require('express-rate-limit');
const { protect, admin } = require('../../middleware/auth');
const optionalAuthentication = require('./middleware/optionalAuthentication');
const {
  createAssistantConfig
} = require('./config/assistant.config');
const {
  validateChatRequest
} = require('./validators/assistantValidator');
const {
  createAssistantController
} = require('./assistant.controller');

const createAssistantRouter = (config = createAssistantConfig(process.env)) => {
  const router = express.Router();
  const controller = createAssistantController(config);
  const chatLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    handler(req, res) {
      return res.status(429).json({
        success: false,
        error: {
          code: 'ASSISTANT_RATE_LIMITED',
          message: 'Too many assistant requests; please retry later'
        },
        meta: {
          requestId: req.requestId || 'unknown'
        }
      });
    }
  });

  router.get('/capabilities', optionalAuthentication, controller.capabilities);
  router.post(
    '/chat',
    chatLimiter,
    optionalAuthentication,
    validateChatRequest(config),
    controller.customerChat
  );
  router.post(
    '/admin/chat',
    chatLimiter,
    protect,
    admin,
    validateChatRequest(config),
    controller.adminChat
  );

  return router;
};

module.exports = createAssistantRouter();
module.exports.createAssistantRouter = createAssistantRouter;
