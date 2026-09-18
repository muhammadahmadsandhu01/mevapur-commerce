const mongoose = require('mongoose');
const {
  Money,
  MoneyMapper,
  CurrencyRegistry
} = require('../../../modules/commerce');
const {
  allocateOrderMerchandise,
  amountForQuantityRange,
  calculateReturnAllocation,
  fromMinorUnits,
  toBigIntMinor
} = require('../../../services/ReturnMoneyAllocationService');
const ReturnService = require('../../../services/ReturnService');
const RefundService = require('../../../services/payment/RefundService');
const Order = require('../../../models/Order');
const Payment = require('../../../models/Payment');
const Return = require('../../../models/Return');
const Refund = require('../../../models/Refund');

describe('Phase 6D-4C: Governed Returns, Tax Reversal & Customs-Duty Refund Allocation', () => {
  const lineItem = (product, price, quantity = 1, extra = {}) => ({
    product: new mongoose.Types.ObjectId(),
    variantId: null,
    name: `Product ${product}`,
    sku: `SKU-${product}`,
    price,
    quantity,
    lineTotal: price * quantity,
    ...extra
  });

  const getMinor = (moneyExact) => (
    moneyExact ? MoneyMapper.toMoney(moneyExact).amountMinor : 0n
  );

  describe('A. Merchandise Allocation Invariants', () => {
    test('full return allocates merchandise and discount exactly across lines', () => {
      const order = {
        currency: 'USD',
        items: [
          lineItem('A', 100, 1),
          lineItem('B', 100, 1)
        ],
        subtotal: 200,
        discount: 50,
        totalAmount: 150
      };

      const allocation = allocateOrderMerchandise(order);
      expect(allocation.allocatableMinorExact).toBe(15000n);
      expect(allocation.lines[0].allocatedMinor).toBe(7500n);
      expect(allocation.lines[1].allocatedMinor).toBe(7500n);
    });

    test('single partial item return calculates exact proportional share', () => {
      const order = {
        currency: 'USD',
        items: [
          lineItem('A', 150, 1),
          lineItem('B', 50, 1)
        ],
        subtotal: 200,
        discount: 40,
        totalAmount: 160
      };

      const allocation = allocateOrderMerchandise(order);
      expect(allocation.allocatableMinorExact).toBe(16000n);
      // Item A: 150/200 * 160 = 120
      // Item B: 50/200 * 160 = 40
      expect(allocation.lines[0].allocatedMinor).toBe(12000n);
      expect(allocation.lines[1].allocatedMinor).toBe(4000n);
    });

    test('partial quantity return distributes indivisible cents deterministically', () => {
      const order = {
        currency: 'USD',
        items: [
          lineItem('A', 100, 3)
        ],
        subtotal: 300,
        discount: 100,
        totalAmount: 200
      };

      const allocation = allocateOrderMerchandise(order);
      const line = allocation.lines[0];
      expect(line.allocatedMinor).toBe(20000n);

      const q1 = amountForQuantityRange(line, 0, 1);
      const q2 = amountForQuantityRange(line, 1, 1);
      const q3 = amountForQuantityRange(line, 2, 1);

      expect(q1).toBe(6667);
      expect(q2).toBe(6667);
      expect(q3).toBe(6666);
      expect(q1 + q2 + q3).toBe(20000);
    });

    test('multiple sequential returns cannot cumulatively exceed line amount', () => {
      const order = {
        currency: 'USD',
        items: [
          lineItem('A', 100, 2)
        ],
        subtotal: 200,
        discount: 50,
        totalAmount: 150
      };

      const allocation = allocateOrderMerchandise(order);
      const line = allocation.lines[0];
      expect(line.allocatedMinor).toBe(15000n);

      const firstReturn = amountForQuantityRange(line, 0, 1);
      const secondReturn = amountForQuantityRange(line, 1, 1);
      expect(firstReturn + secondReturn).toBe(15000);

      // Attempting to return past line quantity throws
      expect(() => amountForQuantityRange(line, 2, 1)).toThrow();
    });

    test('deterministic remainder allocation by stable identity regardless of array order', () => {
      const item1 = lineItem('A', 100, 1);
      const item2 = lineItem('B', 100, 1);

      const orderForward = {
        currency: 'USD',
        items: [item1, item2],
        subtotal: 200,
        discount: 33.33,
        totalAmount: 166.67
      };

      const orderReversed = {
        currency: 'USD',
        items: [item2, item1],
        subtotal: 200,
        discount: 33.33,
        totalAmount: 166.67
      };

      const allocForward = allocateOrderMerchandise(orderForward);
      const allocReversed = allocateOrderMerchandise(orderReversed);

      const getMinorForSku = (alloc, sku) => alloc.lines.find((l) => l.item.sku === sku).allocatedMinor;
      expect(getMinorForSku(allocForward, 'SKU-A')).toBe(getMinorForSku(allocReversed, 'SKU-A'));
      expect(getMinorForSku(allocForward, 'SKU-B')).toBe(getMinorForSku(allocReversed, 'SKU-B'));
    });

    test('duplicate return line rejection in return request', () => {
      const pId = new mongoose.Types.ObjectId();
      const order = {
        _id: new mongoose.Types.ObjectId(),
        currency: 'USD',
        items: [{
          product: pId,
          variantId: null,
          name: 'P1',
          price: 50,
          quantity: 2,
          lineTotal: 100
        }],
        subtotal: 100,
        discount: 0,
        totalAmount: 100
      };

      const duplicateRequest = [
        { productId: String(pId), quantity: 1, reason: 'damaged' },
        { productId: String(pId), quantity: 1, reason: 'wrong_item' }
      ];

      expect(() => ReturnService.canonicalizeItems(order, duplicateRequest, [])).toThrow();
    });
  });

  describe('B. Governed Tax Allocation & Reversal', () => {
    test('exclusive tax with REFUNDABLE policy refunds proportional tax amount', () => {
      const item1 = lineItem('A', 100, 1);
      const item2 = lineItem('B', 100, 1);
      const order = {
        currency: 'USD',
        items: [item1, item2],
        subtotal: 200,
        discount: 0,
        taxAmount: 20,
        taxesAndDuties: {
          taxTreatment: 'EXCLUSIVE',
          taxAmount: 20,
          additionalTaxAmount: 20,
          provenance: {
            taxRefundPolicy: 'REFUNDABLE'
          }
        },
        totalAmount: 220
      };

      const keyA = `${item1.product}:root`;
      const result = calculateReturnAllocation(order, [
        { orderLineKey: keyA, quantity: 1, priorQuantity: 0 }
      ]);

      expect(getMinor(result.merchandiseRefundExact)).toBe(10000n);
      expect(getMinor(result.taxRefundExact)).toBe(1000n);
      expect(getMinor(result.totalRefundExact)).toBe(11000n);
    });

    test('exclusive tax with NON_REFUNDABLE policy refunds zero tax', () => {
      const item1 = lineItem('A', 100, 1);
      const order = {
        currency: 'USD',
        items: [item1],
        subtotal: 100,
        discount: 0,
        taxAmount: 10,
        taxesAndDuties: {
          taxTreatment: 'EXCLUSIVE',
          taxAmount: 10,
          additionalTaxAmount: 10,
          provenance: {
            taxRefundPolicy: 'NON_REFUNDABLE'
          }
        },
        totalAmount: 110
      };

      const keyA = `${item1.product}:root`;
      const result = calculateReturnAllocation(order, [
        { orderLineKey: keyA, quantity: 1, priorQuantity: 0 }
      ]);

      expect(getMinor(result.merchandiseRefundExact)).toBe(10000n);
      expect(getMinor(result.taxRefundExact)).toBe(0n);
      expect(getMinor(result.totalRefundExact)).toBe(10000n);
    });

    test('exclusive tax with PROPORTIONAL policy allocates tax accurately across partial item', () => {
      const item1 = lineItem('A', 150, 1);
      const item2 = lineItem('B', 50, 1);
      const order = {
        currency: 'USD',
        items: [item1, item2],
        subtotal: 200,
        discount: 0,
        taxAmount: 20,
        taxesAndDuties: {
          taxTreatment: 'EXCLUSIVE',
          taxAmount: 20,
          additionalTaxAmount: 20,
          provenance: {
            taxRefundPolicy: 'PROPORTIONAL'
          }
        },
        totalAmount: 220
      };

      const keyB = `${item2.product}:root`;
      const result = calculateReturnAllocation(order, [
        { orderLineKey: keyB, quantity: 1, priorQuantity: 0 }
      ]);

      // Item B is 50/200 = 25% of tax (5.00)
      expect(getMinor(result.merchandiseRefundExact)).toBe(5000n);
      expect(getMinor(result.taxRefundExact)).toBe(500n);
      expect(getMinor(result.totalRefundExact)).toBe(5500n);
    });

    test('inclusive tax is extracted for reporting and NOT double refunded on top of merchandise', () => {
      const item1 = lineItem('A', 100, 1);
      const order = {
        currency: 'EUR',
        items: [item1],
        subtotal: 100,
        discount: 0,
        taxesAndDuties: {
          taxTreatment: 'INCLUSIVE',
          taxIncludedAmount: 16.67,
          taxAmount: 16.67,
          provenance: {
            taxRefundPolicy: 'REFUNDABLE'
          }
        },
        totalAmount: 100
      };

      const keyA = `${item1.product}:root`;
      const result = calculateReturnAllocation(order, [
        { orderLineKey: keyA, quantity: 1, priorQuantity: 0 }
      ]);

      expect(getMinor(result.merchandiseRefundExact)).toBe(10000n);
      expect(getMinor(result.includedTaxExact)).toBe(1667n);
      expect(getMinor(result.taxRefundExact)).toBe(0n);
      expect(getMinor(result.totalRefundExact)).toBe(10000n);
    });

    test('tax with MANUAL_REVIEW policy fails closed with stable domain error', () => {
      const item1 = lineItem('A', 100, 1);
      const order = {
        currency: 'USD',
        items: [item1],
        subtotal: 100,
        discount: 0,
        taxAmount: 10,
        taxesAndDuties: {
          taxTreatment: 'EXCLUSIVE',
          taxAmount: 10,
          additionalTaxAmount: 10,
          provenance: {
            taxRefundPolicy: 'MANUAL_REVIEW'
          }
        },
        totalAmount: 110
      };

      const keyA = `${item1.product}:root`;
      expect(() => calculateReturnAllocation(order, [
        { orderLineKey: keyA, quantity: 1, priorQuantity: 0 }
      ])).toThrow(/Tax refund requires manual review/);
    });

    test('de-minimis tax exempt order produces zero tax refund', () => {
      const item1 = lineItem('A', 100, 1);
      const order = {
        currency: 'USD',
        items: [item1],
        subtotal: 100,
        discount: 0,
        taxAmount: 0,
        taxesAndDuties: {
          taxTreatment: 'EXCLUSIVE',
          taxAmount: 0,
          additionalTaxAmount: 0,
          taxDeMinimis: { exempt: true },
          provenance: {
            taxRefundPolicy: 'REFUNDABLE'
          }
        },
        totalAmount: 100
      };

      const keyA = `${item1.product}:root`;
      const result = calculateReturnAllocation(order, [
        { orderLineKey: keyA, quantity: 1, priorQuantity: 0 }
      ]);

      expect(getMinor(result.taxRefundExact)).toBe(0n);
      expect(getMinor(result.totalRefundExact)).toBe(10000n);
    });
  });

  describe('C. Customs Duties Allocation & Reversal', () => {
    test('DDP order with REFUNDABLE duty policy refunds proportional duty', () => {
      const item1 = lineItem('A', 100, 1);
      const order = {
        currency: 'USD',
        items: [item1],
        subtotal: 100,
        discount: 0,
        duties: 15,
        taxesAndDuties: {
          incoterm: 'DDP',
          payableDutyAmount: 15,
          provenance: {
            incoterm: 'DDP',
            dutyRefundPolicy: 'REFUNDABLE',
            taxRefundPolicy: 'NON_REFUNDABLE'
          }
        },
        totalAmount: 115
      };

      const keyA = `${item1.product}:root`;
      const result = calculateReturnAllocation(order, [
        { orderLineKey: keyA, quantity: 1, priorQuantity: 0 }
      ]);

      expect(getMinor(result.merchandiseRefundExact)).toBe(10000n);
      expect(getMinor(result.dutyRefundExact)).toBe(1500n);
      expect(getMinor(result.totalRefundExact)).toBe(11500n);
    });

    test('DDP order with NON_REFUNDABLE duty policy retains duty and refunds zero duty', () => {
      const item1 = lineItem('A', 100, 1);
      const order = {
        currency: 'USD',
        items: [item1],
        subtotal: 100,
        discount: 0,
        duties: 15,
        taxesAndDuties: {
          incoterm: 'DDP',
          payableDutyAmount: 15,
          provenance: {
            incoterm: 'DDP',
            dutyRefundPolicy: 'NON_REFUNDABLE',
            taxRefundPolicy: 'NON_REFUNDABLE'
          }
        },
        totalAmount: 115
      };

      const keyA = `${item1.product}:root`;
      const result = calculateReturnAllocation(order, [
        { orderLineKey: keyA, quantity: 1, priorQuantity: 0 }
      ]);

      expect(getMinor(result.merchandiseRefundExact)).toBe(10000n);
      expect(getMinor(result.dutyRefundExact)).toBe(0n);
      expect(getMinor(result.totalRefundExact)).toBe(10000n);
    });

    test('DDP order with MANUAL_REVIEW duty policy fails closed', () => {
      const item1 = lineItem('A', 100, 1);
      const order = {
        currency: 'USD',
        items: [item1],
        subtotal: 100,
        discount: 0,
        duties: 15,
        taxesAndDuties: {
          incoterm: 'DDP',
          payableDutyAmount: 15,
          provenance: {
            incoterm: 'DDP',
            dutyRefundPolicy: 'MANUAL_REVIEW',
            taxRefundPolicy: 'NON_REFUNDABLE'
          }
        },
        totalAmount: 115
      };

      const keyA = `${item1.product}:root`;
      expect(() => calculateReturnAllocation(order, [
        { orderLineKey: keyA, quantity: 1, priorQuantity: 0 }
      ])).toThrow(/Customs duty refund requires manual review/);
    });

    test('DAP estimated duty is NEVER refunded', () => {
      const item1 = lineItem('A', 100, 1);
      const order = {
        currency: 'USD',
        items: [item1],
        subtotal: 100,
        discount: 0,
        duties: 0,
        taxesAndDuties: {
          incoterm: 'DAP',
          estimatedDutyAmount: 25,
          payableDutyAmount: 0,
          provenance: {
            incoterm: 'DAP',
            dutyRefundPolicy: 'REFUNDABLE',
            taxRefundPolicy: 'NON_REFUNDABLE'
          }
        },
        totalAmount: 100
      };

      const keyA = `${item1.product}:root`;
      const result = calculateReturnAllocation(order, [
        { orderLineKey: keyA, quantity: 1, priorQuantity: 0 }
      ]);

      expect(getMinor(result.dutyRefundExact)).toBe(0n);
      expect(getMinor(result.totalRefundExact)).toBe(10000n);
    });

    test('payable DDP duty never leaks into merchandise allocation', () => {
      const item1 = lineItem('A', 100, 1);
      const order = {
        currency: 'USD',
        items: [item1],
        subtotal: 100,
        discount: 0,
        shippingCost: 20,
        taxAmount: 10,
        duties: 15,
        taxesAndDuties: {
          incoterm: 'DDP',
          taxTreatment: 'EXCLUSIVE',
          taxAmount: 10,
          additionalTaxAmount: 10,
          payableDutyAmount: 15,
          provenance: {
            taxRefundPolicy: 'NON_REFUNDABLE',
            dutyRefundPolicy: 'NON_REFUNDABLE'
          }
        },
        totalAmount: 145
      };

      const allocation = allocateOrderMerchandise(order);
      // Merchandise allocatable must be strictly 100, not 100 + 15 = 115
      expect(allocation.allocatableMinorExact).toBe(10000n);
      expect(allocation.lines[0].allocatedMinor).toBe(10000n);
    });
  });

  describe('D. Exact Money & Arbitrary Exponent Invariants', () => {
    test('handles zero-decimal currency (JPY) with exact integers', () => {
      const item1 = lineItem('A', 10000, 1);
      const order = {
        currency: 'JPY',
        items: [item1],
        subtotal: 10000,
        discount: 1500,
        totalAmount: 8500
      };

      const allocation = allocateOrderMerchandise(order);
      expect(allocation.allocatableMinorExact).toBe(8500n);
      expect(allocation.lines[0].allocatedMinor).toBe(8500n);
    });

    test('handles 3-decimal currency (BHD) with exact millieme units', () => {
      const item1 = lineItem('A', 10, 1); // 10.000 BHD = 10000 minor
      const order = {
        currency: 'BHD',
        items: [item1],
        subtotal: 10,
        discount: 2.5,
        totalAmount: 7.5
      };

      const allocation = allocateOrderMerchandise(order);
      expect(allocation.allocatableMinorExact).toBe(7500n);
      expect(allocation.lines[0].allocatedMinor).toBe(7500n);
    });

    test('handles 4-decimal currency with exact 4-decimal units', () => {
      const order = {
        currency: 'CLF',
        items: [{
          product: new mongoose.Types.ObjectId(),
          priceExact: { amountMinor: '12345678', currency: 'CLF', exponent: 4 },
          quantity: 1
        }],
        subtotalExact: { amountMinor: '12345678', currency: 'CLF', exponent: 4 },
        totalAmountExact: { amountMinor: '12345678', currency: 'CLF', exponent: 4 }
      };

      const allocation = allocateOrderMerchandise(order);
      expect(allocation.allocatableMinorExact).toBe(12345678n);
    });

    test('handles 18-digit amountMinor without precision loss', () => {
      const minorStr = '999999999999999999';
      const order = {
        currency: 'USD',
        items: [{
          product: new mongoose.Types.ObjectId(),
          variantId: null,
          name: 'Mega',
          priceExact: { amountMinor: minorStr, currency: 'USD' },
          quantity: 1
        }],
        subtotalExact: { amountMinor: minorStr, currency: 'USD' },
        discountExact: { amountMinor: '0', currency: 'USD' },
        totalAmountExact: { amountMinor: minorStr, currency: 'USD' }
      };

      const allocation = allocateOrderMerchandise(order);
      expect(allocation.allocatableMinorExact).toBe(999999999999999999n);
      expect(allocation.lines[0].allocatedMinor).toBe(999999999999999999n);
    });

    test('currency mismatch fails closed with error', () => {
      expect(() => {
        toBigIntMinor({ amountMinor: '1000', currency: 'EUR' }, 'USD');
      }).toThrow(/Currency mismatch/);
    });

    test('exponent mismatch fails closed with error', () => {
      expect(() => {
        toBigIntMinor({ amountMinor: '1000', currency: 'USD', exponent: 3 }, 'USD', 2);
      }).toThrow(/Exponent mismatch/);
    });

    test('unsafe numeric 9007199254740992 is rejected as input', () => {
      expect(() => {
        toBigIntMinor(9007199254740992, 'USD');
      }).toThrow();
    });

    test('exact string "9007199254740992" is accepted', () => {
      expect(toBigIntMinor('9007199254740992', 'USD')).toBe(9007199254740992n);
    });

    test('19-digit amount is rejected', () => {
      expect(() => {
        toBigIntMinor('1000000000000000000', 'USD');
      }).toThrow();
    });

    test('decimal string where amountMinor is expected is rejected', () => {
      expect(() => {
        toBigIntMinor('100.50', 'USD');
      }).toThrow();
    });

    test('scientific notation is rejected', () => {
      expect(() => {
        toBigIntMinor('1e10', 'USD');
      }).toThrow();
    });

    test('negative amount is rejected', () => {
      expect(() => {
        toBigIntMinor('-500', 'USD');
      }).toThrow();
    });

    test('missing currency fails closed with REFUND_CURRENCY_REQUIRED', () => {
      expect(() => {
        allocateOrderMerchandise({ items: [{ product: new mongoose.Types.ObjectId(), price: 100, quantity: 1 }] });
      }).toThrow(/Order currency is required/);
    });
  });

  describe('E. Governance Enum & Schema Parity', () => {
    test('Return and Refund models have identical dutyRefundPolicy enums', () => {
      const returnDutyEnum = Return.schema.path('refundAllocationSnapshot.dutyRefundPolicy').enumValues;
      const refundDutyEnum = Refund.schema.path('allocationSnapshot.dutyRefundPolicy').enumValues;
      expect(returnDutyEnum).toEqual(['REFUNDABLE', 'NON_REFUNDABLE', 'MANUAL_REVIEW', null]);
      expect(refundDutyEnum).toEqual(['REFUNDABLE', 'NON_REFUNDABLE', 'MANUAL_REVIEW', null]);
    });

    test('Return and Refund models have identical taxRefundPolicy enums', () => {
      const returnTaxEnum = Return.schema.path('refundAllocationSnapshot.taxRefundPolicy').enumValues;
      const refundTaxEnum = Refund.schema.path('allocationSnapshot.taxRefundPolicy').enumValues;
      expect(returnTaxEnum).toEqual(['REFUNDABLE', 'NON_REFUNDABLE', 'PROPORTIONAL', 'MANUAL_REVIEW', null]);
      expect(refundTaxEnum).toEqual(['REFUNDABLE', 'NON_REFUNDABLE', 'PROPORTIONAL', 'MANUAL_REVIEW', null]);
    });
  });

  describe('F. Shipping Refund Semantics', () => {
    test('shipping is excluded from automatic merchandise refund and defaults to exact zero', () => {
      const item1 = lineItem('A', 100, 1);
      const order = {
        currency: 'USD',
        items: [item1],
        subtotal: 100,
        shippingCost: 25,
        totalAmount: 125
      };

      const keyA = `${item1.product}:root`;
      const result = calculateReturnAllocation(order, [
        { orderLineKey: keyA, quantity: 1, priorQuantity: 0 }
      ]);

      expect(getMinor(result.merchandiseRefundExact)).toBe(10000n);
      expect(getMinor(result.shippingRefundExact)).toBe(0n);
      expect(getMinor(result.totalRefundExact)).toBe(10000n);
    });
  });

  describe('G. Sequential Return Authority & Prior Consumption', () => {
    test('rejected and cancelled returns do not consume quantity or allocation capacity', () => {
      const pId = new mongoose.Types.ObjectId();
      const item1 = {
        product: pId,
        quantity: 2,
        price: 100,
        lineTotal: 200
      };
      const order = {
        _id: new mongoose.Types.ObjectId(),
        currency: 'USD',
        items: [item1],
        subtotal: 200,
        totalAmount: 200
      };

      const priorRejected = {
        order: order._id,
        status: 'rejected',
        items: [{ product: pId, quantity: 1, orderLineKey: `${pId}:root` }]
      };
      const priorCancelled = {
        order: order._id,
        status: 'cancelled',
        items: [{ product: pId, quantity: 1, orderLineKey: `${pId}:root` }]
      };

      const priorQty = ReturnService.priorQuantityForLine([priorRejected, priorCancelled], item1);
      expect(priorQty).toBe(0);
    });

    test('approved and refunded prior returns consume quantity capacity', () => {
      const pId = new mongoose.Types.ObjectId();
      const item1 = {
        product: pId,
        quantity: 2,
        price: 100,
        lineTotal: 200
      };

      const priorApproved = {
        status: 'approved',
        items: [{ product: pId, quantity: 1, orderLineKey: `${pId}:root` }]
      };

      const priorQty = ReturnService.priorQuantityForLine([priorApproved], item1);
      expect(priorQty).toBe(1);
    });
  });

  describe('H. Refund Snapshot Reconciliation & Tamper Resistance', () => {
    test('validates exact sum reconciliation in RefundService', () => {
      expect(() => {
        RefundService.validateRefundAllocationReconciliation({
          amount: 100,
          amountExact: { amountMinor: '10000', currency: 'USD', exponent: 2 },
          merchandiseRefundExact: { amountMinor: '8000', currency: 'USD', exponent: 2 },
          taxRefundExact: { amountMinor: '2000', currency: 'USD', exponent: 2 },
          dutyRefundExact: { amountMinor: '0', currency: 'USD', exponent: 2 },
          shippingRefundExact: { amountMinor: '0', currency: 'USD', exponent: 2 },
          resolvedCurrency: 'USD'
        });
      }).not.toThrow();
    });

    test('rejects breakdown when total differs by 1 minor unit', () => {
      expect(() => {
        RefundService.validateRefundAllocationReconciliation({
          amount: 100,
          amountExact: { amountMinor: '10000', currency: 'USD', exponent: 2 },
          merchandiseRefundExact: { amountMinor: '8000', currency: 'USD', exponent: 2 },
          taxRefundExact: { amountMinor: '1999', currency: 'USD', exponent: 2 },
          dutyRefundExact: { amountMinor: '0', currency: 'USD', exponent: 2 },
          shippingRefundExact: { amountMinor: '0', currency: 'USD', exponent: 2 },
          resolvedCurrency: 'USD'
        });
      }).toThrow(/Refund breakdown sum/);
    });

    test('rejects breakdown when component currency mismatches payment currency', () => {
      expect(() => {
        RefundService.validateRefundAllocationReconciliation({
          amount: 100,
          amountExact: { amountMinor: '10000', currency: 'USD', exponent: 2 },
          merchandiseRefundExact: { amountMinor: '10000', currency: 'EUR', exponent: 2 },
          resolvedCurrency: 'USD'
        });
      }).toThrow(/Component currency mismatch/);
    });

    test('rejects breakdown when DAP duty is inserted as payable duty', () => {
      expect(() => {
        RefundService.validateRefundAllocationReconciliation({
          amount: 100,
          amountExact: { amountMinor: '10000', currency: 'USD', exponent: 2 },
          merchandiseRefundExact: { amountMinor: '8000', currency: 'USD', exponent: 2 },
          dutyRefundExact: { amountMinor: '2000', currency: 'USD', exponent: 2 },
          allocationSnapshot: { incoterm: 'DAP' },
          resolvedCurrency: 'USD'
        });
      }).toThrow(/DAP estimated customs duty cannot be refunded/);
    });
  });

  describe('I. Compatibility with Historical Orders', () => {
    test('historical order without tax/duties allocates merchandise safely', () => {
      const item1 = lineItem('A', 100, 1);
      const order = {
        currency: 'PKR',
        items: [item1],
        subtotal: 100,
        discount: 20,
        totalAmount: 80
      };

      const allocation = allocateOrderMerchandise(order);
      expect(allocation.allocatableMinorExact).toBe(8000n);
    });

    test('historical order with non-zero tax but missing policy snapshot fails closed for automatic refund', () => {
      const item1 = lineItem('A', 100, 1);
      const order = {
        currency: 'PKR',
        items: [item1],
        subtotal: 100,
        discount: 0,
        taxAmount: 15,
        totalAmount: 115
      };

      const keyA = `${item1.product}:root`;
      expect(() => calculateReturnAllocation(order, [
        { orderLineKey: keyA, quantity: 1, priorQuantity: 0 }
      ])).toThrow(/Governed tax refund policy snapshot is required/);
    });
  });
});
