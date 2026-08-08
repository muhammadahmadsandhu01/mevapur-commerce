const AssistantService = require('./assistant.service');

const createAssistantController = (config) => {
  const service = new AssistantService(config);

  return {
    capabilities(req, res) {
      const audience = req.user
        ? ['admin', 'super_admin'].includes(req.user.role)
          ? 'admin'
          : 'customer'
        : 'anonymous';
      return res.status(200).json({
        success: true,
        data: service.capabilities(audience),
        meta: { requestId: req.requestId }
      });
    },

    async customerChat(req, res, next) {
      try {
        const audience = req.auth ? 'customer' : 'anonymous';
        const result = await service.chat({
          message: req.assistantInput.message,
          audience,
          userId: req.auth?.userId,
          requestId: req.requestId
        });
        return res.status(200).json({
          success: true,
          data: result,
          meta: { requestId: req.requestId }
        });
      } catch (error) {
        return next(error);
      }
    },

    async adminChat(req, res, next) {
      try {
        const result = await service.chat({
          message: req.assistantInput.message,
          audience: 'admin',
          userId: req.auth.userId,
          requestId: req.requestId
        });
        return res.status(200).json({
          success: true,
          data: result,
          meta: { requestId: req.requestId }
        });
      } catch (error) {
        return next(error);
      }
    }
  };
};

module.exports = {
  createAssistantController
};
