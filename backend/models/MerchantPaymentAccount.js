const mongoose = require('mongoose');

const evidenceReferencesSchema = new mongoose.Schema({
  sandboxProof: {
    type: String,
    maxlength: 200,
    default: '',
    trim: true
  },
  underwritingProof: {
    type: String,
    maxlength: 200,
    default: '',
    trim: true
  },
  webhookProof: {
    type: String,
    maxlength: 200,
    default: '',
    trim: true
  }
}, { _id: false, strict: 'throw' });

const configProvenanceSchema = new mongoose.Schema({
  version: {
    type: String,
    maxlength: 50,
    default: '1.0.0',
    trim: true
  },
  source: {
    type: String,
    enum: ['system_bootstrap', 'ops_provisioning', 'admin_config', 'test_fixture'],
    default: 'ops_provisioning'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, { _id: false, strict: 'throw' });

const merchantPaymentAccountSchema = new mongoose.Schema({
  provider: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    minlength: 2,
    maxlength: 32,
    match: /^[a-z0-9_]{2,32}$/,
    immutable: true
  },
  environment: {
    type: String,
    enum: ['sandbox', 'production'],
    default: 'sandbox',
    required: true
  },
  accountAlias: {
    type: String,
    trim: true,
    minlength: 1,
    maxlength: 64,
    default: 'default',
    match: /^[a-zA-Z0-9_-]+$/
  },
  isEnabled: {
    type: Boolean,
    default: false,
    required: true
  },
  merchantCountry: {
    type: String,
    trim: true,
    uppercase: true,
    minlength: 2,
    maxlength: 2,
    default: 'PK',
    match: /^[A-Z]{2}$/
  },
  settlementCurrency: {
    type: String,
    trim: true,
    uppercase: true,
    minlength: 3,
    maxlength: 3,
    default: 'PKR',
    match: /^[A-Z]{3}$/
  },
  supportedCurrencies: {
    type: [{
      type: String,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 3,
      match: /^[A-Z]{3}$/
    }],
    default: ['PKR']
  },
  supportedCountries: {
    type: [{
      type: String,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 2,
      match: /^[A-Z]{2}$/
    }],
    default: ['PK']
  },
  sandboxVerification: {
    type: String,
    enum: ['unverified', 'verified', 'failed'],
    default: 'unverified',
    required: true
  },
  underwritingVerification: {
    type: String,
    enum: ['unverified', 'verified', 'pending', 'rejected'],
    default: 'unverified',
    required: true
  },
  webhookVerification: {
    type: String,
    enum: ['unverified', 'verified', 'failed'],
    default: 'unverified',
    required: true
  },
  evidenceReferences: {
    type: evidenceReferencesSchema,
    default: () => ({})
  },
  configProvenance: {
    type: configProvenanceSchema,
    default: () => ({})
  }
}, {
  timestamps: true,
  strict: 'throw',
  toJSON: {
    transform: (_doc, ret) => {
      delete ret.__v;
      return ret;
    }
  }
});

merchantPaymentAccountSchema.index(
  { provider: 1, environment: 1, accountAlias: 1 },
  { unique: true, name: 'unique_merchant_provider_env_alias' }
);

module.exports = mongoose.models.MerchantPaymentAccount
  || mongoose.model('MerchantPaymentAccount', merchantPaymentAccountSchema);
