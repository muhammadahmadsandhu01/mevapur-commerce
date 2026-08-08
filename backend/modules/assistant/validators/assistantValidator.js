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

  const allowedKeys = new Set(['message', 'history']);
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

  const history = body.history === undefined ? [] : body.history;
  if (!Array.isArray(history) || history.length > config.maxHistoryItems) {
    return next(new AppError(
      `Assistant history may contain at most ${config.maxHistoryItems} items`,
      400,
      'ASSISTANT_HISTORY_INVALID'
    ));
  }
  for (const item of history) {
    if (
      !item
      || typeof item !== 'object'
      || !['user', 'assistant'].includes(item.role)
      || typeof item.content !== 'string'
      || item.content.length === 0
      || item.content.length > config.maxInputChars
    ) {
      return next(new AppError(
        'Assistant history item is invalid',
        400,
        'ASSISTANT_HISTORY_INVALID'
      ));
    }
  }

  req.assistantInput = {
    message: body.message.trim(),
    // History is accepted only as bounded request context. P5C never stores it.
    history: history.map((item) => ({
      role: item.role,
      content: item.content
    }))
  };
  return next();
};

module.exports = {
  validateChatRequest
};
