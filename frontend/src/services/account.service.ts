import api from '@/lib/api';

export type Address = { id: string; fullName: string; phone: string; address: string; addressLine2?: string; city: string; province: string; postalCode?: string; country: string; isDefault: boolean };
export type AccountProfile = { id: string; fullName: string; email: string; phone?: string; avatar?: string; isVerified: boolean };

const data = <T>(response: { data: { data: T } }) => response.data.data;
export const accountService = {
  profile: () => api.get('/account/profile').then(data<{ profile: AccountProfile }>),
  updateProfile: (payload: Partial<Pick<AccountProfile, 'fullName' | 'phone' | 'avatar'>>) => api.patch('/account/profile', payload).then(data<{ profile: AccountProfile }>),
  addresses: () => api.get('/account/addresses').then(data<{ addresses: Address[] }>),
  addAddress: (payload: Omit<Address, 'id'>) => api.post('/account/addresses', payload).then(data<{ address: Address }>),
  updateAddress: (id: string, payload: Partial<Omit<Address, 'id'>>) => api.patch(`/account/addresses/${id}`, payload).then(data<{ address: Address }>),
  removeAddress: (id: string) => api.delete(`/account/addresses/${id}`),
  wishlist: () => api.get('/account/wishlist').then(data<{ items: Array<{ id: string; product: Record<string, unknown> }> }>),
  addWishlist: (productId: string) => api.post(`/account/wishlist/${productId}`).then(data),
  removeWishlist: (productId: string) => api.delete(`/account/wishlist/${productId}`),
  reviews: (productId: string) => api.get(`/account/reviews/product/${productId}`).then(data),
  submitReview: (payload: { productId: string; rating: number; title?: string; comment: string }) => api.post('/account/reviews', payload).then(data),
  returns: () => api.get('/account/returns').then(data),
  requestReturn: (payload: Record<string, unknown>) => api.post('/account/returns', payload).then(data),
  refunds: () => api.get('/account/refunds').then(data),
  invoice: (orderId: string) => api.get(`/account/orders/${orderId}/invoice`).then(data),
  tracking: (orderId: string) => api.get(`/account/orders/${orderId}/tracking`).then(data),
  notifications: () => api.get('/account/notifications').then(data),
  markNotificationRead: (id: string) => api.put(`/account/notifications/${id}/read`).then(data),
  markAllNotificationsRead: () => api.put('/account/notifications/mark-all-read').then(data),
};
