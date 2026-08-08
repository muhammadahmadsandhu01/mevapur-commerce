const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      minlength: [3, 'Full name must be at least 3 characters'],
      maxlength: [100, 'Full name cannot exceed 100 characters']
    },

    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      index: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
    },

    phone: {
      type: String,
      trim: true,
      maxlength: 20,
      default: ''
    },

    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false // Password kabhi bhi query result mein wapis nahi aayega
    },

    role: {
      type: String,
      enum: ['customer', 'support', 'inventory', 'manager', 'admin', 'super_admin'],
      default: 'customer',
      index: true // RBAC queries ke liye optimized
    },

    avatar: {
      type: String,
      default: ''
    },

    addresses: [
      {
        fullName: String,
        phone: String,
        address: String,
        city: String,
        state: String,
        postalCode: String,
        country: {
          type: String,
          default: 'Pakistan'
        },
        isDefault: {
          type: Boolean,
          default: false
        }
      }
    ],

    // Email Verification Status
    isVerified: {
      type: Boolean,
      default: false // Security: Pehle verify hoga, phir login allowed
    },

    // Account Status
    isBlocked: {
      type: Boolean,
      default: false,
      index: true
    },

    isDeleted: {
      type: Boolean,
      default: false,
      index: true // Soft Delete implementation
    },

    // Security: Brute Force Protection
    loginAttempts: {
      type: Number,
      default: 0,
      select: false
    },
    lockUntil: {
      type: Date,
      default: null,
      select: false
    },

    // Security: Token Versioning (For Refresh Token Rotation & Logout All)
    tokenVersion: {
      type: Number,
      default: 0,
      min: 0,
      select: false
    },

    resetPasswordTokenHash: {
      type: String,
      select: false,
      default: null
    },

    resetPasswordExpiresAt: {
      type: Date,
      select: false,
      default: null
    },

    lastLoginAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true // createdAt, updatedAt auto manage
  }
);

/*
|--------------------------------------------------------------------------
| Indexes for Performance
|--------------------------------------------------------------------------
*/
// Compound index for finding active users quickly
userSchema.index({ isDeleted: 1, isBlocked: 1 });

/*
|--------------------------------------------------------------------------
| Hash Password (Pre-Save Hook)
|--------------------------------------------------------------------------
*/
userSchema.pre('save', async function(next) {
  // Sirf tab hash karo jab password modify ho ya naya ho
  if (!this.isModified('password')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    
    // Password change hone par login attempts reset karo
    this.loginAttempts = 0;
    this.lockUntil = null;
    
    next();
  } catch (err) {
    next(err);
  }
});

/*
|--------------------------------------------------------------------------
| Compare Password Instance Method
|--------------------------------------------------------------------------
*/
userSchema.methods.matchPassword = async function(candidatePassword) {
  // 'select: false' field ko access karne ke liye explicit populate nahi chahiye method ke andar
  // lekin agar query mein select(false) tha to pehle select('+password') karna padega controller mein.
  // Yeh method tab call karna jab password field loaded ho.
  return await bcrypt.compare(candidatePassword, this.password);
};

/*
|--------------------------------------------------------------------------
| Account Lock Logic Helpers
|--------------------------------------------------------------------------
*/
userSchema.methods.isAccountLocked = function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

userSchema.methods.incrementLoginAttempts = function() {
  // Agar account already locked hai ya attempts pehle se hain, to increment karo
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  // Agar 5 attempts ho gaye, to 1 hour ke liye lock karo (Configurable)
  if (this.loginAttempts + 1 >= 5 && !this.isAccountLocked()) {
    updates.$set = { lockUntil: Date.now() + 60 * 60 * 1000 }; // 1 hour
  }
  
  return this.updateOne(updates);
};

/*
|--------------------------------------------------------------------------
| Hide Sensitive Data (toJSON)
|--------------------------------------------------------------------------
*/
userSchema.methods.toJSON = function() {
  const obj = this.toObject();

  obj.id = obj._id.toString();
  delete obj._id;
  // Sensitive fields remove karo
  delete obj.password;
  delete obj.loginAttempts;
  delete obj.lockUntil;
  delete obj.tokenVersion;
  delete obj.resetPasswordTokenHash;
  delete obj.resetPasswordExpiresAt;
  delete obj.__v;
  delete obj.isDeleted; // Client ko soft delete flag dikhane ki zarurat nahi
  
  return obj;
};

module.exports = mongoose.model('User', userSchema);
