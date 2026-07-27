const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Role name is required'],
    unique: true,
    trim: true,
    uppercase: true // e.g., ADMIN, MANAGER
  },
  
  description: {
    type: String,
    maxlength: 200
  },

  // Array of Permission IDs
  permissions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Permission'
  }],

  isSystem: {
    type: Boolean,
    default: false // Prevent deletion of system roles
  },
  
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

roleSchema.index({ name: 1 });

module.exports = mongoose.model('Role', roleSchema);