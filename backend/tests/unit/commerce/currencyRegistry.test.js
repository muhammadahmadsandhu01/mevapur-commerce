'use strict';

const CurrencyRegistry = require('../../../modules/commerce/registries/currencyRegistry');
const Money = require('../../../modules/commerce/core/Money');
const CommerceError = require('../../../modules/commerce/core/CommerceError');

describe('CurrencyRegistry — Complete ISO 4217 Metadata Unit Tests', () => {
  it('enforces complete registry integrity (unique alphabetic, numeric codes, 189 total, 178 List One, 11 historical)', () => {
    const currencies = CurrencyRegistry.listCurrencies({ status: 'all', commercialOnly: false });
    const totalCount = CurrencyRegistry.getRegisteredCount();
    expect(currencies.length).toBe(totalCount);
    expect(totalCount).toBe(189);

    const counts = CurrencyRegistry.getCategoryCounts();
    expect(counts.total).toBe(189);
    expect(counts.totalEntries).toBe(189);
    expect(counts.currentListOneEntries).toBe(178);
    expect(counts.deprecatedHistorical).toBe(11);

    const codes = new Set();
    const numerics = new Set();

    for (const curr of currencies) {
      expect(codes.has(curr.code)).toBe(false);
      expect(numerics.has(curr.numericCode)).toBe(false);
      codes.add(curr.code);
      numerics.add(curr.numericCode);

      expect(typeof curr.code).toBe('string');
      expect(curr.code).toMatch(/^[A-Z]{3}$/);
      expect(typeof curr.numericCode).toBe('string');
      expect(curr.numericCode).toMatch(/^[0-9]{3}$/);
      expect(curr.numericCode.length).toBe(3);

      if (curr.exponent !== null) {
        expect(Number.isInteger(curr.exponent)).toBe(true);
        expect(curr.exponent).toBeGreaterThanOrEqual(0);
        expect(curr.exponent).toBeLessThanOrEqual(4);
      } else {
        expect(['metal', 'special', 'test']).toContain(curr.type);
      }

      expect(['fiat', 'fund', 'metal', 'special', 'test']).toContain(curr.type);
      expect(['active', 'deprecated']).toContain(curr.status);
      expect(typeof curr.commerciallyUsable).toBe('boolean');

      // Every commercially usable currency must have a valid numeric exponent
      if (curr.commerciallyUsable) {
        expect(Number.isInteger(curr.exponent)).toBe(true);
        expect(curr.status).toBe('active');
        expect(curr.type).toBe('fiat');
      }

      expect(Object.isFrozen(curr)).toBe(true);
    }
  });

  it('programmatically reconciles mutually exclusive category breakdown totals', () => {
    const counts = CurrencyRegistry.getCategoryCounts();

    expect(counts.total).toBe(189);
    expect(counts.activeCommercial).toBe(156);
    expect(counts.funds).toBe(9);
    expect(counts.metals).toBe(4);
    expect(counts.specialPurpose).toBe(7);
    expect(counts.testingNoCurrency).toBe(2);
    expect(counts.deprecatedHistorical).toBe(11);

    const reconstructedSum =
      counts.activeCommercial +
      counts.funds +
      counts.metals +
      counts.specialPurpose +
      counts.testingNoCurrency +
      counts.deprecatedHistorical;

    expect(reconstructedSum).toBe(counts.total);
    expect(reconstructedSum).toBe(189);

    const currentListOneSum =
      counts.activeCommercial +
      counts.funds +
      counts.metals +
      counts.specialPurpose +
      counts.testingNoCurrency;

    expect(currentListOneSum).toBe(counts.currentListOneEntries);
    expect(currentListOneSum).toBe(178);
  });

  it('preserves leading zeros in 3-character numeric currency codes as strings', () => {
    const all = CurrencyRegistry.getCurrency('008');
    expect(all.code).toBe('ALL');
    expect(all.numericCode).toBe('008');
    expect(typeof all.numericCode).toBe('string');

    const dzd = CurrencyRegistry.getCurrency('012');
    expect(dzd.code).toBe('DZD');
    expect(dzd.numericCode).toBe('012');

    const ars = CurrencyRegistry.getCurrency('032');
    expect(ars.code).toBe('ARS');
    expect(ars.numericCode).toBe('032');

    const aud = CurrencyRegistry.getCurrency('036');
    expect(aud.code).toBe('AUD');
    expect(aud.numericCode).toBe('036');

    const bhd = CurrencyRegistry.getCurrency('048');
    expect(bhd.code).toBe('BHD');
    expect(bhd.numericCode).toBe('048');

    const bdt = CurrencyRegistry.getCurrency('050');
    expect(bdt.code).toBe('BDT');
    expect(bdt.numericCode).toBe('050');

    const amd = CurrencyRegistry.getCurrency('051');
    expect(amd.code).toBe('AMD');
    expect(amd.numericCode).toBe('051');

    const bbd = CurrencyRegistry.getCurrency('052');
    expect(bbd.code).toBe('BBD');
    expect(bbd.numericCode).toBe('052');

    const bmd = CurrencyRegistry.getCurrency('060');
    expect(bmd.code).toBe('BMD');
    expect(bmd.numericCode).toBe('060');

    const btn = CurrencyRegistry.getCurrency('064');
    expect(btn.code).toBe('BTN');
    expect(btn.numericCode).toBe('064');

    const bob = CurrencyRegistry.getCurrency('068');
    expect(bob.code).toBe('BOB');
    expect(bob.numericCode).toBe('068');

    const bwp = CurrencyRegistry.getCurrency('072');
    expect(bwp.code).toBe('BWP');
    expect(bwp.numericCode).toBe('072');

    const bzd = CurrencyRegistry.getCurrency('084');
    expect(bzd.code).toBe('BZD');
    expect(bzd.numericCode).toBe('084');

    const sbd = CurrencyRegistry.getCurrency('090');
    expect(sbd.code).toBe('SBD');
    expect(sbd.numericCode).toBe('090');

    const bnd = CurrencyRegistry.getCurrency('096');
    expect(bnd.code).toBe('BND');
    expect(bnd.numericCode).toBe('096');
  });

  it('proves ISO 4217 registry provenance and snapshot metadata', () => {
    const prov = CurrencyRegistry.getRegistryProvenance();
    expect(prov.standard).toBe('ISO 4217');
    expect(prov.maintenanceAgency).toBe('SIX Financial Information AG');
    expect(prov.sourceListOneUrl).toBe('https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml');
    expect(prov.sourceListOneSha256).toBe('838dfb991648cf36df939edd5fe3811737962b75a32252847d239cedd1e291c9');
    expect(prov.sourceListThreeUrl).toBe('https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-three.xml');
    expect(prov.sourceListThreeSha256).toBe('98fde2423cdb916dd59dcf5fe96222edad8fa198d865c1c83dbc464b9cc52387');
    expect(prov.snapshotName).toBe('MevaPur currency snapshot 2026-09');
    expect(prov.commercialPolicySnapshot).toBe('MevaPur Commercial Eligibility Policy v1.0');

    const pkr = CurrencyRegistry.getCurrency('PKR');
    expect(pkr.provenance).toBe(prov);
  });

  it('verifies EUR is active commercial currency and Bulgaria uses EUR', () => {
    const eur = CurrencyRegistry.getCurrency('EUR');
    expect(eur.code).toBe('EUR');
    expect(eur.numericCode).toBe('978');
    expect(eur.exponent).toBe(2);
    expect(eur.status).toBe('active');
    expect(eur.commerciallyUsable).toBe(true);

    const eurMoney = Money.fromDecimal('100.50', 'EUR');
    expect(eurMoney.amountMinor).toBe(10050n);
    expect(eurMoney.toDecimalString()).toBe('100.50');
  });

  it('verifies BGN is historical deprecated and rejected by default', () => {
    expect(() => CurrencyRegistry.getCurrency('BGN')).toThrow(CommerceError);
    expect(() => CurrencyRegistry.getCurrency('BGN')).toThrow(/deprecated/);

    expect(() => Money.fromDecimal('50.00', 'BGN')).toThrow(CommerceError);
    expect(() => Money.fromDecimal('50.00', 'BGN')).toThrow(/deprecated/);

    const bgn = CurrencyRegistry.getCurrency('BGN', { allowDeprecated: true });
    expect(bgn.code).toBe('BGN');
    expect(bgn.numericCode).toBe('975');
    expect(bgn.exponent).toBe(2);
    expect(bgn.status).toBe('deprecated');
    expect(bgn.commerciallyUsable).toBe(false);

    const bgnMoney = Money.fromDecimal('50.00', 'BGN', { allowDeprecated: true });
    expect(bgnMoney.amountMinor).toBe(5000n);
  });

  it('verifies Zimbabwe currency transition: ZWG is active commercial and ZWL is historical deprecated', () => {
    // ZWG: Zimbabwe Gold (ISO 4217 active from List One)
    const zwg = CurrencyRegistry.getCurrency('ZWG');
    expect(zwg.code).toBe('ZWG');
    expect(zwg.numericCode).toBe('924');
    expect(zwg.exponent).toBe(2);
    expect(zwg.status).toBe('active');
    expect(zwg.commerciallyUsable).toBe(true);

    const zwgMoney = Money.fromDecimal('250.00', 'ZWG');
    expect(zwgMoney.amountMinor).toBe(25000n);
    expect(zwgMoney.toDecimalString()).toBe('250.00');

    // ZWL: Zimbabwean Dollar (historical from List Three)
    expect(() => CurrencyRegistry.getCurrency('ZWL')).toThrow(CommerceError);
    expect(() => CurrencyRegistry.getCurrency('ZWL')).toThrow(/deprecated/);

    const zwl = CurrencyRegistry.getCurrency('ZWL', { allowDeprecated: true });
    expect(zwl.code).toBe('ZWL');
    expect(zwl.numericCode).toBe('932');
    expect(zwl.exponent).toBe(2);
    expect(zwl.status).toBe('deprecated');
    expect(zwl.commerciallyUsable).toBe(false);

    // ZWD: Older historical
    expect(() => CurrencyRegistry.getCurrency('ZWD')).toThrow(CommerceError);
    const zwd = CurrencyRegistry.getCurrency('ZWD', { allowDeprecated: true });
    expect(zwd.code).toBe('ZWD');
    expect(zwd.numericCode).toBe('716');
  });

  it('supports representative currencies across global regions in exact Money operations', () => {
    // East Caribbean Dollar (XCD)
    const xcd = Money.fromDecimal('100.00', 'XCD');
    expect(xcd.amountMinor).toBe(10000n);
    expect(xcd.toDecimalString()).toBe('100.00');

    // Georgian Lari (GEL)
    const gel = Money.fromDecimal('50.25', 'GEL');
    expect(gel.amountMinor).toBe(5025n);

    // Armenian Dram (AMD)
    const amd = Money.fromDecimal('1000.00', 'AMD');
    expect(amd.amountMinor).toBe(100000n);

    // Ukrainian Hryvnia (UAH)
    const uah = Money.fromDecimal('750.50', 'UAH');
    expect(uah.amountMinor).toBe(75050n);

    // West African CFA Franc (XOF, 0 decimals)
    const xof = Money.fromDecimal('5000', 'XOF');
    expect(xof.amountMinor).toBe(5000n);
    expect(xof.exponent).toBe(0);
  });

  it('normalizes lowercase currency code queries to uppercase', () => {
    const pkr = CurrencyRegistry.getCurrency('pkr');
    expect(pkr.code).toBe('PKR');
    expect(pkr.exponent).toBe(2);
    expect(pkr.numericCode).toBe('586');

    const usd = CurrencyRegistry.getCurrency('  usd  ');
    expect(usd.code).toBe('USD');
    expect(usd.exponent).toBe(2);
  });

  it('resolves by ISO 4217 3-digit numeric code', () => {
    const pkr = CurrencyRegistry.getCurrency('586');
    expect(pkr.code).toBe('PKR');

    const usd = CurrencyRegistry.getCurrency('840');
    expect(usd.code).toBe('USD');

    const jpy = CurrencyRegistry.getCurrency('392');
    expect(jpy.code).toBe('JPY');
  });

  it('rejects unknown or malformed currency codes with COMMERCE_CURRENCY_UNKNOWN', () => {
    expect(() => CurrencyRegistry.getCurrency('XYZ')).toThrow(CommerceError);
    expect(() => CurrencyRegistry.getCurrency('XYZ')).toThrow(/Unknown or unsupported currency/);
    expect(() => CurrencyRegistry.getCurrency('')).toThrow(CommerceError);
    expect(() => CurrencyRegistry.getCurrency('TOOLONG')).toThrow(CommerceError);
  });

  it('rejects non-commercial ISO codes by default (metals, special drawing rights, test codes, funds)', () => {
    // Precious metals (XAU, XAG, XPT, XPD)
    expect(() => CurrencyRegistry.getCurrency('XAU')).toThrow(CommerceError);
    expect(() => CurrencyRegistry.getCurrency('XAU')).toThrow(/non-commercial/);

    // Supranational / SDR (XDR, XSU, XUA, XBA, XBB, XBC, XBD)
    expect(() => CurrencyRegistry.getCurrency('XDR')).toThrow(CommerceError);
    expect(() => CurrencyRegistry.getCurrency('XSU')).toThrow(CommerceError);
    expect(() => CurrencyRegistry.getCurrency('XUA')).toThrow(CommerceError);

    // Funds (BOV, CHE, CHW, CLF, COU, MXV, USN, UYI, UYW)
    expect(() => CurrencyRegistry.getCurrency('USN')).toThrow(CommerceError);
    expect(() => CurrencyRegistry.getCurrency('BOV')).toThrow(CommerceError);
    expect(() => CurrencyRegistry.getCurrency('UYW')).toThrow(CommerceError);

    // Test code (XTS, XXX)
    expect(() => CurrencyRegistry.getCurrency('XTS')).toThrow(CommerceError);
    expect(() => CurrencyRegistry.getCurrency('XXX')).toThrow(CommerceError);

    // Explicit allowNonCommercial allows resolution
    const xau = CurrencyRegistry.getCurrency('XAU', { allowNonCommercial: true });
    expect(xau.code).toBe('XAU');
    expect(xau.type).toBe('metal');
    expect(xau.exponent).toBeNull();
    expect(xau.commerciallyUsable).toBe(false);

    const xdr = CurrencyRegistry.getCurrency('XDR', { allowNonCommercial: true });
    expect(xdr.code).toBe('XDR');
    expect(xdr.type).toBe('special');
    expect(xdr.exponent).toBeNull();
  });

  it('handles non-numeric exponent currencies without inventing exponent zero', () => {
    expect(() => CurrencyRegistry.getExponent('XAU', { allowNonCommercial: true })).toThrow(CommerceError);
    expect(() => CurrencyRegistry.getExponent('XAU', { allowNonCommercial: true })).toThrow(/no standard minor-unit/);
  });

  it('rejects deprecated currencies by default unless explicitly allowed', () => {
    // HRK (Croatian Kuna, replaced by EUR)
    expect(() => CurrencyRegistry.getCurrency('HRK')).toThrow(CommerceError);
    expect(() => CurrencyRegistry.getCurrency('HRK')).toThrow(/deprecated/);

    const hrk = CurrencyRegistry.getCurrency('HRK', { allowDeprecated: true });
    expect(hrk.code).toBe('HRK');
    expect(hrk.status).toBe('deprecated');
  });

  it('verifies exact exponents for zero-decimal, two-decimal, three-decimal, and four-decimal currencies', () => {
    // Two-decimal
    expect(CurrencyRegistry.getExponent('PKR')).toBe(2);
    expect(CurrencyRegistry.getExponent('USD')).toBe(2);
    expect(CurrencyRegistry.getExponent('EUR')).toBe(2);
    expect(CurrencyRegistry.getExponent('GBP')).toBe(2);
    expect(CurrencyRegistry.getExponent('AED')).toBe(2);
    expect(CurrencyRegistry.getExponent('SAR')).toBe(2);
    expect(CurrencyRegistry.getExponent('ZWG')).toBe(2);

    // Zero-decimal
    expect(CurrencyRegistry.getExponent('JPY')).toBe(0);
    expect(CurrencyRegistry.getExponent('KRW')).toBe(0);
    expect(CurrencyRegistry.getExponent('VND')).toBe(0);
    expect(CurrencyRegistry.getExponent('CLP')).toBe(0);
    expect(CurrencyRegistry.getExponent('ISK')).toBe(0);

    // Three-decimal
    expect(CurrencyRegistry.getExponent('KWD')).toBe(3);
    expect(CurrencyRegistry.getExponent('BHD')).toBe(3);
    expect(CurrencyRegistry.getExponent('OMR')).toBe(3);
    expect(CurrencyRegistry.getExponent('JOD')).toBe(3);
    expect(CurrencyRegistry.getExponent('TND')).toBe(3);

    // Four-decimal (funds)
    expect(CurrencyRegistry.getExponent('CLF', { allowNonCommercial: true })).toBe(4);
    expect(CurrencyRegistry.getExponent('UYW', { allowNonCommercial: true })).toBe(4);
  });

  it('supports hasCurrency boolean checking', () => {
    expect(CurrencyRegistry.hasCurrency('PKR')).toBe(true);
    expect(CurrencyRegistry.hasCurrency('usd')).toBe(true);
    expect(CurrencyRegistry.hasCurrency('ZWG')).toBe(true);
    expect(CurrencyRegistry.hasCurrency('UNKNOWN')).toBe(false);
    expect(CurrencyRegistry.hasCurrency('HRK')).toBe(false);
    expect(CurrencyRegistry.hasCurrency('HRK', { allowDeprecated: true })).toBe(true);
    expect(CurrencyRegistry.hasCurrency('BGN')).toBe(false);
    expect(CurrencyRegistry.hasCurrency('BGN', { allowDeprecated: true })).toBe(true);
    expect(CurrencyRegistry.hasCurrency('ZWL')).toBe(false);
    expect(CurrencyRegistry.hasCurrency('ZWL', { allowDeprecated: true })).toBe(true);
    expect(CurrencyRegistry.hasCurrency('XAU')).toBe(false);
    expect(CurrencyRegistry.hasCurrency('XAU', { allowNonCommercial: true })).toBe(true);
  });

  it('lists active commercial currencies without leaking deprecated or non-commercial by default', () => {
    const activeCommercial = CurrencyRegistry.listCurrencies();
    expect(activeCommercial.every((c) => c.status === 'active' && c.commerciallyUsable)).toBe(true);
    expect(activeCommercial.length).toBe(156);
    expect(activeCommercial.some((c) => c.code === 'PKR')).toBe(true);
    expect(activeCommercial.some((c) => c.code === 'ZWG')).toBe(true);
    expect(activeCommercial.some((c) => c.code === 'BGN')).toBe(false);
    expect(activeCommercial.some((c) => c.code === 'HRK')).toBe(false);
    expect(activeCommercial.some((c) => c.code === 'XAU')).toBe(false);

    const deprecated = CurrencyRegistry.listCurrencies({ status: 'deprecated', commercialOnly: false });
    expect(deprecated.every((c) => c.status === 'deprecated')).toBe(true);
    expect(deprecated.length).toBe(11);
    expect(deprecated.some((c) => c.code === 'HRK')).toBe(true);
    expect(deprecated.some((c) => c.code === 'BGN')).toBe(true);
    expect(deprecated.some((c) => c.code === 'ZWL')).toBe(true);
    expect(deprecated.some((c) => c.code === 'ZWD')).toBe(true);
  });
});
