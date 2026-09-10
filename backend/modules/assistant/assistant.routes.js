const express = require('express');
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
const {
  createAssistantRateLimiter
} = require('./middleware/assistantRateLimiter');

const createAssistantRouter = (
  config = createAssistantConfig(process.env),
  options = {}
) => {
  const router = express.Router();
  const controller = createAssistantController(config, options);
  const chatLimiter = createAssistantRateLimiter(config, options);

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
