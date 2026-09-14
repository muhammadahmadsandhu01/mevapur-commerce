/**
 * @file commerceGovernanceController.js
 * @description Admin Governance Controller for global commerce configuration versions.
 * Implements draft authoring, integrity validation, transactional activation, retirement,
 * and pure read-only preview with sanitized non-secret audit logging.
 */

const CommerceConfigurationService = require('../services/commerce/CommerceConfigurationService');
const AuditService = require('../services/AuditService');

class CommerceGovernanceController {
  async listVersions(req, res, next) {
    try {
      const { merchantScopeId = 'default', page = 1, limit = 20, status } = req.query;
      const result = await CommerceConfigurationService.listVersions({
        merchantScopeId,
        page,
        limit,
        status
      });
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async getVersion(req, res, next) {
    try {
      const { id } = req.params;
      const { merchantScopeId } = req.query;
      const version = await CommerceConfigurationService.getVersionById(id, { merchantScopeId });
      res.json({ success: true, data: { version } });
    } catch (error) {
      next(error);
    }
  }

  async createDraft(req, res, next) {
    try {
      const { merchantScopeId = 'default', sourceVersionId, merchantProfile, shippingRules, taxRules, changeNotes } = req.body;
      const authorId = req.user?._id;

      const draft = await CommerceConfigurationService.createDraft({
        merchantScopeId,
        sourceVersionId,
        initialData: { merchantProfile, shippingRules, taxRules, changeNotes },
        authorId
      });

      await AuditService.log({
        requestId: req.headers['x-request-id'] || null,
        userId: authorId,
        eventName: 'COMMERCE.CONFIG.DRAFT_CREATED',
        action: 'COMMERCE.CONFIG.DRAFT_CREATED',
        status: 'SUCCESS',
        ipAddress: req.ip || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        metadata: {
          merchantScopeId: draft.merchantScopeId,
          version: draft.version,
          status: draft.status,
          sourceVersionId: sourceVersionId || null
        }
      });

      res.status(201).json({ success: true, data: { draft } });
    } catch (error) {
      next(error);
    }
  }

  async updateDraft(req, res, next) {
    try {
      const { id } = req.params;
      const { merchantScopeId = 'default', expectedLockVersion, merchantProfile, shippingRules, taxRules, effectiveFrom, effectiveTo, changeNotes } = req.body;
      const authorId = req.user?._id;

      const updated = await CommerceConfigurationService.updateDraft({
        id,
        merchantScopeId,
        updates: { merchantProfile, shippingRules, taxRules, effectiveFrom, effectiveTo, changeNotes },
        expectedLockVersion,
        authorId
      });

      await AuditService.log({
        requestId: req.headers['x-request-id'] || null,
        userId: authorId,
        eventName: 'COMMERCE.CONFIG.DRAFT_UPDATED',
        action: 'COMMERCE.CONFIG.DRAFT_UPDATED',
        status: 'SUCCESS',
        ipAddress: req.ip || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        metadata: {
          merchantScopeId: updated.merchantScopeId,
          version: updated.version,
          status: updated.status,
          lockVersion: updated.lockVersion
        }
      });

      res.json({ success: true, data: { draft: updated } });
    } catch (error) {
      next(error);
    }
  }

  async validateDraft(req, res, next) {
    try {
      const { id } = req.params;
      const merchantScopeId = req.body?.merchantScopeId || req.query?.merchantScopeId || null;
      const validatorId = req.user?._id;

      const result = await CommerceConfigurationService.validateDraft({
        id,
        merchantScopeId,
        validatorId
      });

      await AuditService.log({
        requestId: req.headers['x-request-id'] || null,
        userId: validatorId,
        eventName: 'COMMERCE.CONFIG.VALIDATED',
        action: 'COMMERCE.CONFIG.VALIDATED',
        status: result.isValid ? 'SUCCESS' : 'WARNING',
        ipAddress: req.ip || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        metadata: {
          merchantScopeId: merchantScopeId || 'default',
          version: result.version,
          isValid: result.isValid,
          errorCount: (result.errors || []).length
        }
      });

      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async activateVersion(req, res, next) {
    try {
      const { id } = req.params;
      const { effectiveFrom } = req.body || {};
      const merchantScopeId = req.body?.merchantScopeId || req.query?.merchantScopeId || null;
      const activatorId = req.user?._id;

      const activated = await CommerceConfigurationService.scheduleOrActivateVersion({
        id,
        merchantScopeId,
        activatorId,
        effectiveFrom
      });

      await AuditService.log({
        requestId: req.headers['x-request-id'] || null,
        userId: activatorId,
        eventName: activated.status === 'active' ? 'COMMERCE.CONFIG.ACTIVATED' : 'COMMERCE.CONFIG.SCHEDULED',
        action: activated.status === 'active' ? 'COMMERCE.CONFIG.ACTIVATED' : 'COMMERCE.CONFIG.SCHEDULED',
        status: 'SUCCESS',
        ipAddress: req.ip || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        metadata: {
          merchantScopeId: activated.merchantScopeId,
          version: activated.version,
          status: activated.status,
          effectiveFrom: activated.effectiveFrom
        }
      });

      res.json({ success: true, data: { version: activated } });
    } catch (error) {
      next(error);
    }
  }

  async retireVersion(req, res, next) {
    try {
      const { id } = req.params;
      const { reason, isEmergency } = req.body || {};
      const merchantScopeId = req.body?.merchantScopeId || req.query?.merchantScopeId || null;
      const retireId = req.user?._id;

      const retired = await CommerceConfigurationService.retireVersion({
        id,
        merchantScopeId,
        retireId,
        reason,
        isEmergency
      });

      await AuditService.log({
        requestId: req.headers['x-request-id'] || null,
        userId: retireId,
        eventName: isEmergency ? 'COMMERCE.CONFIG.REVOKED' : 'COMMERCE.CONFIG.RETIRED',
        action: isEmergency ? 'COMMERCE.CONFIG.REVOKED' : 'COMMERCE.CONFIG.RETIRED',
        status: 'SUCCESS',
        ipAddress: req.ip || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        metadata: {
          merchantScopeId: retired.merchantScopeId,
          version: retired.version,
          status: retired.status,
          isEmergency: Boolean(isEmergency),
          reason: reason ? String(reason).slice(0, 200) : null
        }
      });

      res.json({ success: true, data: { version: retired } });
    } catch (error) {
      next(error);
    }
  }

  async previewQuote(req, res, next) {
    try {
      const { configId, merchantScopeId = 'default', destination, items, currency, couponCode, shippingServiceLevel } = req.body;
      const preview = await CommerceConfigurationService.previewQuote({
        configId,
        merchantScopeId,
        destination,
        items,
        currency,
        couponCode,
        shippingServiceLevel
      });

      await AuditService.log({
        requestId: req.headers['x-request-id'] || null,
        userId: req.user?._id || null,
        eventName: 'COMMERCE.CONFIG.PREVIEWED',
        action: 'COMMERCE.CONFIG.PREVIEWED',
        status: 'SUCCESS',
        ipAddress: req.ip || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        metadata: {
          configId,
          merchantScopeId,
          destinationCountry: destination?.countryCode,
          itemCount: (items || []).length,
          grandTotal: preview.totals.grandTotal
        }
      });

      res.json({ success: true, data: { preview } });
    } catch (error) {
      next(error);
    }
  }

  async getReadiness(req, res, next) {
    try {
      const { merchantScopeId = 'default' } = req.query;
      const readiness = await CommerceConfigurationService.getReadinessStatus({ merchantScopeId });
      res.json({ success: true, data: readiness });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new CommerceGovernanceController();
