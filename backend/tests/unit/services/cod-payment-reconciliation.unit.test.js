'use strict';

const OrderService = require('../../../services/order/OrderService');
const Order = require('../../../models/Order');
const Payment = require('../../../models/Payment');
const { ORDER_STATUSES } = require('../../../constants/orderConstants');

describe('COD Payment Reconciliation - OrderService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('markCodPaid sets paymentStatus to Paid, records paidAt and settledBy for delivered order', async () => {
    const mockOrder = {
      _id: '6ab9a576a7f6b4c734456aab',
      orderId: 'HZ-20260927-000024',
      paymentMethod: 'cod',
      paymentStatus: 'Pending',
      orderStatus: ORDER_STATUSES.DELIVERED,
      payment: {
        provider: 'Cash on Delivery',
        paidAt: null,
        settledBy: null
      },
      adminNotes: [],
      save: jest.fn().mockResolvedValue(true)
    };

    jest.spyOn(OrderService, 'runTransaction').mockImplementation(async (callback) => {
      return callback({});
    });
    jest.spyOn(Order, 'findOne').mockReturnValue({
      session: jest.fn().mockResolvedValue(mockOrder)
    });
    jest.spyOn(Payment, 'findOne').mockReturnValue({
      session: jest.fn().mockResolvedValue(null)
    });

    const actor = { id: 'admin_123', role: 'admin' };
    const result = await OrderService.markCodPaid({
      reference: 'HZ-20260927-000024',
      actor,
      adminNote: 'Cash collected by courier'
    });

    expect(result.idempotentReplay).toBe(false);
    expect(mockOrder.paymentStatus).toBe('Paid');
    expect(mockOrder.payment.paidAt).toBeInstanceOf(Date);
    expect(mockOrder.payment.settledBy).toBe('admin_123');
    expect(mockOrder.save).toHaveBeenCalled();
  });

  test('markCodPaid with autoDeliver: true delivers and marks paid if not yet delivered', async () => {
    const mockOrder = {
      _id: '6ab9a576a7f6b4c734456aac',
      orderId: 'HZ-20260927-000025',
      paymentMethod: 'cod',
      paymentStatus: 'Pending',
      orderStatus: ORDER_STATUSES.SHIPPED,
      statusTimeline: [],
      payment: {
        provider: 'Cash on Delivery',
        paidAt: null,
        settledBy: null
      },
      adminNotes: [],
      save: jest.fn().mockResolvedValue(true)
    };

    jest.spyOn(OrderService, 'runTransaction').mockImplementation(async (callback) => {
      return callback({});
    });
    jest.spyOn(Order, 'findOne').mockReturnValue({
      session: jest.fn().mockResolvedValue(mockOrder)
    });
    jest.spyOn(Payment, 'findOne').mockReturnValue({
      session: jest.fn().mockResolvedValue(null)
    });

    const actor = { id: 'admin_456', role: 'admin' };
    const result = await OrderService.markCodPaid({
      reference: 'HZ-20260927-000025',
      actor,
      adminNote: 'Collected and delivered',
      autoDeliver: true
    });

    expect(result.idempotentReplay).toBe(false);
    expect(mockOrder.orderStatus).toBe(ORDER_STATUSES.DELIVERED);
    expect(mockOrder.deliveredAt).toBeInstanceOf(Date);
    expect(mockOrder.paymentStatus).toBe('Paid');
    expect(mockOrder.payment.settledBy).toBe('admin_456');
  });

  test('transitionOrder to DELIVERED with autoReconcilePayment automatically marks COD as Paid', async () => {
    const mockOrder = {
      _id: '6ab9a576a7f6b4c734456aad',
      orderId: 'HZ-20260927-000026',
      paymentMethod: 'cod',
      paymentStatus: 'Pending',
      orderStatus: ORDER_STATUSES.SHIPPED,
      statusTimeline: [],
      payment: {
        provider: 'Cash on Delivery',
        paidAt: null,
        settledBy: null
      },
      adminNotes: [],
      save: jest.fn().mockResolvedValue(true)
    };

    jest.spyOn(OrderService, 'runTransaction').mockImplementation(async (callback) => {
      return callback({});
    });
    jest.spyOn(Order, 'findOne').mockReturnValue({
      session: jest.fn().mockResolvedValue(mockOrder)
    });

    const actor = { id: 'admin_789', role: 'admin' };
    const result = await OrderService.transitionOrder({
      reference: 'HZ-20260927-000026',
      actor,
      orderStatus: ORDER_STATUSES.DELIVERED,
      adminNote: 'Delivered and cash collected',
      autoReconcilePayment: true
    });

    expect(result.order.orderStatus).toBe(ORDER_STATUSES.DELIVERED);
    expect(mockOrder.paymentStatus).toBe('Paid');
    expect(mockOrder.payment.paidAt).toBeInstanceOf(Date);
    expect(mockOrder.payment.settledBy).toBe('admin_789');
  });

  test('transitionOrder on already DELIVERED order with autoReconcilePayment reconciles payment to Paid', async () => {
    const mockOrder = {
      _id: '6ab9a576a7f6b4c734456aae',
      orderId: 'HZ-20260927-000003',
      paymentMethod: 'cod',
      paymentStatus: 'Pending',
      orderStatus: ORDER_STATUSES.DELIVERED,
      statusTimeline: [],
      payment: {
        provider: 'Cash on Delivery',
        paidAt: null,
        settledBy: null
      },
      adminNotes: [],
      save: jest.fn().mockResolvedValue(true)
    };

    jest.spyOn(OrderService, 'runTransaction').mockImplementation(async (callback) => {
      return callback({});
    });
    jest.spyOn(Order, 'findOne').mockReturnValue({
      session: jest.fn().mockResolvedValue(mockOrder)
    });

    const actor = { id: 'admin_789', role: 'admin' };
    const result = await OrderService.transitionOrder({
      reference: 'HZ-20260927-000003',
      actor,
      orderStatus: ORDER_STATUSES.DELIVERED,
      adminNote: 'Cash collected upon delivery',
      autoReconcilePayment: true
    });

    expect(result.order.orderStatus).toBe(ORDER_STATUSES.DELIVERED);
    expect(result.isReplay).toBe(false);
    expect(mockOrder.paymentStatus).toBe('Paid');
    expect(mockOrder.payment.paidAt).toBeInstanceOf(Date);
    expect(mockOrder.payment.settledBy).toBe('admin_789');
    expect(mockOrder.save).toHaveBeenCalled();
  });
});
