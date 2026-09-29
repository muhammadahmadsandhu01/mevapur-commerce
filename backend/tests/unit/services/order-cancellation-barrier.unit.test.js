'use strict';

const OrderService = require('../../../services/order/OrderService');
const Order = require('../../../models/Order');
const EmailService = require('../../../services/EmailService');
const { AppError } = require('../../../common/errors/AppError');

describe('OrderService Cancellation Barrier & Status Update Notification', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('cancelOrder barrier', () => {
    test('throws CANNOT_CANCEL_SHIPPED_ORDER when order status is shipped', async () => {
      const mockOrder = {
        _id: '6ab8c3628e086c0d2d59df01',
        orderId: 'HZ-20260927-000001',
        user: '6ab8c3628e086c0d2d59dfce',
        orderStatus: 'Shipped'
      };

      jest.spyOn(OrderService, 'runTransaction').mockImplementation(async (callback) => {
        return await callback({});
      });

      jest.spyOn(Order, 'findOne').mockReturnValue({
        session: jest.fn().mockResolvedValue(mockOrder)
      });

      await expect(
        OrderService.cancelOrder({
          reference: 'HZ-20260927-000001',
          actor: { id: '6ab8c3628e086c0d2d59dfce', role: 'customer' },
          reason: 'Customer wants to cancel'
        })
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 400,
          code: 'CANNOT_CANCEL_SHIPPED_ORDER',
          message: 'This order has already been shipped or finalized and cannot be cancelled.'
        })
      );
    });

    test('throws CANNOT_CANCEL_SHIPPED_ORDER for positional argument signature cancelOrder(orderId, userId, reason)', async () => {
      const mockOrder = {
        _id: '6ab8c3628e086c0d2d59df02',
        orderId: 'HZ-20260927-000002',
        user: '6ab8c3628e086c0d2d59dfce',
        orderStatus: 'shipped'
      };

      jest.spyOn(OrderService, 'runTransaction').mockImplementation(async (callback) => {
        return await callback({});
      });

      jest.spyOn(Order, 'findOne').mockReturnValue({
        session: jest.fn().mockResolvedValue(mockOrder)
      });

      await expect(
        OrderService.cancelOrder(
          'HZ-20260927-000002',
          '6ab8c3628e086c0d2d59dfce',
          'Cancel requested'
        )
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 400,
          code: 'CANNOT_CANCEL_SHIPPED_ORDER'
        })
      );
    });

    test('throws CANNOT_CANCEL_SHIPPED_ORDER when order status is delivered or out_for_delivery', async () => {
      jest.spyOn(OrderService, 'runTransaction').mockImplementation(async (callback) => {
        return await callback({});
      });

      for (const status of ['delivered', 'Delivered', 'out_for_delivery', 'returned']) {
        const mockOrder = {
          _id: '6ab8c3628e086c0d2d59df03',
          orderId: 'HZ-20260927-000003',
          user: '6ab8c3628e086c0d2d59dfce',
          orderStatus: status
        };

        jest.spyOn(Order, 'findOne').mockReturnValue({
          session: jest.fn().mockResolvedValue(mockOrder)
        });

        await expect(
          OrderService.cancelOrder({
            reference: 'HZ-20260927-000003',
            actor: { id: '6ab8c3628e086c0d2d59dfce', role: 'customer' }
          })
        ).rejects.toThrow(
          expect.objectContaining({
            statusCode: 400,
            code: 'CANNOT_CANCEL_SHIPPED_ORDER'
          })
        );
      }
    });
  });

  describe('EmailService.sendOrderStatusUpdateEmail', () => {
    test('formats standardized status update email and dispatches via send', async () => {
      const mockOrder = {
        _id: '6ab8c3628e086c0d2d59df04',
        orderId: 'HZ-20260927-000004',
        customerEmail: 'customer@example.com',
        shippingAddress: {
          fullName: 'Ahmad Sandhu',
          address: 'Main Boulevard, Gulberg III',
          city: 'Lahore',
          country: 'Pakistan'
        },
        items: [
          { name: 'Pure Cotton Luxury Bed Sheet Set', quantity: 1, price: 3200 },
          { name: 'True Wireless ANC Earbuds Pro', quantity: 2, price: 4999 }
        ]
      };

      const sendSpy = jest.spyOn(EmailService, 'send').mockResolvedValue({
        success: true,
        reason: 'EMAIL_SMTP_MOCKED'
      });

      const result = await EmailService.sendOrderStatusUpdateEmail({
        order: mockOrder,
        newStatus: 'shipped',
        previousStatus: 'processing'
      });

      expect(result.success).toBe(true);
      expect(sendSpy).toHaveBeenCalledTimes(1);

      const emailPayload = sendSpy.mock.calls[0][0];
      expect(emailPayload.to).toBe('customer@example.com');
      expect(emailPayload.subject).toBe('Update on your order HZ-20260927-000004: Now Shipped');
      expect(emailPayload.html).toContain('Ahmad Sandhu');
      expect(emailPayload.html).toContain('HZ-20260927-000004');
      expect(emailPayload.html).toContain('Shipped');
      expect(emailPayload.html).toContain('Pure Cotton Luxury Bed Sheet Set');
      expect(emailPayload.html).toContain('View Order Details');
      expect(emailPayload.text).toContain('HZ-20260927-000004');
      expect(emailPayload.text).toContain('Now Shipped');
    });
  });
});
