const mongoose = require('mongoose');
const { STAFF_ROLES } = require('../constants/roleConstants');

const staffInvitationSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
      index: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
    },
    role: {
      type: String,
      enum: STAFF_ROLES,
      required: [true, 'Role is required']
    },
    tokenHash: {
      type: String,
      required: true,
      index: true,
      select: false
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'expired', 'revoked'],
      default: 'pending',
      required: true,
      index: true
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    acceptedAt: {
      type: Date,
      default: null
    },
    revokedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

staffInvitationSchema.index({ email: 1, status: 1 });

module.exports = mongoose.model('StaffInvitation', staffInvitationSchema);
