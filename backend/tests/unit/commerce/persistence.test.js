'use strict';

const mongoose = require('mongoose');
const { Money, MoneySchema, MoneyMapper, CurrencyRegistry, CommerceError } = require('../../../modules/commerce');



describe('MoneyMapper & MoneySchema — Decimal128 Exact Persistence Unit Tests', () => {
  const TestModelSchema = new mongoose.Schema({
    name: String,
    price: MoneySchema
  });
  const TestModel = mongoose.models.ExactMoneyTestModel || mongoose.model('ExactMoneyTestModel', TestModelSchema);

  afterEach(async () => {
    await TestModel.deleteMany({});
  });

  describe('MoneyMapper Conversions & Type Safety', () => {
    it('round-trips between Money Value Object and persisted Decimal128 snapshot', () => {
      const money = Money.fromMinor(15050n, 'PKR');
      const persisted = MoneyMapper.toPersistence(money);

      expect(persisted.amountMinor).toBeInstanceOf(mongoose.Types.Decimal128);
      expect(persisted.amountMinor.toString()).toBe('15050');
      expect(persisted.currency).toBe('PKR');
      expect(persisted.exponent).toBe(2);
      expect(persisted.registrySnapshot).toBe(CurrencyRegistry.getProvenance().snapshotName);

      const restored = MoneyMapper.toMoney(persisted);
      expect(restored.amountMinor).toBe(15050n);
      expect(restored.currency).toBe('PKR');
      expect(restored.exponent).toBe(2);
      expect(restored.equals(money)).toBe(true);
    });

    it('handles zero-decimal (JPY), two-decimal (USD), three-decimal (KWD), and four-decimal (CLF) currencies', () => {
      // JPY (0 decimals)
      const jpy = Money.fromMinor(5000n, 'JPY');
      const pJpy = MoneyMapper.toPersistence(jpy);
      expect(pJpy.exponent).toBe(0);
      expect(pJpy.amountMinor.toString()).toBe('5000');
      expect(MoneyMapper.toMoney(pJpy).equals(jpy)).toBe(true);

      // USD (2 decimals)
      const usd = Money.fromMinor(1999n, 'USD');
      const pUsd = MoneyMapper.toPersistence(usd);
      expect(pUsd.exponent).toBe(2);
      expect(pUsd.amountMinor.toString()).toBe('1999');
      expect(MoneyMapper.toMoney(pUsd).equals(usd)).toBe(true);

      // KWD (3 decimals)
      const kwd = Money.fromMinor(12345n, 'KWD');
      const pKwd = MoneyMapper.toPersistence(kwd);
      expect(pKwd.exponent).toBe(3);
      expect(pKwd.amountMinor.toString()).toBe('12345');
      expect(MoneyMapper.toMoney(pKwd).equals(kwd)).toBe(true);

      // CLF (4 decimals, non-commercial fund)
      const clf = Money.fromMinor(123456n, 'CLF', { allowNonCommercial: true });
      const pClf = MoneyMapper.toPersistence(clf, { allowNonCommercial: true });
      expect(pClf.exponent).toBe(4);
      expect(MoneyMapper.toMoney(pClf, { allowNonCommercial: true }).equals(clf)).toBe(true);
    });

    it('safely handles amounts up to 18-digit domain bound without precision loss', () => {
      const maxDomainMinor = 999999999999999999n; // 18 digits (10^18 - 1)
      const money = Money.fromMinor(maxDomainMinor, 'PKR');
      const persisted = MoneyMapper.toPersistence(money);

      expect(persisted.amountMinor.toString()).toBe('999999999999999999');
      const restored = MoneyMapper.toMoney(persisted);
      expect(restored.amountMinor).toBe(maxDomainMinor);
      expect(restored.amountMinor.toString()).toBe('999999999999999999');
    });

    it('enforces maximum 18 decimal digit domain boundary for Decimal128 aggregation headroom and rejects larger values', () => {
      const tooLargeMinor = 1000000000000000000n; // 19 digits (10^18)
      const money = Money.fromMinor(tooLargeMinor, 'PKR');
      expect(() => MoneyMapper.toPersistence(money)).toThrow(CommerceError);
      expect(() => MoneyMapper.toPersistence(money)).toThrow(/exceeds maximum supported domain digit length/);
    });

    it('rejects invalid, fractional, or scientific notation strings in toMoney', () => {
      expect(() => MoneyMapper.toMoney({ amountMinor: '150.50', currency: 'PKR', exponent: 2 })).toThrow(CommerceError);
      expect(() => MoneyMapper.toMoney({ amountMinor: '1e5', currency: 'PKR', exponent: 2 })).toThrow(CommerceError);
      expect(() => MoneyMapper.toMoney({ amountMinor: 'NaN', currency: 'PKR', exponent: 2 })).toThrow(CommerceError);
      expect(() => MoneyMapper.toMoney({ amountMinor: 'Infinity', currency: 'PKR', exponent: 2 })).toThrow(CommerceError);
      expect(() => MoneyMapper.toMoney({ amountMinor: '', currency: 'PKR', exponent: 2 })).toThrow(CommerceError);
    });

    it('enforces currency and exponent agreement with CurrencyRegistry', () => {
      // Exponent mismatch for PKR (expected 2, provided 3)
      expect(() => MoneyMapper.toMoney({ amountMinor: '1000', currency: 'PKR', exponent: 3 })).toThrow(CommerceError);
      expect(() => MoneyMapper.toMoney({ amountMinor: '1000', currency: 'PKR', exponent: 3 })).toThrow(/does not match CurrencyRegistry exponent/);

      // Unknown currency
      expect(() => MoneyMapper.toMoney({ amountMinor: '1000', currency: 'XYZ', exponent: 2 })).toThrow(CommerceError);

      // Deprecated currency without allowDeprecated
      expect(() => MoneyMapper.toMoney({ amountMinor: '1000', currency: 'BGN', exponent: 2 })).toThrow(CommerceError);
      expect(() => MoneyMapper.toMoney({ amountMinor: '1000', currency: 'BGN', exponent: 2 })).toThrow(/deprecated/);

      // Deprecated currency with allowDeprecated
      const bgn = MoneyMapper.toMoney({ amountMinor: '1000', currency: 'BGN', exponent: 2 }, { allowDeprecated: true });
      expect(bgn.currency).toBe('BGN');
      expect(bgn.amountMinor).toBe(1000n);
    });

    it('serializes to clean JSON object without leaking raw Decimal128', () => {
      const money = Money.fromMinor(25000n, 'PKR');
      const persisted = MoneyMapper.toPersistence(money);
      const json = MoneyMapper.toJSON(persisted);

      expect(json).toEqual({
        amountMinor: '25000',
        currency: 'PKR',
        exponent: 2
      });
      expect(typeof json.amountMinor).toBe('string');
      expect(json.amountMinor).not.toBeInstanceOf(mongoose.Types.Decimal128);
    });

    it('formats persisted record to exact decimal string', () => {
      const persisted = MoneyMapper.toPersistence(Money.fromMinor(123456n, 'USD'));
      expect(MoneyMapper.toDecimalString(persisted)).toBe('1234.56');

      const persistedJpy = MoneyMapper.toPersistence(Money.fromMinor(5000n, 'JPY'));
      expect(MoneyMapper.toDecimalString(persistedJpy)).toBe('5000');
    });
  });

  describe('Mongoose Database Persistence & Aggregation Verification', () => {
    it('persists and retrieves exact MoneySchema subdocuments with scale zero', async () => {
      const item = await TestModel.create({
        name: 'Organic Almonds',
        price: MoneyMapper.toPersistence(Money.fromDecimal('1450.75', 'PKR'))
      });

      const doc = await TestModel.findById(item._id).lean();
      expect(doc.price.currency).toBe('PKR');
      expect(doc.price.exponent).toBe(2);
      expect(doc.price.amountMinor.toString()).toBe('145075');

      const restored = MoneyMapper.toMoney(doc.price);
      expect(restored.toDecimalString()).toBe('1450.75');
    });

    it('fails Mongoose validation if amountMinor contains fractional or invalid characters', async () => {
      const invalidDoc = new TestModel({
        name: 'Invalid Test Item',
        price: {
          amountMinor: mongoose.Types.Decimal128.fromString('150.50'),
          currency: 'PKR',
          exponent: 2,
          registrySnapshot: 'test'
        }
      });

      await expect(invalidDoc.validate()).rejects.toThrow(/amountMinor must be a canonical integer/);
    });

    it('performs exact $sum and $group aggregations over Decimal128 minor units', async () => {
      await TestModel.create([
        { name: 'Item A', price: MoneyMapper.toPersistence(Money.fromDecimal('100.50', 'PKR')) }, // 10050
        { name: 'Item B', price: MoneyMapper.toPersistence(Money.fromDecimal('200.25', 'PKR')) }, // 20025
        { name: 'Item C', price: MoneyMapper.toPersistence(Money.fromDecimal('50.25', 'PKR')) },  // 5025
        { name: 'Item D', price: MoneyMapper.toPersistence(Money.fromDecimal('0.00', 'PKR')) },   // 0
        { name: 'Item E', price: MoneyMapper.toPersistence(Money.fromDecimal('5000', 'USD')) }   // 500000 in USD
      ]);

      const pkrAgg = await TestModel.aggregate([
        { $match: { 'price.currency': 'PKR' } },
        {
          $group: {
            _id: '$price.currency',
            totalMinor: { $sum: '$price.amountMinor' },
            count: { $sum: 1 }
          }
        }
      ]);

      expect(pkrAgg.length).toBe(1);
      expect(pkrAgg[0]._id).toBe('PKR');
      expect(pkrAgg[0].count).toBe(4);
      expect(pkrAgg[0].totalMinor.toString()).toBe('35100'); // 10050 + 20025 + 5025 = 35100 (351.00 PKR)

      const usdAgg = await TestModel.aggregate([
        { $match: { 'price.currency': 'USD' } },
        {
          $group: {
            _id: '$price.currency',
            totalMinor: { $sum: '$price.amountMinor' },
            count: { $sum: 1 }
          }
        }
      ]);

      expect(usdAgg.length).toBe(1);
      expect(usdAgg[0]._id).toBe('USD');
      expect(usdAgg[0].totalMinor.toString()).toBe('500000');
    });

    it('performs exact sorting on Decimal128 minor units', async () => {
      await TestModel.create([
        { name: 'P2', price: MoneyMapper.toPersistence(Money.fromDecimal('200.00', 'PKR')) },
        { name: 'P1', price: MoneyMapper.toPersistence(Money.fromDecimal('50.00', 'PKR')) },
        { name: 'P3', price: MoneyMapper.toPersistence(Money.fromDecimal('500.00', 'PKR')) }
      ]);

      const sortedAsc = await TestModel.find({ 'price.currency': 'PKR' }).sort({ 'price.amountMinor': 1 });
      expect(sortedAsc.map(d => d.name)).toEqual(['P1', 'P2', 'P3']);

      const sortedDesc = await TestModel.find({ 'price.currency': 'PKR' }).sort({ 'price.amountMinor': -1 });
      expect(sortedDesc.map(d => d.name)).toEqual(['P3', 'P2', 'P1']);
    });
  });
});
