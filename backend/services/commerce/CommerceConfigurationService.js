/**
 * @file CommerceConfigurationService.js
 * @description Service governing versioned, multi-scope commerce configurations.
 * Implements atomic version allocation, draft validation, scheduling, transactional activation,
 * supersession with quote grace periods, emergency revocation, and read-only preview.
 */

const mongoose = require('mongoose');
const CommerceConfigurationVersion = require('../../models/CommerceConfigurationVersion');
const CommerceConfigurationSequence = require('../../models/CommerceConfigurationSequence');
const TaxDutyEngine = require('../checkout/TaxDutyEngine');
const ManualTableShippingAdapter = require('../checkout/shipping/ManualTableShippingAdapter');
const { Money, MoneyMapper, Address, CountryRegistry, CurrencyRegistry } = require('../../modules/commerce');
const { AppError } = require('../../common/errors/AppError');

const DEFAULT_QUOTE_GRACE_PERIOD_MS = 15 * 60 * 1000; // 15 minutes quote acceptance grace after supersession

class CommerceConfigurationService {
  /**
   * Retrieves the currently active and effective configuration for a merchant scope.
   * Fails closed by returning null if none is currently active and effective.
   * @param {Object} [params]
   * @param {string} [params.merchantScopeId='default']
   * @param {Date|string} [params.atDate=new Date()]
   * @returns {Promise<CommerceConfigurationVersion|null>}
   */
  async getActiveConfiguration({ merchantScopeId = 'default', atDate = new Date() } = {}) {
    const scope = (merchantScopeId || 'default').trim();
    const targetDate = new Date(atDate);

    const activeConfig = await CommerceConfigurationVersion.findOne({
      merchantScopeId: scope,
      status: 'active',
      effectiveFrom: { $lte: targetDate },
      $or: [
        { effectiveTo: null },
        { effectiveTo: { $gt: targetDate } }
      ]
    }).sort({ version: -1 });

    return activeConfig;
  }

  /**
   * Checks whether a specific configuration version is acceptable for order creation.
   * @param {string|number} versionIdOrNumber
   * @param {string} [merchantScopeId='default']
   * @param {Date} [atDate=new Date()]
   * @returns {Promise<boolean>}
   */
  async isVersionOrderAcceptable(versionIdOrNumber, merchantScopeId = 'default', atDate = new Date()) {
    if (!versionIdOrNumber) return false;
    const scope = (merchantScopeId || 'default').trim();

    let query = { merchantScopeId: scope };
    if (mongoose.isObjectIdOrHexString(versionIdOrNumber)) {
      query._id = versionIdOrNumber;
    } else {
      const vNum = parseInt(versionIdOrNumber, 10);
      if (Number.isNaN(vNum)) return false;
      query.version = vNum;
    }

    const versionDoc = await CommerceConfigurationVersion.findOne(query);
    if (!versionDoc) return false;

    return versionDoc.isOrderAcceptable(atDate);
  }

  /**
   * List versions for a merchant scope with pagination and filtering.
   * @param {Object} params
   * @returns {Promise<Object>}
   */
  async listVersions({ merchantScopeId = null, page = 1, limit = 20, status = null } = {}) {
    if (!merchantScopeId || typeof merchantScopeId !== 'string' || !merchantScopeId.trim()) {
      throw new AppError('Merchant scope identifier is required', 400, 'MERCHANT_SCOPE_REQUIRED');
    }
    const scope = merchantScopeId.trim();
    const query = { merchantScopeId: scope };
    if (status) query.status = status;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [versions, total] = await Promise.all([
      CommerceConfigurationVersion.find(query)
        .select('-__v')
        .sort({ version: -1 })
        .skip(skip)
        .limit(limitNum),
      CommerceConfigurationVersion.countDocuments(query)
    ]);

    return {
      versions,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum)
    };
  }

  /**
   * Get version by ID or version number.
   * @param {string|number} id
   * @param {Object} options
   * @param {string} options.merchantScopeId
   * @returns {Promise<CommerceConfigurationVersion>}
   */
  async getVersionById(id, { merchantScopeId = null } = {}) {
    if (!merchantScopeId || typeof merchantScopeId !== 'string' || !merchantScopeId.trim()) {
      throw new AppError('Merchant scope identifier is required for configuration lookup', 400, 'MERCHANT_SCOPE_REQUIRED');
    }
    const scope = merchantScopeId.trim();
    let query = { merchantScopeId: scope };
    if (mongoose.isObjectIdOrHexString(id)) {
      query._id = id;
    } else {
      const vNum = parseInt(id, 10);
      if (Number.isNaN(vNum)) {
        throw new AppError('Invalid configuration version identifier', 400, 'INVALID_VERSION_IDENTIFIER');
      }
      query.version = vNum;
    }

    const doc = await CommerceConfigurationVersion.findOne(query);
    if (!doc) {
      throw new AppError('Commerce configuration version not found', 404, 'CONFIG_VERSION_NOT_FOUND');
    }
    return doc;
  }

  /**
   * Atomically create a new draft configuration version.
   * @param {Object} params
   * @returns {Promise<CommerceConfigurationVersion>}
   */
  async createDraft({
    merchantScopeId = null,
    sourceVersionId = null,
    initialData = {},
    authorId = null
  } = {}) {
    if (!merchantScopeId || typeof merchantScopeId !== 'string' || !merchantScopeId.trim()) {
      throw new AppError('Merchant scope identifier is required', 400, 'MERCHANT_SCOPE_REQUIRED');
    }
    const scope = merchantScopeId.trim();

    let templateProfile = initialData.merchantProfile || {
      merchantCountry: 'PK',
      legalName: 'MevaPur Global Store',
      sellingMode: 'hybrid',
      baseCurrency: 'PKR',
      defaultCurrency: 'PKR',
      enabledCurrencies: ['PKR'],
      enabledCountries: ['PK'],
      defaultLocale: 'en-PK',
      defaultTimeZone: 'Asia/Karachi',
      fulfillmentOrigins: [
        {
          originId: 'ORIGIN-PK-MAIN',
          name: 'Main Pakistan Warehouse',
          country: 'PK',
          city: 'Karachi',
          timeZone: 'Asia/Karachi',
          enabled: true,
          isDefault: true
        }
      ],
      supportedIncoterms: ['DOMESTIC', 'DAP', 'DDP'],
      taxCalculationMode: 'exact_rational'
    };

    let templateShippingRules = initialData.shippingRules || [];
    let templateTaxRules = initialData.taxRules || [];

    if (sourceVersionId) {
      const source = await this.getVersionById(sourceVersionId, { merchantScopeId: scope });
      templateProfile = JSON.parse(JSON.stringify(source.merchantProfile));
      templateShippingRules = JSON.parse(JSON.stringify(source.shippingRules || []));
      templateTaxRules = JSON.parse(JSON.stringify(source.taxRules || []));
    }

    const nextVersionNumber = await CommerceConfigurationSequence.getNextVersion(scope);

    const draft = await CommerceConfigurationVersion.create({
      merchantScopeId: scope,
      version: nextVersionNumber,
      lockVersion: 1,
      status: 'draft',
      merchantProfile: templateProfile,
      shippingRules: templateShippingRules,
      taxRules: templateTaxRules,
      effectiveFrom: initialData.effectiveFrom || new Date(),
      effectiveTo: initialData.effectiveTo || null,
      changeNotes: initialData.changeNotes || `Draft v${nextVersionNumber} initialized`,
      author: authorId,
      validationErrors: []
    });

    return draft;
  }

  /**
   * Update draft configuration with optimistic locking.
   * @param {Object} params
   * @returns {Promise<CommerceConfigurationVersion>}
   */
  async updateDraft({
    id,
    merchantScopeId = null,
    updates = {},
    expectedLockVersion = null,
    authorId = null
  }) {
    if (!merchantScopeId || typeof merchantScopeId !== 'string' || !merchantScopeId.trim()) {
      throw new AppError('Merchant scope identifier is required for draft update', 400, 'MERCHANT_SCOPE_REQUIRED');
    }
    const scope = merchantScopeId.trim();
    const draft = await this.getVersionById(id, { merchantScopeId: scope });

    if (draft.status !== 'draft') {
      throw new AppError(
        `Cannot edit configuration version in '${draft.status}' status. Only drafts are editable.`,
        409,
        'CONFIG_IMMUTABLE'
      );
    }

    if (expectedLockVersion != null && draft.lockVersion !== expectedLockVersion) {
      throw new AppError(
        `Optimistic concurrency conflict: configuration version lockVersion is ${draft.lockVersion}, expected ${expectedLockVersion}`,
        409,
        'CONCURRENCY_CONFLICT'
      );
    }

    if (updates.merchantProfile) draft.merchantProfile = updates.merchantProfile;
    if (updates.shippingRules) draft.shippingRules = updates.shippingRules;
    if (updates.taxRules) draft.taxRules = updates.taxRules;
    if (updates.effectiveFrom) draft.effectiveFrom = updates.effectiveFrom;
    if (updates.effectiveTo !== undefined) draft.effectiveTo = updates.effectiveTo;
    if (updates.changeNotes) draft.changeNotes = updates.changeNotes;

    // Reset status to draft if it was previously validated
    draft.status = 'draft';
    draft.validatedBy = null;
    draft.validatedAt = null;
    draft.validationErrors = [];
    draft.lockVersion += 1;
    if (authorId) draft.author = authorId;

    await draft.save();
    return draft;
  }

  /**
   * Validate draft configuration against strict integrity rules.
   * @param {Object} params
   * @returns {Promise<Object>}
   */
  async validateDraft({ id, merchantScopeId = null, validatorId = null }) {
    if (!merchantScopeId || typeof merchantScopeId !== 'string' || !merchantScopeId.trim()) {
      throw new AppError('Merchant scope identifier is required for draft validation', 400, 'MERCHANT_SCOPE_REQUIRED');
    }
    const scope = merchantScopeId.trim();
    const doc = await this.getVersionById(id, { merchantScopeId: scope });

    if (doc.status !== 'draft' && doc.status !== 'validated') {
      throw new AppError(
        `Cannot validate configuration version in '${doc.status}' status`,
        409,
        'INVALID_STATUS_FOR_VALIDATION'
      );
    }

    const errors = doc.validateIntegrity();
    doc.validationErrors = errors;

    if (errors.length > 0) {
      doc.status = 'draft';
      doc.validatedBy = null;
      doc.validatedAt = null;
      await doc.save();
      return {
        isValid: false,
        version: doc.version,
        status: doc.status,
        errors
      };
    }

    doc.status = 'validated';
    doc.validatedBy = validatorId;
    doc.validatedAt = new Date();
    doc.lockVersion += 1;
    await doc.save();

    return {
      isValid: true,
      version: doc.version,
      status: doc.status,
      errors: []
    };
  }

  /**
   * Schedule or Activate a validated configuration version.
   * Serializes activation through CAS authority document inside a MongoDB transaction.
   * Supersedes existing active version with a deterministic grace period for outstanding quotes.
   * @param {Object} params
   * @returns {Promise<CommerceConfigurationVersion>}
   */
  async scheduleOrActivateVersion({
    id,
    merchantScopeId = null,
    activatorId = null,
    effectiveFrom = null
  }) {
    if (!merchantScopeId || typeof merchantScopeId !== 'string' || !merchantScopeId.trim()) {
      throw new AppError('Merchant scope identifier is required for version activation', 400, 'MERCHANT_SCOPE_REQUIRED');
    }
    const scope = merchantScopeId.trim();
    const session = await mongoose.startSession();

    try {
      let result;
      await session.withTransaction(async () => {
        // 1. Query target version document inside the transaction strictly scoped
        let query = { merchantScopeId: scope };
        if (mongoose.isObjectIdOrHexString(id)) {
          query._id = id;
        } else {
          const vNum = parseInt(id, 10);
          if (Number.isNaN(vNum)) {
            throw new AppError('Invalid configuration version identifier', 400, 'INVALID_VERSION_IDENTIFIER');
          }
          query.version = vNum;
        }

        const targetDoc = await CommerceConfigurationVersion.findOne(query).session(session);
        if (!targetDoc) {
          throw new AppError('Commerce configuration version not found', 404, 'CONFIG_VERSION_NOT_FOUND');
        }

        // 2. Acquire per-scope authority revision lock inside the transaction
        await CommerceConfigurationSequence.acquireAuthorityRevision(scope, { session });

        if (targetDoc.status !== 'validated') {
          throw new AppError(
            `Configuration version v${targetDoc.version} must be validated before activation (current status: '${targetDoc.status}')`,
            409,
            'VERSION_NOT_VALIDATED'
          );
        }

        // 3. Re-evaluate integrity validation inside transaction
        const freshErrors = targetDoc.validateIntegrity();
        if (freshErrors.length > 0) {
          targetDoc.status = 'draft';
          targetDoc.validationErrors = freshErrors;
          await targetDoc.save({ session });
          throw new AppError(
            `Configuration version v${targetDoc.version} failed integrity validation`,
            409,
            'VALIDATION_FAILED'
          );
        }

        const now = new Date();
        const targetEffectiveFrom = effectiveFrom ? new Date(effectiveFrom) : now;
        const isFutureScheduled = targetEffectiveFrom.getTime() > now.getTime() + 60000; // > 1 min in future
        const targetStatus = isFutureScheduled ? 'scheduled' : 'active';
        const targetEffectiveTo = targetDoc.effectiveTo ? new Date(targetDoc.effectiveTo) : null;

        // 4. Query current active / scheduled versions inside transaction for overlap re-evaluation
        const existingVersions = await CommerceConfigurationVersion.find({
          merchantScopeId: scope,
          status: { $in: ['active', 'scheduled'] },
          _id: { $ne: targetDoc._id }
        }).session(session);

        if (targetStatus === 'scheduled') {
          const tFrom = targetEffectiveFrom.getTime();
          const tTo = targetEffectiveTo ? targetEffectiveTo.getTime() : Infinity;

          for (const existing of existingVersions) {
            if (existing.status === 'scheduled') {
              const eFrom = new Date(existing.effectiveFrom).getTime();
              const eTo = existing.effectiveTo ? new Date(existing.effectiveTo).getTime() : Infinity;
              if (Math.max(eFrom, tFrom) < Math.min(eTo, tTo)) {
                throw new AppError(
                  `Scheduled configuration v${targetDoc.version} overlaps with scheduled configuration v${existing.version}`,
                  409,
                  'COMMERCE_CONFIG_SCHEDULE_CONFLICT'
                );
              }
            }
          }
        } else {
          // targetStatus === 'active'
          // Atomically supersede any currently active version in the same transaction
          for (const existing of existingVersions) {
            if (existing.status === 'active') {
              existing.status = 'superseded';
              existing.supersededBy = targetDoc.version;
              existing.supersededAt = now;
              existing.effectiveTo = targetEffectiveFrom;
              existing.quoteAcceptUntil = new Date(now.getTime() + DEFAULT_QUOTE_GRACE_PERIOD_MS);
              existing.lockVersion += 1;
              await existing.save({ session });
            }
          }

          await CommerceConfigurationSequence.findOneAndUpdate(
            { merchantScopeId: scope },
            { $set: { lastActivatedVersion: targetDoc.version } },
            { session }
          );
        }

        targetDoc.status = targetStatus;
        targetDoc.effectiveFrom = targetEffectiveFrom;
        targetDoc.activatedBy = activatorId;
        targetDoc.activatedAt = now;
        targetDoc.lockVersion += 1;
        await targetDoc.save({ session });

        result = targetDoc;
      });

      return result;
    } catch (error) {
      if (
        error.code === 11000
        || (error.name === 'MongoServerError' && error.code === 11000)
        || error.message?.includes('E11000')
        || error.message?.includes('WriteConflict')
      ) {
        throw new AppError(
          'Concurrent activation conflict: another configuration was activated simultaneously',
          409,
          'COMMERCE_CONFIG_ACTIVATION_CONFLICT'
        );
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Retires a configuration version within a transactional boundary. Supports emergency revocation.
   * @param {Object} params
   * @returns {Promise<CommerceConfigurationVersion>}
   */
  async retireVersion({
    id,
    merchantScopeId = null,
    retireId = null,
    reason = '',
    isEmergency = false
  }) {
    if (!merchantScopeId || typeof merchantScopeId !== 'string' || !merchantScopeId.trim()) {
      throw new AppError('Merchant scope identifier is required for version retirement', 400, 'MERCHANT_SCOPE_REQUIRED');
    }
    const scope = merchantScopeId.trim();
    const session = await mongoose.startSession();

    try {
      let result;
      await session.withTransaction(async () => {
        let query = { merchantScopeId: scope };
        if (mongoose.isObjectIdOrHexString(id)) {
          query._id = id;
        } else {
          const vNum = parseInt(id, 10);
          if (Number.isNaN(vNum)) {
            throw new AppError('Invalid configuration version identifier', 400, 'INVALID_VERSION_IDENTIFIER');
          }
          query.version = vNum;
        }

        const doc = await CommerceConfigurationVersion.findOne(query).session(session);
        if (!doc) {
          throw new AppError('Commerce configuration version not found', 404, 'CONFIG_VERSION_NOT_FOUND');
        }

        await CommerceConfigurationSequence.acquireAuthorityRevision(scope, { session });

        const now = new Date();
        doc.status = 'retired';
        doc.effectiveTo = now;
        doc.lockVersion += 1;

        if (isEmergency) {
          doc.revokedAt = now;
          doc.revocationReason = reason || 'Emergency administrator revocation';
          doc.quoteAcceptUntil = now; // Immediate expiry of quote acceptance
        }

        await doc.save({ session });
        result = doc;
      });

      return result;
    } catch (error) {
      if (
        error.code === 11000
        || (error.name === 'MongoServerError' && error.code === 11000)
        || error.message?.includes('E11000')
        || error.message?.includes('WriteConflict')
      ) {
        throw new AppError(
          'Concurrent modification conflict during version retirement',
          409,
          'COMMERCE_CONFIG_CONCURRENCY_CONFLICT'
        );
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Simulates quoting against synthetic cart and destination using specified version.
   * Pure read-only operation with zero database mutations or side effects.
   * @param {Object} params
   * @returns {Promise<Object>}
   */
  async previewQuote({
    configId,
    merchantScopeId = null,
    destination,
    items,
    currency = null,
    couponCode = null,
    shippingServiceLevel = 'standard'
  }) {
    if (!merchantScopeId || typeof merchantScopeId !== 'string' || !merchantScopeId.trim()) {
      throw new AppError('Merchant scope identifier is required for quote preview', 400, 'MERCHANT_SCOPE_REQUIRED');
    }
    const scope = merchantScopeId.trim();
    const config = await this.getVersionById(configId, { merchantScopeId: scope });

    if (!destination || !destination.countryCode) {
      throw new AppError('Destination countryCode is required for preview', 400, 'DESTINATION_REQUIRED');
    }

    const destCountry = destination.countryCode.trim().toUpperCase();
    const originCountry = config.merchantProfile.merchantCountry;
    const targetCurrency = (currency || config.merchantProfile.defaultCurrency || 'PKR').toUpperCase();

    // 1. Calculate synthetic items subtotal
    const calculatedItems = (items || []).map((item, idx) => {
      const unitPriceMoney = Money.fromLegacyNumber(Number(item.price) || 100, targetCurrency);
      const qty = Number(item.quantity) || 1;
      const lineTotalMoney = unitPriceMoney.multiplyRational(qty, 1);
      return {
        itemIndex: idx,
        name: item.name || `Synthetic Item ${idx + 1}`,
        quantity: qty,
        unitPrice: Number(unitPriceMoney.toDecimalString()),
        lineTotal: Number(lineTotalMoney.toDecimalString()),
        lineTotalExact: MoneyMapper.toPersistence(lineTotalMoney),
        weightGrams: Number(item.weightGrams) || 500
      };
    });

    const subtotalMoney = calculatedItems.reduce(
      (sum, it) => sum.add(MoneyMapper.toMoney(it.lineTotalExact)),
      Money.zero(targetCurrency)
    );

    // 2. Shipping Quote via Versioned Rules
    const matchingShippingRule = (config.shippingRules || []).find((r) => (
      r.enabled
      && r.destinationCountry === destCountry
      && (r.serviceCode || '').toLowerCase() === (shippingServiceLevel || 'standard').toLowerCase()
    )) || (config.shippingRules || []).find((r) => r.enabled && r.destinationCountry === destCountry);

    let shippingMoney = Money.zero(targetCurrency);
    let shippingEstimate = { minDays: 3, maxDays: 7 };
    let shippingRuleId = null;

    if (matchingShippingRule) {
      shippingRuleId = matchingShippingRule.ruleId;
      shippingMoney = matchingShippingRule.baseRateExact
        ? MoneyMapper.toMoney(matchingShippingRule.baseRateExact)
        : Money.zero(targetCurrency);
      shippingEstimate = {
        minDays: matchingShippingRule.deliveryMinDays,
        maxDays: matchingShippingRule.deliveryMaxDays
      };
    }

    // 3. Tax & Duty Calculation via Versioned Rules
    const matchingTaxRule = (config.taxRules || []).find((r) => (
      r.enabled && r.destinationCountry === destCountry
    ));

    let taxMoney = Money.zero(targetCurrency);
    let dutyMoney = Money.zero(targetCurrency);
    let taxType = 'EXEMPT';
    let incoterm = destCountry === originCountry ? 'DOMESTIC' : 'DAP';

    if (matchingTaxRule) {
      taxType = matchingTaxRule.taxType;
      incoterm = matchingTaxRule.incoterm || incoterm;

      if (matchingTaxRule.requiresTax && matchingTaxRule.taxRateNumerator > 0) {
        if (matchingTaxRule.taxTreatment === 'inclusive') {
          // Exact inclusive formula: subtotal * numerator / (denominator + numerator)
          taxMoney = subtotalMoney.multiplyRational(
            matchingTaxRule.taxRateNumerator,
            matchingTaxRule.taxRateDenominator + matchingTaxRule.taxRateNumerator,
            matchingTaxRule.roundingMode || 'HALF_UP'
          );
        } else {
          taxMoney = subtotalMoney.multiplyRational(
            matchingTaxRule.taxRateNumerator,
            matchingTaxRule.taxRateDenominator,
            matchingTaxRule.roundingMode || 'HALF_UP'
          );
        }
      }

      if (matchingTaxRule.requiresDuty && matchingTaxRule.dutyRateNumerator > 0) {
        const dutyBase = matchingTaxRule.incoterm === 'DDP'
          ? subtotalMoney.add(shippingMoney)
          : subtotalMoney;
        dutyMoney = dutyBase.multiplyRational(
          matchingTaxRule.dutyRateNumerator,
          matchingTaxRule.dutyRateDenominator,
          matchingTaxRule.roundingMode || 'HALF_UP'
        );
      }
    }

    const payableDuties = incoterm === 'DDP' ? dutyMoney : Money.zero(targetCurrency);
    const grandTotalMoney = subtotalMoney.add(shippingMoney).add(taxMoney).add(payableDuties);

    return {
      previewVersion: config.version,
      previewStatus: config.status,
      merchantScopeId: config.merchantScopeId,
      destinationCountry: destCountry,
      currency: targetCurrency,
      incoterm,
      items: calculatedItems,
      totals: {
        subtotal: Number(subtotalMoney.toDecimalString()),
        shipping: Number(shippingMoney.toDecimalString()),
        tax: Number(taxMoney.toDecimalString()),
        taxType,
        duties: Number(payableDuties.toDecimalString()),
        grandTotal: Number(grandTotalMoney.toDecimalString())
      },
      appliedRules: {
        shippingRuleId,
        taxRuleId: matchingTaxRule ? matchingTaxRule.ruleId : null,
        taxSourceReference: matchingTaxRule ? matchingTaxRule.sourceReference : null,
        taxVerificationStatus: matchingTaxRule ? matchingTaxRule.verificationStatus : 'UNCONFIGURED'
      },
      deliveryEstimate: shippingEstimate
    };
  }

  /**
   * Get sanitized readiness report for a merchant scope.
   * @param {Object} [params]
   * @returns {Promise<Object>}
   */
  async getReadinessStatus({ merchantScopeId = null } = {}) {
    if (!merchantScopeId || typeof merchantScopeId !== 'string' || !merchantScopeId.trim()) {
      throw new AppError('Merchant scope identifier is required for readiness status', 400, 'MERCHANT_SCOPE_REQUIRED');
    }
    const scope = merchantScopeId.trim();
    const active = await this.getActiveConfiguration({ merchantScopeId: scope });

    const recentVersions = await CommerceConfigurationVersion.find({ merchantScopeId: scope })
      .select('version status effectiveFrom effectiveTo validationErrors')
      .sort({ version: -1 })
      .limit(5);

    return {
      merchantScopeId: scope,
      hasActiveConfiguration: Boolean(active),
      activeVersion: active ? active.version : null,
      activeEffectiveFrom: active ? active.effectiveFrom : null,
      activeSellingMode: active ? active.merchantProfile.sellingMode : null,
      enabledCountriesCount: active ? active.merchantProfile.enabledCountries.length : 0,
      enabledCurrenciesCount: active ? active.merchantProfile.enabledCurrencies.length : 0,
      shippingRulesCount: active ? active.shippingRules.length : 0,
      taxRulesCount: active ? active.taxRules.length : 0,
      unverifiedTaxRulesCount: active ? active.taxRules.filter((r) => r.verificationStatus !== 'VERIFIED_LEGAL_RULE').length : 0,
      recentVersions
    };
  }
}

module.exports = new CommerceConfigurationService();
module.exports.CommerceConfigurationService = CommerceConfigurationService;
