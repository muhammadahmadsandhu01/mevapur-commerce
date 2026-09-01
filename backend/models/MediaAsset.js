const mongoose = require('mongoose');

if (mongoose.models.MediaAsset) {
  module.exports = mongoose.models.MediaAsset;
} else {
  const mediaAssetSchema = new mongoose.Schema({
    provider: {
      type: String,
      enum: ['s3', 'mock'],
      required: true
    },
    bucket: {
      type: String,
      required: true
    },
    key: {
      type: String,
      required: true,
      unique: true
    },
    publicUrl: {
      type: String,
      required: true
    },
    mimeType: {
      type: String,
      enum: ['image/jpeg', 'image/png', 'image/webp'],
      required: true
    },
    sizeBytes: {
      type: Number,
      required: true,
      max: 5242880 // 5 MB
    },
    width: {
      type: Number,
      required: true,
      max: 4096
    },
    height: {
      type: Number,
      required: true,
      max: 4096
    },
    checksumSha256: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ['uploading', 'pending', 'committed', 'deletion_requested', 'deleted', 'upload_failed', 'deletion_failed'],
      default: 'uploading',
      index: true
    },
    uploader: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    attachedTo: {
      model: {
        type: String,
        enum: ['Product'],
        default: 'Product'
      },
      id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        default: null
      }
    },
    retryCount: {
      type: Number,
      default: 0
    },
    lastError: {
      type: String,
      default: null
    },
    nextRetryAt: {
      type: Date,
      default: null
    }
  }, {
    timestamps: true
  });

  mediaAssetSchema.index({ status: 1, nextRetryAt: 1 });
  mediaAssetSchema.index({ 'attachedTo.id': 1 });

  module.exports = mongoose.model('MediaAsset', mediaAssetSchema);
}
