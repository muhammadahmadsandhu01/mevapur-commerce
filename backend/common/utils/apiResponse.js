const sendSuccess = (res, statusCode, message, data = null) => {
  res.status(statusCode).json({
    success: true,
    message,
    data
  });
};

const sendError = (res, error) => {
  res.status(error.statusCode || 500).json({
    success: false,
    error: {
      code: error.code || 'INTERNAL_SERVER_ERROR',
      message: error.message || 'An unexpected error occurred',
      details: error.details || []
    }
  });
};

module.exports = { sendSuccess, sendError };