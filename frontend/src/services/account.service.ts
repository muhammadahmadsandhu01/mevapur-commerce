import { isAxiosError } from 'axios';
import api from '../lib/api.ts';

export type Address = { id: string; fullName: string; phone: string; address: string; addressLine2?: string; city: string; province: string; postalCode?: string; country: string; isDefault: boolean };
export type AccountProfile = { id: string; fullName: string; email: string; phone?: string; avatar?: string; isVerified: boolean };
export type ReturnReason = 'damaged' | 'wrong_item' | 'not_as_described'
  | 'not_satisfied' | 'duplicate' | 'other';
export type AccountReturnStatus = 'pending' | 'approved' | 'received' | 'inspected'
  | 'inventory_reconciliation' | 'refunded' | 'rejected' | 'cancelled';

export interface HistoricalOrderProduct {
  _id: string;
  name?: string;
  images?: string[];
}

export interface HistoricalOrderLine {
  product: string | HistoricalOrderProduct;
  variantId?: string | null;
  name: string;
  sku?: string;
  variant?: string;
  quantity: number;
  image?: string;
}

export interface HistoricalOrder {
  _id: string;
  orderId: string;
  orderStatus: string;
  items: HistoricalOrderLine[];
}

export interface ReturnRequestPayload {
  orderId: string;
  items: Array<{
    productId: string;
    variantId?: string;
    quantity: number;
    reason: ReturnReason;
    reasonDetails?: string;
  }>;
  customerNotes?: string;
}

export interface AccountReturnSummary {
  id: string;
  returnNumber: string;
  status: AccountReturnStatus;
}

export interface AccountRefundSummary {
  id: string;
  refundNumber: string;
  status: string;
  amount: number;
  currency: string;
}

interface ApiErrorEnvelope {
  error?: { message?: string };
}

export const historicalProductId = (line: HistoricalOrderLine): string => (
  typeof line.product === 'string' ? line.product : line.product._id
);

export const buildReturnRequestPayload = ({
  orderId,
  line,
  quantity,
  reason,
  details
}: {
  orderId: string;
  line: HistoricalOrderLine;
  quantity: number;
  reason: ReturnReason;
  details: string;
}): ReturnRequestPayload => {
  const trimmedDetails = details.trim();
  return {
    orderId,
    items: [{
      productId: historicalProductId(line),
      ...(line.variantId ? { variantId: line.variantId } : {}),
      quantity,
      reason,
      ...(trimmedDetails ? { reasonDetails: trimmedDetails } : {})
    }],
    ...(trimmedDetails ? { customerNotes: trimmedDetails } : {})
  };
};

export const getAccountApiErrorMessage = (
  error: unknown,
  fallback: string
): string => {
  if (!isAxiosError<ApiErrorEnvelope>(error)) return fallback;
  const message = error.response?.data?.error?.message;
  return typeof message === 'string' && message.trim() ? message : fallback;
};

const data = <T>(response: { data: { data: T } }) => response.data.data;
export interface AccountOwnReviewProduct {
  id: string;
  _id?: string;
  name: string;
  slug?: string;
  price?: number;
  salePrice?: number;
  images?: string[];
  stock?: number;
  hasVariants?: boolean;
  variants?: unknown[];
  attributes?: unknown[];
  isActive?: boolean;
}

export interface AccountOwnReview {
  id: string;
  product: AccountOwnReviewProduct | null;
  rating: number;
  title: string;
  comment: string;
  status: 'pending' | 'approved' | 'rejected' | 'flagged' | 'withdrawn';
  isVerifiedPurchase: boolean;
  adminReply?: string;
  repliedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MarketCapability {
  homeCountry: string;
  enabledCountries: string[];
  defaultCurrency: string;
  enabledCurrencies: string[];
}

export const accountService = {
  profile: () => api.get('/account/profile').then(data<{ profile: AccountProfile }>),
  updateProfile: (payload: Partial<Pick<AccountProfile, 'fullName' | 'phone' | 'avatar'>>) => api.patch('/account/profile', payload).then(data<{ profile: AccountProfile }>),
  addresses: () => api.get('/account/addresses').then(data<{ addresses: Address[] }>),
  addAddress: (payload: Omit<Address, 'id'>) => api.post('/account/addresses', payload).then(data<{ address: Address }>),
  updateAddress: (id: string, payload: Partial<Omit<Address, 'id'>>) => api.patch(`/account/addresses/${id}`, payload).then(data<{ address: Address }>),
  removeAddress: (id: string) => api.delete(`/account/addresses/${id}`),
  wishlist: () => api.get('/account/wishlist').then(data<{ items: Array<{ id: string; product: AccountOwnReviewProduct }> }>),
  addWishlist: (productId: string) => api.post(`/account/wishlist/${productId}`).then(data),
  removeWishlist: (productId: string) => api.delete(`/account/wishlist/${productId}`),
  reviews: (productId: string) => api.get(`/account/reviews/product/${productId}`).then(data),
  submitReview: (payload: { productId: string; rating: number; title?: string; comment: string }) => api.post('/account/reviews', payload).then(data),
  myReviews: (params?: { page?: number; limit?: number }) => api.get('/account/reviews', { params }).then(data<{ reviews: AccountOwnReview[]; total: number; page: number; limit: number }>),
  updateReview: (id: string, payload: { rating?: number; title?: string; comment?: string }) => api.patch(`/account/reviews/${id}`, payload).then(data<{ review: AccountOwnReview }>),
  deleteReview: (id: string) => api.delete(`/account/reviews/${id}`),
  reportReview: (reviewId: string, payload: { category: string; details?: string }) => api.post(`/reviews/${reviewId}/report`, payload).then(data),
  market: () => api.get('/commerce/market').then(data<MarketCapability>).catch(() => ({ homeCountry: 'PK', enabledCountries: ['PK'], defaultCurrency: 'PKR', enabledCurrencies: ['PKR'] })),
  returns: () => api.get('/account/returns').then(data<{ returns: AccountReturnSummary[] }>),
  requestReturn: (payload: ReturnRequestPayload) => api.post('/account/returns', payload).then(data),
  refunds: () => api.get('/account/refunds').then(data<{ refunds: AccountRefundSummary[] }>),
  order: (orderId: string) => api.get(`/orders/${encodeURIComponent(orderId)}`)
    .then(data<{ order: HistoricalOrder }>)
    .then(({ order }) => order),
  invoice: (orderId: string) => api.get(`/account/orders/${orderId}/invoice`).then(data),
  tracking: (orderId: string) => api.get(`/account/orders/${orderId}/tracking`).then(data),
  notifications: () => api.get('/account/notifications').then(data),
  markNotificationRead: (id: string) => api.put(`/account/notifications/${id}/read`).then(data),
  markAllNotificationsRead: () => api.put('/account/notifications/mark-all-read').then(data),
};
