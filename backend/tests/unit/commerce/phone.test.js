'use strict';

const Phone = require('../../../modules/commerce/core/Phone');
const CommerceError = require('../../../modules/commerce/core/CommerceError');

describe('Phone — Country-Aware E.164 Value Object Unit Tests', () => {
  it('parses valid national numbers with country context (PK, AE, GB, US, DE)', () => {
    // Pakistan local mobile
    const pk = Phone.parse('03001234567', 'PK');
    expect(pk.e164).toBe('+923001234567');
    expect(pk.callingCode).toBe('92');
    expect(pk.countryCode).toBe('PK');
    expect(pk.nationalNumber).toBe('3001234567');

    // UAE local mobile
    const ae = Phone.parse('050 123 4567', 'AE');
    expect(ae.e164).toBe('+971501234567');
    expect(ae.countryCode).toBe('AE');

    // UK local landline
    const gb = Phone.parse('020 7183 8750', 'GB');
    expect(gb.e164).toBe('+442071838750');
    expect(gb.countryCode).toBe('GB');

    // US local number with area code
    const us = Phone.parse('(415) 555-2671', 'US');
    expect(us.e164).toBe('+14155552671');
    expect(us.countryCode).toBe('US');

    // Germany local number
    const de = Phone.parse('030 123456', 'DE');
    expect(de.e164).toBe('+4930123456');
    expect(de.countryCode).toBe('DE');
  });

  it('parses international E.164 inputs without requiring default country context', () => {
    const pk = Phone.parse('+923001234567');
    expect(pk.e164).toBe('+923001234567');
    expect(pk.countryCode).toBe('PK');

    const us = Phone.parse('+14155552671');
    expect(us.e164).toBe('+14155552671');
    expect(us.countryCode).toBe('US');
  });

  it('requires country context for national format phone numbers', () => {
    expect(() => Phone.parse('03001234567')).toThrow(CommerceError);
    expect(() => Phone.parse('03001234567')).toThrow(/Country context is required/);
    expect(() => Phone.parse('(415) 555-2671')).toThrow(CommerceError);
  });

  it('distinguishes structurally impossible numbers from possible but invalid numbers', () => {
    // 1. Impossible length/structure for PK (too short)
    expect(() => Phone.parse('12345', 'PK')).toThrow(CommerceError);
    expect(() => Phone.parse('12345', 'PK')).toThrow(/impossible/);

    // 2. Structurally possible length (10 digits in US) but invalid area code (starts with 1 or 0)
    // In NANP (US), area codes cannot start with 1 (e.g. (123) 456-7890 is possible length 10 but invalid)
    expect(() => Phone.parse('+11234567890')).toThrow(CommerceError);
    expect(() => Phone.parse('(123) 456-7890', 'US')).toThrow(CommerceError);
  });

  it('supports national and international formatting methods', () => {
    const pk = Phone.parse('+923001234567');
    expect(pk.toInternational()).toMatch(/^\+92/);
    expect(pk.toNational()).toMatch(/^0300/);
  });

  it('provides secure PII-redacted representation for audit logs', () => {
    const phone = Phone.parse('+923001234567');
    expect(phone.toRedacted()).toBe('+92300****567');

    const us = Phone.parse('+14155552671');
    expect(us.toRedacted()).toBe('+1415****671');
  });

  it('separates phone extension when present', () => {
    const extPhone = Phone.parse('+14155552671 ext. 1234', 'US');
    expect(extPhone.e164).toBe('+14155552671');
    expect(extPhone.extension).toBe('1234');
  });

  it('rejects empty, unsupported country context, or oversized phone numbers', () => {
    expect(() => Phone.parse('', 'PK')).toThrow(CommerceError);
    expect(() => Phone.parse('   ', 'PK')).toThrow(CommerceError);
    expect(() => Phone.parse(12345)).toThrow(CommerceError);
    expect(() => Phone.parse('03001234567', 'ZZ')).toThrow(CommerceError);
    expect(() => Phone.parse('03001234567'.repeat(6), 'PK')).toThrow(CommerceError);
    expect(() => Phone.parse('+99912345678')).toThrow(CommerceError);
  });

  it('provides snapshot plain object serialization and immutability', () => {
    const phone = Phone.parse('+923001234567');
    const plain = phone.toPlainObject();

    expect(plain).toEqual({
      e164: '+923001234567',
      countryCode: 'PK',
      callingCode: '92',
      nationalNumber: '3001234567',
      extension: ''
    });

    expect(Object.isFrozen(phone)).toBe(true);
    expect(() => {
      phone.e164 = '+1000';
    }).toThrow();
  });
});
