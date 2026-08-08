const { ZodError } = require('zod');
const { ValidationError } = require('../common/errors/AppError');
const ERROR_CODES = require('../constants/errorCodes');

/**
 * Middleware Factory for Zod Validation
 * Usage: router.post('/', validate(createOrderSchema), controller.createOrder);
 */
const validate = (
  schema,
  {
    source = 'body',
    code = ERROR_CODES.VALIDATION_ERROR
  } = {}
) => (req, res, next) => {
  try {
    const parsed = schema.parse(req[source]);
    req[source] = parsed;
    return next();
  } catch (error) {
    if (error instanceof ZodError) {
      const errors = error.issues.map((err) => ({
        field: err.path.join('.'),
        message: err.message
      }));

      return next(
        new ValidationError('Request validation failed', errors, code)
      );
    }
    return next(error);
  }
};

module.exports = validate;
