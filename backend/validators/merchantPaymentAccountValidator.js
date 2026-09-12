const { z } = require('zod');
const { AppError } = require('../common/errors/AppError');

const PROHIBITED_SECRET_PATTERNS = [
  /api[_-]?key/i,
  /secret/i,
  /secret[_-]?key/i,
  /webhook[_-]?secret/i,
  /access[_-]?token/i,
  /auth(orization)?[_-]?token/i,
  /authorization/i,
  /password/i,
  /card[_-]?number/i,
  /cvv/i,
  /cvc/i,
  /pan/i,
  /private[_-]?key/i,
  /bearer/i,
  /credential/i
];

const PROHIBITED_SECRET_VALUE_PATTERNS = [
  /^(sk_live|sk_test|rk_live|rk_test|whsec_)/i,
  /^Bearer\s+[a-zA-Z0-9._-]+/i
];

const containsSecretKey = (obj) => {
  if (!obj || typeof obj !== 'object') {
    return false;
  }
  if (Array.isArray(obj)) {
    return obj.some((item) => containsSecretKey(item));
  }
  for (const key of Object.keys(obj)) {
    if (PROHIBITED_SECRET_PATTERNS.some((pattern) => pattern.test(key))) {
      return true;
    }
    if (typeof obj[key] === 'string') {
      if (PROHIBITED_SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(obj[key].trim()))) {
        return true;
      }
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      if (containsSecretKey(obj[key])) {
        return true;
      }
    }
  }
  return false;
};

const evidenceReferencesSchema = z.object({
  sandboxProof: z.string().trim().max(200).optional().default(''),
  underwritingProof: z.string().trim().max(200).optional().default(''),
  webhookProof: z.string().trim().max(200).optional().default('')
}).strict();

const configProvenanceSchema = z.object({
  version: z.string().trim().max(50).optional().default('1.0.0'),
  source: z.enum([
    'system_bootstrap',
    'ops_provisioning',
    'admin_config',
    'test_fixture'
  ]).optional().default('ops_provisioning'),
  updatedBy: z.string().optional().nullable()
}).strict();

const merchantPaymentAccountSchema = z.object({
  provider: z.string().trim().min(2).max(32).regex(/^[a-z0-9_]{2,32}$/),
  environment: z.enum(['sandbox', 'production']).default('sandbox'),
  accountAlias: z.string().trim().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/).default('default'),
  isEnabled: z.boolean().default(false),
  merchantCountry: z.string().trim().length(2).transform((v) => v.toUpperCase()).default('PK'),
  settlementCurrency: z.string().trim().length(3).transform((v) => v.toUpperCase()).default('PKR'),
  supportedCurrencies: z.array(
    z.string().trim().length(3).transform((v) => v.toUpperCase())
  ).default(['PKR']),
  supportedCountries: z.array(
    z.string().trim().length(2).transform((v) => v.toUpperCase())
  ).default(['PK']),
  sandboxVerification: z.enum(['unverified', 'verified', 'failed']).default('unverified'),
  underwritingVerification: z.enum(['unverified', 'verified', 'pending', 'rejected']).default('unverified'),
  webhookVerification: z.enum(['unverified', 'verified', 'failed']).default('unverified'),
  evidenceReferences: evidenceReferencesSchema.optional().default({}),
  configProvenance: configProvenanceSchema.optional().default({})
}).strict();

const validateMerchantPaymentAccountInput = (input) => {
  if (containsSecretKey(input)) {
    throw new AppError(
      'Input contains forbidden secret or credential fields',
      400,
      'PAYMENT_SECRETS_FORBIDDEN'
    );
  }

  const result = merchantPaymentAccountSchema.safeParse(input);
  if (!result.success) {
    const formattedErrors = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      code: issue.code,
      message: issue.message
    }));
    const error = new AppError(
      'Payment account validation failed',
      400,
      'PAYMENT_VALIDATION_FAILED'
    );
    error.errors = formattedErrors;
    throw error;
  }

  return result.data;
};

module.exports = {
  containsSecretKey,
  merchantPaymentAccountSchema,
  validateMerchantPaymentAccountInput
};
