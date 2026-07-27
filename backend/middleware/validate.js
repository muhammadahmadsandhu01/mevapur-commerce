const { ZodError } = require('zod');
const { ValidationError } = require('../errors/AppError');

/**
 * Middleware Factory for Zod Validation
 * Usage: router.post('/', validate(createOrderSchema), controller.createOrder);
 */
const validate = (schema) => (req, res, next) => {
  try {
    // Validate request body against schema
    schema.parse(req.body);
    
    // If valid, proceed to controller
    next();
  } catch (error) {
    if (error instanceof ZodError) {
      // Format Zod errors into a clean structure
      const errors = error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message
      }));
      
      // Throw standardized Validation Error
      return next(new ValidationError('Request validation failed', errors));
    }
    // Pass other errors to global error handler
    next(error);
  }
};

module.exports = validate;