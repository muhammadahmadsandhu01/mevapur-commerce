'use strict';

const INDEX_PLAN_VERSION = 'P3-STAGING-INDEX-V1';

const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

const REQUIRED_BACKUP_COLLECTIONS = deepFreeze([
  'environment_markers',
  'inventorytransactions',
  'orders',
  'payments',
  'paymentwebhookevents',
  'refunds',
  'returns',
  'sessions',
  'users'
]);

const ALLOWLIST = deepFreeze([
  {
    collection: 'users',
    name: 'email_1',
    keys: { email: 1 },
    options: { unique: true }
  },
  {
    collection: 'sessions',
    name: 'expiresAt_1',
    keys: { expiresAt: 1 },
    options: { expireAfterSeconds: 0 }
  },
  {
    collection: 'orders',
    name: 'orderId_1',
    keys: { orderId: 1 },
    options: { unique: true }
  },
  {
    collection: 'orders',
    name: 'unique_user_order_idempotency',
    keys: { user: 1, idempotencyKey: 1 },
    options: { unique: true }
  },
  {
    collection: 'inventorytransactions',
    name: 'operationKey_1',
    keys: { operationKey: 1 },
    options: { unique: true, sparse: true }
  },
  {
    collection: 'payments',
    name: 'unique_user_payment_idempotency',
    keys: { user: 1, idempotencyKey: 1 },
    options: { unique: true }
  },
  {
    collection: 'payments',
    name: 'unique_provider_payment_reference',
    keys: { provider: 1, providerPaymentId: 1 },
    options: { unique: true, sparse: true }
  },
  {
    collection: 'payments',
    name: 'order_1_createdAt_-1',
    keys: { order: 1, createdAt: -1 },
    options: {}
  },
  {
    collection: 'payments',
    name: 'unique_manual_customer_reference',
    keys: { customerReferenceHash: 1 },
    options: { unique: true, sparse: true }
  },
  {
    collection: 'paymentwebhookevents',
    name: 'unique_provider_webhook_event',
    keys: { provider: 1, providerEventId: 1 },
    options: { unique: true }
  },
  {
    collection: 'refunds',
    name: 'refundNumber_1',
    keys: { refundNumber: 1 },
    options: { unique: true }
  },
  {
    collection: 'refunds',
    name: 'unique_payment_refund_idempotency',
    keys: { payment: 1, idempotencyKey: 1 },
    options: {
      unique: true,
      partialFilterExpression: {
        payment: { $type: 'objectId' },
        idempotencyKey: { $type: 'string' }
      }
    }
  },
  {
    collection: 'refunds',
    name: 'unique_provider_refund_reference',
    keys: { provider: 1, providerRefundId: 1 },
    options: {
      unique: true,
      partialFilterExpression: {
        providerRefundId: { $type: 'string', $gt: '' }
      }
    }
  },
  {
    collection: 'refunds',
    name: 'status_1_createdAt_-1',
    keys: { status: 1, createdAt: -1 },
    options: {}
  },
  {
    collection: 'refunds',
    name: 'unique_refund_return',
    keys: { returnId: 1 },
    options: { unique: true, sparse: true }
  },
  {
    collection: 'returns',
    name: 'returnNumber_1',
    keys: { returnNumber: 1 },
    options: { unique: true }
  },
  {
    collection: 'returns',
    name: 'status_1_createdAt_-1',
    keys: { status: 1, createdAt: -1 },
    options: {}
  },
  {
    collection: 'returns',
    name: 'customer_1_createdAt_-1',
    keys: { customer: 1, createdAt: -1 },
    options: {}
  },
  {
    collection: 'returns',
    name: 'order_1',
    keys: { order: 1 },
    options: {}
  },
  {
    collection: 'returns',
    name: 'unique_return_refund',
    keys: { refund: 1 },
    options: {
      unique: true,
      partialFilterExpression: { refund: { $type: 'objectId' } }
    }
  }
]);

const KNOWN_LEGACY_INDEX_DEFINITIONS = deepFreeze([
  {
    collection: 'refunds',
    name: 'unique_provider_refund_reference',
    keys: { provider: 1, providerRefundId: 1 },
    options: { unique: true, sparse: true }
  }
]);

const LEGACY_PAYMENT_TTL = deepFreeze({
  collection: 'payments',
  keys: { expiresAt: 1 },
  options: { expireAfterSeconds: 1800 }
});

const PAYMENT_PROVIDERS = deepFreeze([
  'cod',
  'bank_transfer',
  'raast',
  'stripe',
  'jazzcash',
  'easypaisa'
]);

const PAYMENT_STATUSES = deepFreeze([
  'Pending',
  'AwaitingCustomerPayment',
  'AwaitingVerification',
  'Processing',
  'Completed',
  'Rejected',
  'Failed',
  'Expired',
  'Cancelled',
  'PartiallyRefunded',
  'Refunded'
]);

const INDEX_OPTION_FIELDS = deepFreeze([
  'background',
  'unique',
  'sparse',
  'expireAfterSeconds',
  'partialFilterExpression',
  'collation',
  'hidden',
  'prepareUnique',
  'storageEngine',
  'weights',
  'default_language',
  'language_override',
  'textIndexVersion',
  '2dsphereIndexVersion',
  'bits',
  'min',
  'max',
  'bucketSize',
  'wildcardProjection',
  'clustered'
]);

const INDEX_METADATA_FIELDS = new Set(['v', 'ns', 'name', 'key']);

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const result = {};
    for (const key of Object.keys(value).sort()) {
      result[key] = canonicalize(value[key]);
    }
    return result;
  }
  return value;
}

function comparableIndex(index) {
  const result = {
    name: index.name,
    key: Object.entries(index.key || {})
  };

  for (const option of INDEX_OPTION_FIELDS) {
    if (index[option] !== undefined) result[option] = index[option];
  }

  return canonicalize(result);
}

function expectedIndex(definition) {
  return comparableIndex({
    name: definition.name,
    key: definition.keys,
    ...definition.options
  });
}

function sameIndex(actual, expected) {
  const reviewedFields = new Set([
    ...INDEX_METADATA_FIELDS,
    ...INDEX_OPTION_FIELDS
  ]);
  if (Object.keys(actual).some((field) => !reviewedFields.has(field))) {
    return false;
  }
  return JSON.stringify(comparableIndex(actual)) === JSON.stringify(expectedIndex(expected));
}

function sameKeyPattern(actual, expected) {
  return JSON.stringify(Object.entries(actual || {})) ===
    JSON.stringify(Object.entries(expected || {}));
}

async function duplicateGroupCount(collection, match, groupId) {
  const pipeline = [];
  if (match) pipeline.push({ $match: match });
  pipeline.push(
    { $group: { _id: groupId, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $count: 'groups' }
  );
  const result = await collection.aggregate(pipeline, { allowDiskUse: false }).toArray();
  return result[0]?.groups || 0;
}

async function runDataChecks(database) {
  const users = database.collection('users');
  const orders = database.collection('orders');
  const payments = database.collection('payments');
  const webhookEvents = database.collection('paymentwebhookevents');
  const refunds = database.collection('refunds');
  const returns = database.collection('returns');
  const inventory = database.collection('inventorytransactions');

  return {
    duplicateUserEmails: await duplicateGroupCount(
      users,
      { email: { $type: 'string' } },
      '$email'
    ),
    duplicateOrderIds: await duplicateGroupCount(
      orders,
      { orderId: { $type: 'string' } },
      '$orderId'
    ),
    duplicateOrderUserIdempotency: await duplicateGroupCount(
      orders,
      { user: { $type: 'objectId' }, idempotencyKey: { $type: 'string' } },
      { user: '$user', key: '$idempotencyKey' }
    ),
    duplicatePaymentUserIdempotency: await duplicateGroupCount(
      payments,
      { user: { $type: 'objectId' }, idempotencyKey: { $type: 'string' } },
      { user: '$user', key: '$idempotencyKey' }
    ),
    duplicateProviderPaymentReferences: await duplicateGroupCount(
      payments,
      { provider: { $type: 'string' }, providerPaymentId: { $type: 'string' } },
      { provider: '$provider', reference: '$providerPaymentId' }
    ),
    duplicateManualReferenceHashes: await duplicateGroupCount(
      payments,
      { customerReferenceHash: { $type: 'string' } },
      '$customerReferenceHash'
    ),
    duplicateWebhookProviderEvents: await duplicateGroupCount(
      webhookEvents,
      { provider: { $type: 'string' }, providerEventId: { $type: 'string' } },
      { provider: '$provider', event: '$providerEventId' }
    ),
    duplicateRefundNumbers: await duplicateGroupCount(
      refunds,
      { refundNumber: { $type: 'string' } },
      '$refundNumber'
    ),
    duplicateRefundIdempotency: await duplicateGroupCount(
      refunds,
      { payment: { $type: 'objectId' }, idempotencyKey: { $type: 'string' } },
      { payment: '$payment', key: '$idempotencyKey' }
    ),
    duplicateProviderRefundReferences: await duplicateGroupCount(
      refunds,
      {
        provider: { $type: 'string' },
        providerRefundId: { $type: 'string', $gt: '' }
      },
      { provider: '$provider', reference: '$providerRefundId' }
    ),
    duplicateRefundReturnLinks: await duplicateGroupCount(
      refunds,
      { returnId: { $exists: true } },
      '$returnId'
    ),
    duplicateReturnNumbers: await duplicateGroupCount(
      returns,
      null,
      '$returnNumber'
    ),
    duplicateReturnRefundLinks: await duplicateGroupCount(
      returns,
      { refund: { $type: 'objectId' } },
      '$refund'
    ),
    nullProviderRefundReferences: await refunds.countDocuments({
      providerRefundId: { $exists: true, $eq: null }
    }),
    emptyProviderRefundReferences: await refunds.countDocuments({
      providerRefundId: { $type: 'string', $eq: '' }
    }),
    duplicateInventoryOperationKeys: await duplicateGroupCount(
      inventory,
      { operationKey: { $type: 'string' } },
      '$operationKey'
    ),
    malformedPaymentProviders: await payments.countDocuments({
      $or: [
        { provider: { $exists: false } },
        { provider: null },
        { provider: { $not: { $type: 'string' } } },
        { provider: { $nin: PAYMENT_PROVIDERS } }
      ]
    }),
    unexpectedPaymentStatuses: await payments.countDocuments({
      $or: [
        { status: { $exists: false } },
        { status: null },
        { status: { $not: { $type: 'string' } } },
        { status: { $nin: PAYMENT_STATUSES } }
      ]
    }),
    legacyTtlAffectedDocuments: await payments.countDocuments({
      expiresAt: { $type: 'date' }
    }),
    paymentProviderReferenceTypeIncompatibilities: await payments.countDocuments({
      providerPaymentId: { $exists: true },
      $or: [
        { providerPaymentId: null },
        { providerPaymentId: { $not: { $type: 'string' } } },
        { provider: { $not: { $type: 'string' } } }
      ]
    }),
    manualReferenceTypeIncompatibilities: await payments.countDocuments({
      customerReferenceHash: { $exists: true },
      $or: [
        { customerReferenceHash: null },
        { customerReferenceHash: { $not: { $type: 'string' } } }
      ]
    }),
    refundIdempotencyTypeIncompatibilities: await refunds.countDocuments({
      $or: [
        { payment: { $exists: true, $not: { $type: 'objectId' } } },
        { idempotencyKey: { $exists: true, $not: { $type: 'string' } } }
      ]
    }),
    refundProviderReferenceTypeIncompatibilities: await refunds.countDocuments({
      providerRefundId: { $exists: true },
      $or: [
        {
          providerRefundId: {
            $ne: null,
            $not: { $type: 'string' }
          }
        },
        { provider: { $not: { $type: 'string' } } }
      ]
    }),
    inventoryOperationKeyTypeIncompatibilities: await inventory.countDocuments({
      operationKey: { $exists: true },
      $or: [
        { operationKey: null },
        { operationKey: { $not: { $type: 'string' } } }
      ]
    })
  };
}

function classifyIndexes(preSnapshot) {
  const existingCollections = new Set(preSnapshot.collections);
  const result = {
    retained: [],
    creates: [],
    blocked: [],
    conflicts: [],
    legacyRemoval: null
  };

  for (const definition of ALLOWLIST) {
    const safeIdentity = {
      collection: definition.collection,
      name: definition.name
    };
    if (!existingCollections.has(definition.collection)) {
      result.blocked.push({
        ...safeIdentity,
        reason: 'COLLECTION_ABSENT'
      });
      continue;
    }

    const actualIndexes = preSnapshot.indexes[definition.collection] || [];
    const sameName = actualIndexes.find((index) => index.name === definition.name);
    if (sameName) {
      if (sameIndex(sameName, definition)) {
        result.retained.push(safeIdentity);
      } else {
        result.conflicts.push({
          ...safeIdentity,
          reason: 'NAME_COLLISION_WITH_DIFFERENT_DEFINITION'
        });
      }
      continue;
    }

    const sameKeys = actualIndexes.find(
      (index) => sameKeyPattern(index.key, definition.keys)
    );
    if (sameKeys) {
      result.conflicts.push({
        ...safeIdentity,
        reason: 'KEYS_EXIST_UNDER_DIFFERENT_DEFINITION'
      });
      continue;
    }

    result.creates.push(safeIdentity);
  }

  if (existingCollections.has(LEGACY_PAYMENT_TTL.collection)) {
    const ttlCandidates = (preSnapshot.indexes[LEGACY_PAYMENT_TTL.collection] || [])
      .filter(
        (index) =>
          JSON.stringify(index.key) === JSON.stringify(LEGACY_PAYMENT_TTL.keys) &&
          index.expireAfterSeconds !== undefined
      );
    if (ttlCandidates.length > 1) {
      result.conflicts.push({
        collection: LEGACY_PAYMENT_TTL.collection,
        name: 'legacy-expiresAt-ttl',
        reason: 'MULTIPLE_LEGACY_TTL_CANDIDATES'
      });
    } else if (ttlCandidates.length === 1) {
      const candidate = ttlCandidates[0];
      const exact =
        candidate.expireAfterSeconds === LEGACY_PAYMENT_TTL.options.expireAfterSeconds &&
        candidate.unique === undefined &&
        candidate.sparse === undefined &&
        candidate.partialFilterExpression === undefined &&
        candidate.collation === undefined;
      if (!exact) {
        result.conflicts.push({
          collection: LEGACY_PAYMENT_TTL.collection,
          name: candidate.name,
          reason: 'LEGACY_TTL_DEFINITION_MISMATCH'
        });
      } else {
        result.legacyRemoval = {
          collection: LEGACY_PAYMENT_TTL.collection,
          name: candidate.name,
          keys: candidate.key,
          expireAfterSeconds: candidate.expireAfterSeconds
        };
      }
    }
  }

  return result;
}

module.exports = {
  ALLOWLIST,
  INDEX_PLAN_VERSION,
  KNOWN_LEGACY_INDEX_DEFINITIONS,
  LEGACY_PAYMENT_TTL,
  REQUIRED_BACKUP_COLLECTIONS,
  canonicalize,
  classifyIndexes,
  comparableIndex,
  duplicateGroupCount,
  expectedIndex,
  runDataChecks,
  sameKeyPattern,
  sameIndex
};
