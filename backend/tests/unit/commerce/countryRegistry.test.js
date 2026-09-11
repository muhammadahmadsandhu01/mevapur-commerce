'use strict';

const CountryRegistry = require('../../../modules/commerce/registries/countryRegistry');
const Address = require('../../../modules/commerce/core/Address');
const CommerceError = require('../../../modules/commerce/core/CommerceError');

describe('CountryRegistry — Complete ISO 3166-1 Metadata Unit Tests', () => {
  it('enforces complete registry integrity (249 unique alpha-2, alpha-3, numeric codes)', () => {
    const countries = CountryRegistry.listCountries();
    const totalCount = CountryRegistry.getRegisteredCount();
    expect(countries.length).toBe(totalCount);
    expect(totalCount).toBe(249);

    const alpha2s = new Set();
    const alpha3s = new Set();
    const numerics = new Set();

    for (const c of countries) {
      expect(alpha2s.has(c.code)).toBe(false);
      expect(alpha3s.has(c.alpha3)).toBe(false);
      expect(numerics.has(c.numeric)).toBe(false);

      alpha2s.add(c.code);
      alpha3s.add(c.alpha3);
      numerics.add(c.numeric);

      expect(c.code).toMatch(/^[A-Z]{2}$/);
      expect(c.alpha3).toMatch(/^[A-Z]{3}$/);
      expect(c.numeric).toMatch(/^[0-9]{3}$/);
      expect(typeof c.numeric).toBe('string');
      expect(c.numeric.length).toBe(3);
      expect(typeof c.name).toBe('string');
      if (c.defaultCurrency !== null) {
        expect(c.defaultCurrency).toMatch(/^[A-Z]{3}$/);
      }
      expect(['required', 'optional', 'not_used', 'unknown']).toContain(c.postalPolicy);
      expect(['required', 'optional', 'unknown']).toContain(c.adminPolicy);
      expect(c.postalCodeRequirement).toBe(c.postalPolicy);
      expect(c.administrativeAreaRequirement).toBe(c.adminPolicy);
      expect(c.administrativeAreaType).toBe(c.adminType);
      expect(Object.isFrozen(c)).toBe(true);
    }
  });

  it('preserves leading zeros in 3-character numeric country codes as strings', () => {
    // 004 Afghanistan
    const af = CountryRegistry.getCountry('004');
    expect(af.code).toBe('AF');
    expect(af.numeric).toBe('004');
    expect(typeof af.numeric).toBe('string');

    // 008 Albania
    const al = CountryRegistry.getCountry('008');
    expect(al.code).toBe('AL');
    expect(al.numeric).toBe('008');

    // 010 Antarctica
    const aq = CountryRegistry.getCountry('010');
    expect(aq.code).toBe('AQ');
    expect(aq.numeric).toBe('010');

    // 036 Australia
    const au = CountryRegistry.getCountry('036');
    expect(au.code).toBe('AU');
    expect(au.numeric).toBe('036');

    // 040 Austria
    const at = CountryRegistry.getCountry('040');
    expect(at.code).toBe('AT');
    expect(at.numeric).toBe('040');

    // 048 Bahrain
    const bh = CountryRegistry.getCountry('048');
    expect(bh.code).toBe('BH');
    expect(bh.numeric).toBe('048');

    // 050 Bangladesh
    const bd = CountryRegistry.getCountry('050');
    expect(bd.code).toBe('BD');
    expect(bd.numeric).toBe('050');

    // 056 Belgium
    const be = CountryRegistry.getCountry('056');
    expect(be.code).toBe('BE');
    expect(be.numeric).toBe('056');

    // 032 Argentina
    const ar = CountryRegistry.getCountry('032');
    expect(ar.code).toBe('AR');
    expect(ar.numeric).toBe('032');
  });

  it('proves separated provenance metadata across identity, telecom, and address policies', () => {
    const prov = CountryRegistry.getRegistryProvenance();
    expect(prov.identityStandard).toBe('ISO 3166-1');
    expect(prov.identitySource).toBe('ISO 3166 Maintenance Agency (ISO 3166/MA)');
    expect(prov.identityPublication).toBe('ISO 3166-1:2020 (Officially Assigned Country Codes)');
    expect(prov.telecomStandard).toBe('ITU-T E.164');
    expect(prov.addressPolicyStandard).toBe('UPU / MevaPur Commerce Address Baseline');
    expect(prov.addressPolicySnapshot).toBe('MevaPur Address Baseline Policy v1.0');
    expect(prov.snapshotDate).toBe('2026-09-11');

    const pk = CountryRegistry.getCountry('PK');
    expect(pk.provenance).toBe(prov);
  });

  it('resolves newly expanded countries across all continental regions and territories', () => {
    // Europe
    expect(CountryRegistry.getCountry('AD').name).toBe('Andorra');
    expect(CountryRegistry.getCountry('AL').name).toBe('Albania');
    expect(CountryRegistry.getCountry('BA').name).toBe('Bosnia and Herzegovina');
    expect(CountryRegistry.getCountry('BG').name).toBe('Bulgaria');
    expect(CountryRegistry.getCountry('BG').defaultCurrency).toBe('EUR');
    expect(CountryRegistry.getCountry('EE').name).toBe('Estonia');
    expect(CountryRegistry.getCountry('IS').name).toBe('Iceland');

    // Africa
    expect(CountryRegistry.getCountry('GH').name).toBe('Ghana');
    expect(CountryRegistry.getCountry('ET').name).toBe('Ethiopia');
    expect(CountryRegistry.getCountry('AO').name).toBe('Angola');
    expect(CountryRegistry.getCountry('DZ').name).toBe('Algeria');
    expect(CountryRegistry.getCountry('ZW').name).toBe('Zimbabwe');
    expect(CountryRegistry.getCountry('ZW').defaultCurrency).toBe('ZWG');

    // Oceania
    expect(CountryRegistry.getCountry('FJ').name).toBe('Fiji');
    expect(CountryRegistry.getCountry('KI').name).toBe('Kiribati');
    expect(CountryRegistry.getCountry('NR').name).toBe('Nauru');
    expect(CountryRegistry.getCountry('PG').name).toBe('Papua New Guinea');
    expect(CountryRegistry.getCountry('WS').name).toBe('Samoa');

    // Americas
    expect(CountryRegistry.getCountry('AG').name).toBe('Antigua and Barbuda');
    expect(CountryRegistry.getCountry('BB').name).toBe('Barbados');
    expect(CountryRegistry.getCountry('BZ').name).toBe('Belize');
    expect(CountryRegistry.getCountry('CR').name).toBe('Costa Rica');
    expect(CountryRegistry.getCountry('CU').name).toBe('Cuba');

    // Territories
    expect(CountryRegistry.getCountry('AI').name).toBe('Anguilla');
    expect(CountryRegistry.getCountry('AQ').name).toBe('Antarctica');
    expect(CountryRegistry.getCountry('AX').name).toBe('Åland Islands');
    expect(CountryRegistry.getCountry('BM').name).toBe('Bermuda');
    expect(CountryRegistry.getCountry('GL').name).toBe('Greenland');
  });

  it('proves neutral Address construction succeeds for any recognized country with unknown policy', () => {
    // Fiji (FJ, unknown policy): constructs neutrally without requiring postal or admin area
    const fj = Address.create({
      fullName: 'Seru Rabuka',
      addressLine1: 'Victoria Parade 10',
      locality: 'Suva',
      countryCode: 'FJ'
    });
    expect(fj.countryCode).toBe('FJ');
    expect(fj.postalCode).toBe('');
    expect(fj.administrativeArea).toBe('');

    // Ghana (GH, unknown policy): preserves supplied postal and admin area
    const gh = Address.create({
      fullName: 'Kwame Mensah',
      addressLine1: 'Independence Avenue 24',
      locality: 'Accra',
      administrativeArea: 'Greater Accra',
      postalCode: 'GA-183-9020',
      countryCode: 'GH'
    });
    expect(gh.countryCode).toBe('GH');
    expect(gh.administrativeArea).toBe('Greater Accra');
    expect(gh.postalCode).toBe('GA-183-9020');
  });

  it('recognizes calling codes as non-unique telecom metadata', () => {
    const us = CountryRegistry.getCountry('US');
    const ca = CountryRegistry.getCountry('CA');
    expect(us.callingCode).toBe('+1');
    expect(ca.callingCode).toBe('+1');
    expect(us.code).not.toBe(ca.code);
  });

  it('normalizes lowercase queries to uppercase and supports alpha-2 / alpha-3 / numeric resolution', () => {
    const pk = CountryRegistry.getCountry('pk');
    expect(pk.code).toBe('PK');
    expect(pk.name).toBe('Pakistan');
    expect(pk.defaultCurrency).toBe('PKR');

    const usFromAlpha3 = CountryRegistry.getCountry('USA');
    expect(usFromAlpha3.code).toBe('US');

    const deFromNumeric = CountryRegistry.getCountry('276');
    expect(deFromNumeric.code).toBe('DE');
  });

  it('rejects unknown country codes with COMMERCE_COUNTRY_UNKNOWN', () => {
    expect(() => CountryRegistry.getCountry('ZZ')).toThrow(CommerceError);
    expect(() => CountryRegistry.getCountry('ZZ')).toThrow(/Unknown or unsupported ISO 3166-1/);
    expect(() => CountryRegistry.getCountry('')).toThrow(CommerceError);
    expect(() => CountryRegistry.getCountry('TOOLONG')).toThrow(CommerceError);
  });

  it('verifies postal-code requirement classifications', () => {
    // Required
    expect(CountryRegistry.isPostalCodeRequired('PK')).toBe(true);
    expect(CountryRegistry.isPostalCodeRequired('US')).toBe(true);
    expect(CountryRegistry.isPostalCodeRequired('GB')).toBe(true);
    expect(CountryRegistry.isPostalCodeRequired('DE')).toBe(true);
    expect(CountryRegistry.isPostalCodeRequired('CA')).toBe(true);

    // Not used / not required
    expect(CountryRegistry.isPostalCodeRequired('AE')).toBe(false);
    expect(CountryRegistry.isPostalCodeRequired('QA')).toBe(false);
    expect(CountryRegistry.isPostalCodeRequired('OM')).toBe(false);
    expect(CountryRegistry.isPostalCodeRequired('HK')).toBe(false);

    // Unknown policy
    expect(CountryRegistry.isPostalCodeRequired('AQ')).toBe(false);
    expect(CountryRegistry.isPostalCodeRequired('FJ')).toBe(false);
  });

  it('verifies administrative-area requirement classifications', () => {
    // Required
    expect(CountryRegistry.isAdministrativeAreaRequired('PK')).toBe(true); // Province
    expect(CountryRegistry.isAdministrativeAreaRequired('US')).toBe(true); // State
    expect(CountryRegistry.isAdministrativeAreaRequired('CA')).toBe(true); // Province
    expect(CountryRegistry.isAdministrativeAreaRequired('AE')).toBe(true); // Emirate
    expect(CountryRegistry.isAdministrativeAreaRequired('AU')).toBe(true); // State

    // Optional
    expect(CountryRegistry.isAdministrativeAreaRequired('GB')).toBe(false); // County optional
    expect(CountryRegistry.isAdministrativeAreaRequired('DE')).toBe(false); // State optional
    expect(CountryRegistry.isAdministrativeAreaRequired('SG')).toBe(false); // City-state

    // Unknown policy
    expect(CountryRegistry.isAdministrativeAreaRequired('AQ')).toBe(false);
    expect(CountryRegistry.isAdministrativeAreaRequired('GH')).toBe(false);
  });
});
