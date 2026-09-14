/**
 * @file commerceConfigurationLifecycle.test.js
 * @description Unit tests for Phase 6B versioned commerce configuration lifecycle,
 * concurrency controls, scope isolation, validation engine, and supersession policies.
 */

const mongoose = require('mongoose');
const CommerceConfigurationVersion = require('../../../models/CommerceConfigurationVersion');
const CommerceConfigurationSequence = require('../../../models/CommerceConfigurationSequence');
const CommerceConfigurationService = require('../../../services/commerce/CommerceConfigurationService');

describe('Phase 6B: Commerce Configuration Lifecycle & Concurrency', () => {
  beforeEach(async () => {
    await CommerceConfigurationVersion.deleteMany({});
    await CommerceConfigurationSequence.deleteMany({});
  });

  describe('1. Atomic Sequence & Version Allocation', () => {
    it('1.1 Concurrently allocating versions generates strictly sequential, collision-free numbers', async () => {
      const scope = 'test-scope';
      const promises = Array.from({ length: 10 }).map(() => (
        CommerceConfigurationService.createDraft({
          merchantScopeId: scope,
          initialData: { changeNotes: 'Concurrent draft test' }
        })
      ));

      const drafts = await Promise.all(promises);
      const versions = drafts.map((d) => d.version).sort((a, b) => a - b);

      expect(versions).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    it('1.2 Separate merchant scopes have independent version sequence spaces', async () => {
      const draftA1 = await CommerceConfigurationService.createDraft({ merchantScopeId: 'merchant-a' });
      const draftA2 = await CommerceConfigurationService.createDraft({ merchantScopeId: 'merchant-a' });
      const draftB1 = await CommerceConfigurationService.createDraft({ merchantScopeId: 'merchant-b' });

      expect(draftA1.version).toBe(1);
      expect(draftA2.version).toBe(2);
      expect(draftB1.version).toBe(1);
    });
  });

  describe('2. Draft Lifecycle & Optimistic Concurrency', () => {
    it('2.1 Updating a draft checks expectedLockVersion and rejects stale concurrency', async () => {
      const draft = await CommerceConfigurationService.createDraft({ merchantScopeId: 'default' });

      // First update succeeds
      const updated = await CommerceConfigurationService.updateDraft({
        id: draft._id,
        expectedLockVersion: 1,
        updates: { changeNotes: 'First update' }
      });
      expect(updated.lockVersion).toBe(2);
      expect(updated.changeNotes).toBe('First update');

      // Stale update with old lockVersion fails with 409
      await expect(
        CommerceConfigurationService.updateDraft({
          id: draft._id,
          expectedLockVersion: 1,
          updates: { changeNotes: 'Conflicting stale update' }
        })
      ).rejects.toThrow('Optimistic concurrency conflict');
    });

    it('2.2 Cannot edit published/active configuration version directly', async () => {
      const draft = await CommerceConfigurationService.createDraft({ merchantScopeId: 'default' });
      await CommerceConfigurationService.validateDraft({ id: draft._id });
      await CommerceConfigurationService.scheduleOrActivateVersion({ id: draft._id });

      await expect(
        CommerceConfigurationService.updateDraft({
          id: draft._id,
          updates: { changeNotes: 'Attempted edit on active version' }
        })
      ).rejects.toThrow('Cannot edit configuration version in \'active\' status');
    });
  });

  describe('3. Validation Engine & Integrity Rules', () => {
    it('3.1 Invalid ISO country codes, invalid currencies, or bad locale fail validation', async () => {
      const draft = await CommerceConfigurationService.createDraft({
        merchantScopeId: 'default',
        initialData: {
          merchantProfile: {
            merchantCountry: 'ZZ', // Unrecognized ISO code
            baseCurrency: 'XYZ', // Unrecognized Currency
            defaultCurrency: 'XYZ',
            enabledCurrencies: ['XYZ'],
            enabledCountries: ['ZZ'],
            defaultLocale: 'invalid_locale_format',
            defaultTimeZone: 'Invalid/Zone_Name',
            fulfillmentOrigins: [],
            supportedIncoterms: ['DOMESTIC'],
            taxCalculationMode: 'exact_rational'
          }
        }
      });

      const result = await CommerceConfigurationService.validateDraft({ id: draft._id });
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_MERCHANT_COUNTRY')).toBe(true);
      expect(result.errors.some((e) => e.code === 'INVALID_BASE_CURRENCY')).toBe(true);
      expect(result.errors.some((e) => e.code === 'INVALID_LOCALE_BCP47')).toBe(true);
      expect(result.errors.some((e) => e.code === 'INVALID_TIME_ZONE')).toBe(true);
      expect(result.errors.some((e) => e.code === 'FULFILLMENT_ORIGIN_REQUIRED')).toBe(true);
    });

    it('3.2 Exactly one default fulfillment origin is required per scope', async () => {
      const draft = await CommerceConfigurationService.createDraft({
        merchantScopeId: 'default',
        initialData: {
          merchantProfile: {
            merchantCountry: 'PK',
            baseCurrency: 'PKR',
            defaultCurrency: 'PKR',
            enabledCurrencies: ['PKR'],
            enabledCountries: ['PK'],
            defaultLocale: 'en-PK',
            defaultTimeZone: 'Asia/Karachi',
            fulfillmentOrigins: [
              {
                originId: 'O1',
                name: 'Origin 1',
                country: 'PK',
                city: 'Karachi',
                timeZone: 'Asia/Karachi',
                enabled: true,
                isDefault: true
              },
              {
                originId: 'O2',
                name: 'Origin 2',
                country: 'PK',
                city: 'Lahore',
                timeZone: 'Asia/Karachi',
                enabled: true,
                isDefault: true // Conflicting second default
              }
            ],
            supportedIncoterms: ['DOMESTIC'],
            taxCalculationMode: 'exact_rational'
          }
        }
      });

      const result = await CommerceConfigurationService.validateDraft({ id: draft._id });
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'EXACTLY_ONE_DEFAULT_ORIGIN_REQUIRED')).toBe(true);
    });
  });

  describe('4. Activation, Supersession & Order Acceptability Policy', () => {
    it('4.1 Activating version 2 supersedes version 1 with quote acceptance grace period', async () => {
      // 1. Create and activate v1
      const draft1 = await CommerceConfigurationService.createDraft({ merchantScopeId: 'default' });
      await CommerceConfigurationService.validateDraft({ id: draft1._id });
      const v1 = await CommerceConfigurationService.scheduleOrActivateVersion({ id: draft1._id });
      expect(v1.status).toBe('active');
      expect(v1.isOrderAcceptable()).toBe(true);

      // 2. Create and activate v2
      const draft2 = await CommerceConfigurationService.createDraft({ merchantScopeId: 'default' });
      await CommerceConfigurationService.validateDraft({ id: draft2._id });
      const v2 = await CommerceConfigurationService.scheduleOrActivateVersion({ id: draft2._id });
      expect(v2.status).toBe('active');

      // 3. Inspect v1 supersession
      const refreshedV1 = await CommerceConfigurationVersion.findById(v1._id);
      expect(refreshedV1.status).toBe('superseded');
      expect(refreshedV1.supersededBy).toBe(2);
      expect(refreshedV1.quoteAcceptUntil).not.toBeNull();

      // v1 remains orderAcceptable during the grace period (now <= quoteAcceptUntil)
      expect(refreshedV1.isOrderAcceptable()).toBe(true);

      // Past grace period, v1 is no longer acceptable
      const futureDate = new Date(Date.now() + 30 * 60 * 1000); // 30 mins in future
      expect(refreshedV1.isOrderAcceptable(futureDate)).toBe(false);
    });

    it('4.2 Emergency revocation immediately invalidates quote acceptability', async () => {
      const draft = await CommerceConfigurationService.createDraft({ merchantScopeId: 'default' });
      await CommerceConfigurationService.validateDraft({ id: draft._id });
      await CommerceConfigurationService.scheduleOrActivateVersion({ id: draft._id });

      const retired = await CommerceConfigurationService.retireVersion({
        id: draft._id,
        reason: 'Security incident emergency rollback',
        isEmergency: true
      });

      expect(retired.status).toBe('retired');
      expect(retired.revokedAt).not.toBeNull();
      expect(retired.isOrderAcceptable()).toBe(false);
    });
  });
});
