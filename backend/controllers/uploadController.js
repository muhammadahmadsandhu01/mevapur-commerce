const multer = require('multer');
const MediaService = require('../services/media/MediaService');
const { AppError } = require('../common/errors/AppError');

const storage = multer.memoryStorage();
const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
    files: 5
  }
});

const success = (res, statusCode, data, requestId) => res
  .status(statusCode)
  .json({
    success: true,
    data,
    meta: {
      requestId: requestId || 'unknown'
    }
  });

const uploadSingleImage = async (req, res, next) => {
  try {
    if (!req.file) {
      throw new AppError('No file uploaded', 400, 'MEDIA_FILE_REQUIRED');
    }

    const result = await MediaService.processAndUpload({
      file: req.file,
      userId: req.user.id
    });

    return success(res, 201, result, req.requestId);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  uploadMiddleware,
  uploadSingleImage
};
