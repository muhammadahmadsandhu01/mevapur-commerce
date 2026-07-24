import axios from 'axios';
import { CartItem } from '@/store/cartStore';
import { PricingResult } from '@/lib/checkout/pricing';

interface ShippingAddress {
  fullName: string;
  phone: string;
  address: string;
  city: string;
  postalCode: string;
}

interface OrderPayload {
  items: Array<{
    product: string;
    name: string;
    price: number;
    quantity: number;
    image: string;
  }>;
  shippingAddress: ShippingAddress;
  paymentMethod: string;
  subtotal: number;
  shippingCost: number;
  discount: number;
  totalAmount: number;
  notes: string;
}

export interface OrderResponse {
  success: boolean;
  data: {
    _id: string;
    orderNumber: string;
  };
  message?: string;
}

/**
 * Creates an order via the backend API.
 * Separates network logic from UI components.
 */
export async function createOrder(
  token: string,
  items: CartItem[],
  address: ShippingAddress,
  paymentMethod: string,
  pricing: PricingResult,
  notes: string
): Promise<OrderResponse> {
  
  const orderData: OrderPayload = {
    items: items.map((item) => ({
      product: item._id || item.id, // Ensure backend gets ID
      name: item.name,
      price: parseFloat(String(item.price)),
      quantity: item.quantity,
      image: item.image || '',
    })),
    shippingAddress: {
      fullName: address.fullName,
      phone: address.phone,
      address: address.address,
      city: address.city,
      postalCode: address.postalCode,
    },
    paymentMethod,
    subtotal: pricing.subtotal,
    shippingCost: pricing.shippingCost,
    discount: pricing.discountAmount,
    totalAmount: pricing.grandTotal,
    notes: notes || 'Order placed via website',
  };

  const response = await axios.post<OrderResponse>(
    `${process.env.NEXT_PUBLIC_API_URL}/orders`,
    orderData,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return response.data;
}