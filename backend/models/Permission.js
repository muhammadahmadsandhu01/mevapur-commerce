const mongoose = require('mongoose');

const permissionSchema = new mongoose.Schema({
  module: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    enum: ['auth', 'order', 'payment', 'inventory', 'product', 'user', 'report', 'setting'],
    index: true
  },
  resource: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  action: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    enum: ['create', 'read', 'update', 'delete', 'manage', 'approve', 'refund', 'export']
  },
  scope: {
    type: String,
    enum: ['own', 'department', 'all'],
    default: 'own',
    required: true
  },
  description: {
    type: String,
    trim: true,
    maxlength: 200
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true
});

// Compound unique index
permissionSchema.index(
  { module: 1, resource: 1, action: 1, scope: 1 }, 
  { unique: true, partialFilterExpression: { isActive: true } }
);

// Helper to get permission string
permissionSchema.methods.toString = function() {
  return `${this.module}:${this.resource}:${this.action}:${this.scope}`;
};

module.exports = mongoose.model('Permission', permissionSchema);