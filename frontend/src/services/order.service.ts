import api from '@/lib/api';
import { CartItem } from '@/store/cartStore';

import type { PaymentProvider } from '@/services/payment.service';

export type OrderPaymentMethod = PaymentProvider;

export interface ShippingAddress {
  fullName: string;
  phone: string;
  address: string;
  addressLine2?: string;
  city: string;
  province: string;
  postalCode?: string;
  country: string;
}

export interface SecureOrderPayload {
  items: Array<{
    productId: string;
    quantity: number;
    variantId?: string;
  }>;
  shippingAddress: ShippingAddress;
  paymentMethod: OrderPaymentMethod;
  currency?: string;
  couponCode?: string;
  customerNote?: string;
}

export interface OrderSnapshot {
  _id: string;
  orderId: string;
  totalAmount: number;
  paymentMethod: OrderPaymentMethod;
  paymentStatus: string;
  orderStatus: string;
}

interface SecureOrderResponse {
  success: boolean;
  data: {
    order: OrderSnapshot;
    idempotentReplay: boolean;
  };
  meta: {
    requestId: string;
  };
}

export const buildOrderPayload = (
  items: CartItem[],
  address: ShippingAddress,
  paymentMethod: OrderPaymentMethod,
  currency?: string,
  couponCode?: string,
  customerNote?: string
): SecureOrderPayload => ({
  items: items.map((item) => ({
    productId: item._id || item.id,
    quantity: item.quantity,
    variantId: item.variantId || undefined
  })),
  shippingAddress: {
    fullName: address.fullName,
    phone: address.phone,
    address: address.address,
    addressLine2: address.addressLine2 || undefined,
    city: address.city,
    province: address.province,
    postalCode: address.postalCode || undefined,
    country: address.country
  },
  paymentMethod,
  currency: currency || undefined,
  couponCode: couponCode || undefined,
  customerNote: customerNote || undefined
});

export const secureOrderService = {
  createSecureOrder: async (
    items: CartItem[],
    address: ShippingAddress,
    paymentMethod: OrderPaymentMethod,
    idempotencyKey: string,
    currency?: string,
    couponCode?: string,
    customerNote?: string
  ): Promise<SecureOrderResponse> => {
    const orderData = buildOrderPayload(
      items,
      address,
      paymentMethod,
      currency,
      couponCode,
      customerNote
    );

    const response = await api.post('/orders', orderData, {
      headers: {
        'Idempotency-Key': idempotencyKey
      }
    });
    return response.data;
  },

  /**
   * Verify order exists and belongs to user
   */
  verifyOrder: async (orderId: string): Promise<boolean> => {
    try {
      const response = await api.get(`/orders/${orderId}`);
      return response.data.success;
    } catch {
      return false;
    }
  },

  getOrder: async (
    orderId: string,
    signal?: AbortSignal
  ): Promise<OrderSnapshot> => {
    const response = await api.get(`/orders/${orderId}`, { signal });
    return response.data.data.order;
  }
};
