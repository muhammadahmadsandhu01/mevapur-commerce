import api from '@/lib/api';
import { CartItem } from '@/store/cartStore';
import { PricingResult } from '@/lib/checkout/pricing';

interface ShippingAddress {
  fullName: string;
  phone: string;
  address: string;
  city: string;
  postalCode: string;
}

interface SecureOrderPayload {
  items: Array<{
    product: string;
    quantity: number;
  }>;
  shippingAddress: ShippingAddress;
  paymentMethod: string;
  couponCode?: string;
  notes?: string;
}

interface SecureOrderResponse {
  success: boolean;
  data: {
    _id: string;
    orderId: string;
    orderNumber: string;
    totalAmount: number;
  };
  message?: string;
}

export const secureOrderService = {
  /**
   * Create order with server-side pricing calculation
   * Client only sends product IDs and quantities
   * Server calculates all prices, discounts, and totals
   */
  createSecureOrder: async (
    items: CartItem[],
    address: ShippingAddress,
    paymentMethod: string,
    couponCode?: string,
    notes?: string
  ): Promise<SecureOrderResponse> => {
    const orderData: SecureOrderPayload = {
      items: items.map(item => ({
        product: item._id || item.id,
        quantity: item.quantity
      })),
      shippingAddress: {
        fullName: address.fullName,
        phone: address.phone,
        address: address.address,
        city: address.city,
        postalCode: address.postalCode
      },
      paymentMethod,
      couponCode: couponCode || undefined,
      notes: notes || undefined
    };

    const response = await api.post('/orders', orderData);
    return response.data;
  },

  /**
   * Verify order exists and belongs to user
   */
  verifyOrder: async (orderId: string): Promise<boolean> => {
    try {
      const response = await api.get(`/orders/${orderId}`);
      return response.data.success;
    } catch (error) {
      return false;
    }
  },

  /**
   * Get order summary (prices calculated server-side)
   */
  getOrderSummary: async (
    items: CartItem[],
    couponCode?: string
  ): Promise<PricingResult> => {
    const response = await api.post('/orders/validate', {
      items: items.map(item => ({
        product: item._id || item.id,
        quantity: item.quantity
      })),
      couponCode
    });
    
    return response.data.pricing;
  }
};