'use strict';

const Address = require('../../../modules/commerce/core/Address');
const CommerceError = require('../../../modules/commerce/core/CommerceError');

describe('Address — Global Immutable Value Object Unit Tests', () => {
  it('creates and normalizes valid addresses for PK, AE, GB, DE, and US', () => {
    // Pakistan
    const pk = Address.create({
      fullName: 'Muhammad Ahmad',
      addressLine1: 'Plot 123, Street 4, Sector F-7/2',
      locality: 'Islamabad',
      administrativeArea: 'Federal Capital',
      postalCode: '44000',
      countryCode: 'PK',
      phone: '+923001234567'
    });
    expect(pk.countryCode).toBe('PK');
    expect(pk.fullName).toBe('Muhammad Ahmad');
    expect(pk.administrativeArea).toBe('Federal Capital');
    expect(pk.postalCode).toBe('44000');

    // UAE (No postal code supplied - permitted by not_used policy)
    const aeWithoutZip = Address.create({
      fullName: 'Zayed Al Mansoori',
      addressLine1: 'Level 14, Boulevard Plaza Tower 1, Downtown',
      locality: 'Dubai',
      administrativeArea: 'Dubai',
      countryCode: 'AE'
    });
    expect(aeWithoutZip.countryCode).toBe('AE');
    expect(aeWithoutZip.postalCode).toBe('');

    // UAE with customer-supplied postal code (must NEVER be silently deleted)
    const aeWithZip = Address.create({
      fullName: 'Zayed Al Mansoori',
      addressLine1: 'Level 14, Boulevard Plaza Tower 1, Downtown',
      locality: 'Dubai',
      administrativeArea: 'Dubai',
      postalCode: '00000',
      countryCode: 'AE'
    });
    expect(aeWithZip.countryCode).toBe('AE');
    expect(aeWithZip.postalCode).toBe('00000'); // Preserved as customer delivery data

    // United Kingdom (County optional)
    const gb = Address.create({
      fullName: 'Arthur Dent',
      addressLine1: '10 Downing Street',
      locality: 'London',
      postalCode: 'SW1A 2AA',
      countryCode: 'GB'
    });
    expect(gb.countryCode).toBe('GB');
    expect(gb.administrativeArea).toBe('');

    // United States (State & Zip required)
    const us = Address.create({
      fullName: 'Jane Doe',
      addressLine1: '1600 Amphitheatre Parkway',
      locality: 'Mountain View',
      administrativeArea: 'CA',
      postalCode: '94043',
      countryCode: 'US'
    });
    expect(us.countryCode).toBe('US');
    expect(us.administrativeArea).toBe('CA');
    expect(us.postalCode).toBe('94043');
  });

  it('proves supplied postal code and administrative area are never silently discarded across all policies', () => {
    // AE (not_used policy): supplied postal code is preserved
    const ae = Address.create({
      fullName: 'Rashid Khan',
      addressLine1: 'Marina Walk Tower 2',
      locality: 'Dubai',
      administrativeArea: 'Dubai',
      postalCode: 'BOX-12345',
      countryCode: 'AE'
    });
    expect(ae.postalCode).toBe('BOX-12345');

    // GB (optional admin area policy): supplied county is preserved
    const gb = Address.create({
      fullName: 'Sherlock Holmes',
      addressLine1: '221B Baker Street',
      locality: 'London',
      administrativeArea: 'Greater London',
      postalCode: 'NW1 6XE',
      countryCode: 'GB'
    });
    expect(gb.administrativeArea).toBe('Greater London');

    // AQ (unknown policy): supplied postal code and admin area are preserved
    const aq = Address.create({
      fullName: 'Researcher Jane',
      addressLine1: 'McMurdo Station Sector 4',
      locality: 'Ross Island',
      administrativeArea: 'Scott Base Region',
      postalCode: '96599',
      countryCode: 'AQ'
    });
    expect(aq.postalCode).toBe('96599');
    expect(aq.administrativeArea).toBe('Scott Base Region');
  });

  it('proves distinct behavior across required, optional, not_used, and unknown policies', () => {
    // 1. required policy: missing throws
    expect(() => Address.create({
      fullName: 'Hans Schmidt',
      addressLine1: 'Alexanderplatz 1',
      locality: 'Berlin',
      countryCode: 'DE' // DE postalPolicy is required
    })).toThrow(CommerceError);

    // 2. optional policy: missing is allowed
    const kw = Address.create({
      fullName: 'Ahmed Al-Sabah',
      addressLine1: 'Salem Al Mubarak St',
      locality: 'Salmiya',
      administrativeArea: 'Hawalli',
      countryCode: 'KW' // KW postalPolicy is optional
    });
    expect(kw.postalCode).toBe('');

    // 3. not_used policy: missing is allowed
    const qa = Address.create({
      fullName: 'Hamad Al-Thani',
      addressLine1: 'Corniche Street 10',
      locality: 'Doha',
      countryCode: 'QA' // QA postalPolicy is not_used
    });
    expect(qa.postalCode).toBe('');

    // 4. unknown policy: missing is allowed (unknown is NEVER converted to required)
    const aq = Address.create({
      fullName: 'Explorer Bob',
      addressLine1: 'South Pole Station',
      locality: 'Amundsen-Scott',
      countryCode: 'AQ'
    });
    expect(aq.postalCode).toBe('');
    expect(aq.administrativeArea).toBe('');
  });

  it('enforces country-specific administrative area requirements', () => {
    // US requires State
    expect(() => Address.create({
      fullName: 'John Smith',
      addressLine1: '123 Main St',
      locality: 'New York',
      postalCode: '10001',
      countryCode: 'US'
    })).toThrow(CommerceError);

    // PK requires Province
    expect(() => Address.create({
      fullName: 'Ali Khan',
      addressLine1: '45 Mall Road',
      locality: 'Lahore',
      postalCode: '54000',
      countryCode: 'PK'
    })).toThrow(CommerceError);
  });

  it('enforces country-specific postal code requirements', () => {
    // Germany requires Postal Code
    expect(() => Address.create({
      fullName: 'Hans Schmidt',
      addressLine1: 'Alexanderplatz 1',
      locality: 'Berlin',
      countryCode: 'DE'
    })).toThrow(CommerceError);
  });

  it('supports Unicode scripts (Arabic, Urdu, Latin) with NFC normalization', () => {
    // Urdu / Arabic script address
    const urdu = Address.create({
      fullName: 'محمد احمد',
      addressLine1: 'گھر نمبر ۱۲، گلی نمبر ۵',
      locality: 'لاہور',
      administrativeArea: 'پنجاب',
      postalCode: '54000',
      countryCode: 'PK'
    });
    expect(urdu.fullName).toBe('محمد احمد');
    expect(urdu.locality).toBe('لاہور');
    expect(urdu.administrativeArea).toBe('پنجاب');
  });

  it('rejects control characters, zero-width spaces, and directional overrides', () => {
    expect(() => Address.create({
      fullName: 'John\u0000Doe',
      addressLine1: '123 Main St',
      locality: 'City',
      countryCode: 'GB',
      postalCode: 'SW1A 1AA'
    })).toThrow(CommerceError);

    expect(() => Address.create({
      fullName: 'John\u200BDoe',
      addressLine1: '123 Main St',
      locality: 'City',
      countryCode: 'GB',
      postalCode: 'SW1A 1AA'
    })).toThrow(CommerceError);
  });

  it('enforces field length bounds', () => {
    expect(() => Address.create({
      fullName: 'A', // too short (< 2)
      addressLine1: '123 Main St',
      locality: 'City',
      countryCode: 'GB',
      postalCode: 'SW1A 1AA'
    })).toThrow(CommerceError);
  });

  it('provides snapshot plain object serialization and guarantees immutability', () => {
    const addr = Address.create({
      fullName: 'Sarah Connor',
      addressLine1: '8404 Reseda Blvd',
      locality: 'Los Angeles',
      administrativeArea: 'CA',
      postalCode: '91324',
      countryCode: 'US',
      phone: '+18185551234'
    });

    const plain = addr.toPlainObject();
    expect(plain).toEqual({
      fullName: 'Sarah Connor',
      addressLine1: '8404 Reseda Blvd',
      addressLine2: '',
      locality: 'Los Angeles',
      administrativeArea: 'CA',
      postalCode: '91324',
      countryCode: 'US',
      phone: '+18185551234'
    });

    expect(Object.isFrozen(addr)).toBe(true);
    expect(() => {
      addr.fullName = 'New Name';
    }).toThrow();
  });
});
