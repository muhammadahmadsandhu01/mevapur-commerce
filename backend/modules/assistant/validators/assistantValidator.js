const { AppError } = require('../../../common/errors/AppError');

const validateChatRequest = (config) => (req, res, next) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return next(new AppError(
      'Assistant request body must be an object',
      400,
      'ASSISTANT_REQUEST_INVALID'
    ));
  }

  const allowedKeys = new Set(['message']);
  if (Object.keys(body).some((key) => !allowedKeys.has(key))) {
    return next(new AppError(
      'Assistant request contains unsupported fields',
      400,
      'ASSISTANT_REQUEST_INVALID'
    ));
  }

  if (
    typeof body.message !== 'string'
    || body.message.trim().length === 0
    || body.message.length > config.maxInputChars
  ) {
    return next(new AppError(
      `Assistant message must contain 1 to ${config.maxInputChars} characters`,
      400,
      'ASSISTANT_MESSAGE_INVALID'
    ));
  }

  req.assistantInput = {
    message: body.message.trim()
  };
  return next();
};

module.exports = {
  validateChatRequest
};
