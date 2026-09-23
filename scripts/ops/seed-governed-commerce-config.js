/**
 * scripts/ops/seed-governed-commerce-config.js
 *
 * Updates or seeds governed CommerceConfigurationVersion matching the UAT manifest
 * so CheckoutQuoteService can compute quotes against the live disposable database.
 */

'use strict';

const mongoose = require(require('path').resolve(__dirname, '../../backend/node_modules/mongoose'));
const { createGovernedCommerceConfiguration } = require(require('path').resolve(__dirname, '../../backend/tests/helpers/commerceFixtureHelper'));

async function seedCommerceConfig(mongoUri) {
  const conn = await mongoose.connect(mongoUri);
  console.log('[CONFIG_SEED] Connected to MongoDB.');

  const db = mongoose.connection.db;
  const existingActive = await db.collection('commerceconfigurationversions').findOne({
    merchantScopeId: 'default',
    status: 'active',
  });

  const origin = {
    originId: '66f000000000000000000001',
    name: 'Karachi Central Warehouse',
    country: 'PK',
    city: 'Karachi',
    timeZone: 'Asia/Karachi',
    enabled: true,
    isDefault: true,
  };

  const usdShippingRule = {
    ruleId: 'GOV-SHIP-PK-STD-USD',
    name: 'Pakistan Domestic Standard USD',
    serviceCode: 'standard',
    displayName: 'TCS Ground Standard USD',
    originCountry: 'PK',
    destinationCountry: 'PK',
    destinationSubdivisions: [],
    currency: 'USD',
    baseRateExact: {
      amountMinor: mongoose.Types.Decimal128.fromString('200'),
      currency: 'USD',
      exponent: 2,
      registrySnapshot: 'MevaPur currency snapshot 2026-09',
    },
    deliveryMinDays: 2,
    deliveryMaxDays: 4,
    processingCutoffLocal: '14:00',
    workingDays: [1, 2, 3, 4, 5],
    processingMinBusinessDays: 0,
    processingMaxBusinessDays: 1,
    weightBands: [{
      minWeightGrams: 0,
      maxWeightGrams: 50000,
      rateExact: {
        amountMinor: mongoose.Types.Decimal128.fromString('200'),
        currency: 'USD',
        exponent: 2,
        registrySnapshot: 'MevaPur currency snapshot 2026-09',
      },
      pricingMode: 'REPLACE_BASE',
    }],
    priority: 5,
    supportedIncoterms: ['DOMESTIC'],
    enabled: true,
    postalCodeRanges: [],
  };

  const aeShippingRule = {
    ruleId: 'GOV-SHIP-AE-STD-AED',
    name: 'UAE Standard Delivery AED',
    serviceCode: 'standard',
    displayName: 'Emirates Post Standard AED',
    originCountry: 'PK',
    destinationCountry: 'AE',
    destinationSubdivisions: [],
    currency: 'AED',
    baseRateExact: {
      amountMinor: mongoose.Types.Decimal128.fromString('500'),
      currency: 'AED',
      exponent: 2,
      registrySnapshot: 'MevaPur currency snapshot 2026-09',
    },
    deliveryMinDays: 3,
    deliveryMaxDays: 7,
    processingCutoffLocal: '14:00',
    workingDays: [1, 2, 3, 4, 5],
    processingMinBusinessDays: 0,
    processingMaxBusinessDays: 1,
    weightBands: [{
      minWeightGrams: 0,
      maxWeightGrams: 50000,
      rateExact: {
        amountMinor: mongoose.Types.Decimal128.fromString('500'),
        currency: 'AED',
        exponent: 2,
        registrySnapshot: 'MevaPur currency snapshot 2026-09',
      },
      pricingMode: 'REPLACE_BASE',
    }],
    priority: 5,
    supportedIncoterms: ['DAP'],
    enabled: true,
    postalCodeRanges: [],
  };

  const pkrShippingRule = {
    ruleId: 'GOV-SHIP-PK-STD',
    name: 'Pakistan Domestic Standard',
    serviceCode: 'standard',
    displayName: 'TCS Ground Standard',
    originCountry: 'PK',
    destinationCountry: 'PK',
    destinationSubdivisions: [],
    currency: 'PKR',
    baseRateExact: {
      amountMinor: mongoose.Types.Decimal128.fromString('25000'),
      currency: 'PKR',
      exponent: 2,
      registrySnapshot: 'MevaPur currency snapshot 2026-09',
    },
    freeShippingThresholdExact: {
      amountMinor: mongoose.Types.Decimal128.fromString('500000'),
      currency: 'PKR',
      exponent: 2,
      registrySnapshot: 'MevaPur currency snapshot 2026-09',
    },
    deliveryMinDays: 2,
    deliveryMaxDays: 4,
    processingCutoffLocal: '14:00',
    workingDays: [1, 2, 3, 4, 5],
    processingMinBusinessDays: 0,
    processingMaxBusinessDays: 1,
    weightBands: [{
      minWeightGrams: 0,
      maxWeightGrams: 50000,
      rateExact: {
        amountMinor: mongoose.Types.Decimal128.fromString('25000'),
        currency: 'PKR',
        exponent: 2,
        registrySnapshot: 'MevaPur currency snapshot 2026-09',
      },
      pricingMode: 'REPLACE_BASE',
    }],
    priority: 10,
    supportedIncoterms: ['DOMESTIC'],
    enabled: true,
    postalCodeRanges: [],
  };

  const existingRules = existingActive ? (existingActive.shippingRules || []) : [];
  const updatedRules = existingRules.filter((r) => r.ruleId !== 'GOV-SHIP-PK-STD' && r.ruleId !== 'GOV-SHIP-PK-STD-USD' && r.ruleId !== 'GOV-SHIP-AE-STD-AED');
  updatedRules.push(pkrShippingRule, usdShippingRule, aeShippingRule);

  if (existingActive) {
    await db.collection('commerceconfigurationversions').updateOne(
      { _id: existingActive._id },
      {
        $set: {
          'merchantProfile.fulfillmentOrigins': [origin],
          shippingRules: updatedRules,
        },
      }
    );
    console.log('[CONFIG_SEED] Updated existing active config origins & shipping rules for:', existingActive.version);
  } else {
    const config = await createGovernedCommerceConfiguration({
      merchantScopeId: 'default',
      merchantProfile: {
        fulfillmentOrigins: [origin],
      },
      shippingRules: updatedRules,
    });
    console.log('[CONFIG_SEED] Seeded new active CommerceConfigurationVersion:', config.version);
  }

  // Ensure fulfillment locations support PK, AE, US markets, service levels, and are effective
  await db.collection('fulfillmentlocations').updateMany(
    {},
    {
      $set: {
        supportedMarketCountries: ['PK', 'AE', 'US'],
        supportedServiceLevels: ['standard', 'STANDARD', 'express', 'EXPRESS'],
        effectiveFrom: new Date('2020-01-01'),
      },
    }
  );
  console.log('[CONFIG_SEED] Updated fulfillment locations supportedMarketCountries, supportedServiceLevels & effectiveFrom');

  // Ensure product market offerings exist for PK, AE, US
  const almObjId = new mongoose.Types.ObjectId('66f000000000000000000011');
  for (const country of ['PK', 'AE', 'US']) {
    await db.collection('productmarketofferings').updateOne(
      { merchantScopeId: 'default', productId: almObjId, marketCountry: country },
      {
        $set: {
          merchantScopeId: 'default',
          productId: almObjId,
          scopeType: 'product',
          scopeKey: 'product',
          marketCountry: country,
          status: 'active',
          visibility: 'visible',
          effectiveFrom: new Date('2020-01-01'),
        }
      },
      { upsert: true }
    );
  }
  console.log('[CONFIG_SEED] Seeded productmarketofferings for PK, AE, US');

  // Ensure product market offerings have effectiveFrom and ObjectId productId
  const offerings = await db.collection('productmarketofferings').find().toArray();
  for (const off of offerings) {
    const update = { effectiveFrom: new Date('2020-01-01') };
    if (typeof off.productId === 'string') {
      update.productId = new mongoose.Types.ObjectId(off.productId);
    }
    await db.collection('productmarketofferings').updateOne({ _id: off._id }, { $set: update });
  }
  console.log('[CONFIG_SEED] Updated productmarketofferings effectiveFrom & ObjectIds');

  // Ensure market price books have effectiveFrom and ObjectId productId
  const pricebooks = await db.collection('marketpricebooks').find().toArray();
  for (const pb of pricebooks) {
    const update = { effectiveFrom: new Date('2020-01-01') };
    if (typeof pb.productId === 'string') {
      update.productId = new mongoose.Types.ObjectId(pb.productId);
    }
    await db.collection('marketpricebooks').updateOne({ _id: pb._id }, { $set: update });
  }
  console.log('[CONFIG_SEED] Updated marketpricebooks effectiveFrom & ObjectIds');

  // Ensure inventory positions have ObjectId productId and locationId
  const positions = await db.collection('inventorypositions').find().toArray();
  for (const pos of positions) {
    const update = {};
    if (typeof pos.productId === 'string') {
      update.productId = new mongoose.Types.ObjectId(pos.productId);
    }
    if (typeof pos.locationId === 'string') {
      update.locationId = new mongoose.Types.ObjectId(pos.locationId);
    }
    if (Object.keys(update).length > 0) {
      await db.collection('inventorypositions').updateOne({ _id: pos._id }, { $set: update });
    }
  }
  console.log('[CONFIG_SEED] Updated inventorypositions ObjectIds');

  // Ensure USD pricebook exists for 66f000000000000000000011 so USD quote reaches COD currency check
  const almId = new mongoose.Types.ObjectId('66f000000000000000000011');
  const usdPb = await db.collection('marketpricebooks').findOne({
    productId: almId,
    currency: 'USD',
  });
  if (!usdPb) {
    await db.collection('marketpricebooks').insertOne({
      merchantScopeId: 'default',
      productId: almId,
      scopeType: 'product',
      scopeKey: 'product',
      sku: 'SKU-ALM-500G',
      marketCountry: 'PK',
      currency: 'USD',
      currencyExponent: 2,
      amountMinor: '1000',
      priceSource: 'manual',
      status: 'active',
      version: 1,
      lockVersion: 1,
      effectiveFrom: new Date('2020-01-01'),
    });
    console.log('[CONFIG_SEED] Seeded USD pricebook for Almonds');
  }

  // Ensure products have customs metadata
  await db.collection('products').updateMany(
    {},
    {
      $set: {
        hsCode: '08021200',
        hsClassification: { code: '08021200', description: 'Roasted natural nuts and dry fruits' },
        customsTariff: { code: '08021200' },
        countryOfOrigin: 'PK',
        customsDescription: 'Roasted natural nuts and dry fruits',
        declaredValueEligibility: 'ELIGIBLE',
        dangerousGoodsClassification: 'NOT_RESTRICTED',
      },
    }
  );
  console.log('[CONFIG_SEED] Updated products customs metadata');

  // Ensure coupons have canonical rateNumerator/rateDenominator or valueExact
  await db.collection('coupons').updateMany(
    { type: 'percentage' },
    {
      $set: {
        rateNumerator: 10,
        rateDenominator: 100,
      },
    }
  );
  await db.collection('coupons').updateMany(
    { type: 'fixed' },
    {
      $set: {
        valueExact: { amountMinor: '50000', currency: 'PKR', exponent: 2 },
      },
    }
  );
  console.log('[CONFIG_SEED] Updated coupons canonical exact rates');

  // Ensure AED pricebook exists for 66f000000000000000000011 so AE quote reaches COD country check
  const aedPb = await db.collection('marketpricebooks').findOne({
    productId: almId,
    marketCountry: 'AE',
    currency: 'AED',
  });
  if (!aedPb) {
    await db.collection('marketpricebooks').insertOne({
      merchantScopeId: 'default',
      productId: almId,
      scopeType: 'product',
      scopeKey: 'product',
      sku: 'SKU-ALM-500G',
      marketCountry: 'AE',
      currency: 'AED',
      currencyExponent: 2,
      amountMinor: '15000',
      priceSource: 'manual',
      status: 'active',
      version: 1,
      lockVersion: 1,
      effectiveFrom: new Date('2020-01-01'),
    });
    console.log('[CONFIG_SEED] Seeded AED pricebook for Almonds');
  }

  // Ensure MerchantPaymentAccount exists for stripe in both sandbox and production
  for (const env of ['sandbox', 'production']) {
    await db.collection('merchantpaymentaccounts').updateOne(
      { provider: 'stripe', environment: env, accountAlias: 'default' },
      {
        $set: {
          provider: 'stripe',
          environment: env,
          accountAlias: 'default',
          isEnabled: true,
          merchantCountry: 'PK',
          settlementCurrency: 'PKR',
          supportedCurrencies: ['PKR', 'USD', 'AED'],
          supportedCountries: ['PK', 'AE', 'US', 'GB'],
          sandboxVerification: 'verified',
          underwritingVerification: 'verified',
          webhookVerification: 'verified',
          evidenceReferences: {
            sandboxProof: 'UAT_AUTOMATED_PROVISIONING',
            underwritingProof: 'UAT_AUTOMATED_PROVISIONING',
            webhookProof: 'UAT_AUTOMATED_PROVISIONING',
          },
          configProvenance: {
            version: '1.0.0',
            source: 'ops_provisioning',
          },
        },
      },
      { upsert: true }
    );
  }
  console.log('[CONFIG_SEED] Seeded stripe MerchantPaymentAccount for sandbox & production');

  await mongoose.disconnect();
}

if (require.main === module) {
  const uri = process.argv[2] || process.env.MONGODB_URI || 'mongodb://127.0.0.1:57532/mevapur_uat_phase10?replicaSet=rs0&directConnection=true';
  seedCommerceConfig(uri).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { seedCommerceConfig };
