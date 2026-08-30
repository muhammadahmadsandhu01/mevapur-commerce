export const ADMIN_NOTIFICATION_CHANGE_EVENT = 'harzaar:admin-notifications-changed';

export type AdminNotificationType = 'order' | 'stock' | 'review' | 'customer' | 'system' | 'payment';
export type AdminNotificationPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface AdminNotification {
  _id: string;
  type: AdminNotificationType;
  title: string;
  message: string;
  isRead: boolean;
  priority: AdminNotificationPriority;
  actionUrl: string;
  createdAt: string;
}

export interface AdminNotificationStats {
  totalNotifications: number;
  unreadCount: number;
  readCount: number;
}

export type TopBarPopover = 'quick-create' | 'notifications' | 'profile' | null;

export const QUICK_CREATE_ACTIONS = [
  { label: 'Add Product', href: '/products/add' },
  { label: 'Create Coupon', href: '/coupons?create=1' }
] as const;

const notificationTypes: AdminNotificationType[] = [
  'order',
  'stock',
  'review',
  'customer',
  'system',
  'payment'
];

const notificationPriorities: AdminNotificationPriority[] = [
  'low',
  'medium',
  'high',
  'urgent'
];

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const isFiniteNonNegativeInteger = (value: unknown): value is number => (
  typeof value === 'number'
  && Number.isFinite(value)
  && Number.isInteger(value)
  && value >= 0
);

const isNotificationType = (value: unknown): value is AdminNotificationType => (
  typeof value === 'string'
  && notificationTypes.some((type) => type === value)
);

const isNotificationPriority = (value: unknown): value is AdminNotificationPriority => (
  typeof value === 'string'
  && notificationPriorities.some((priority) => priority === value)
);

const isAdminNotification = (value: unknown): value is AdminNotification => (
  isRecord(value)
  && typeof value._id === 'string'
  && value._id.length > 0
  && isNotificationType(value.type)
  && typeof value.title === 'string'
  && typeof value.message === 'string'
  && typeof value.isRead === 'boolean'
  && isNotificationPriority(value.priority)
  && typeof value.actionUrl === 'string'
  && typeof value.createdAt === 'string'
);

export const validateNotificationListEnvelope = (value: unknown): AdminNotification[] | null => {
  if (!isRecord(value) || value.success !== true || !Array.isArray(value.data)) return null;
  return value.data.every(isAdminNotification) ? value.data : null;
};

export const validateUnreadCountEnvelope = (value: unknown): number | null => {
  if (!isRecord(value) || value.success !== true || !isRecord(value.data)) return null;
  return isFiniteNonNegativeInteger(value.data.count) ? value.data.count : null;
};

export const validateNotificationStatsEnvelope = (value: unknown): AdminNotificationStats | null => {
  if (!isRecord(value) || value.success !== true || !isRecord(value.data)) return null;

  const { totalNotifications, unreadCount, readCount } = value.data;
  if (
    !isFiniteNonNegativeInteger(totalNotifications)
    || !isFiniteNonNegativeInteger(unreadCount)
    || !isFiniteNonNegativeInteger(readCount)
    || unreadCount + readCount !== totalNotifications
  ) {
    return null;
  }

  return { totalNotifications, unreadCount, readCount };
};

export const isSuccessfulMutationEnvelope = (value: unknown): boolean => (
  isRecord(value) && value.success === true
);

export const notificationBadgeText = (count: number): string | null => {
  if (!isFiniteNonNegativeInteger(count) || count === 0) return null;
  return count > 99 ? '99+' : String(count);
};

export const safeInternalActionUrl = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return null;
  if (value.includes('\\') || /[\u0000-\u001F\u007F]/.test(value)) return null;
  return value;
};

export const formatNotificationTime = (value: string, now = Date.now()): string => {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'Date unavailable';

  const elapsed = now - timestamp;
  const absoluteElapsed = Math.abs(elapsed);
  if (absoluteElapsed < 60_000) return elapsed < 0 ? 'In a moment' : 'Just now';

  const units = [
    { milliseconds: 86_400_000, label: 'day' },
    { milliseconds: 3_600_000, label: 'hour' },
    { milliseconds: 60_000, label: 'minute' }
  ];
  const unit = units.find(({ milliseconds }) => absoluteElapsed >= milliseconds) ?? units[2];
  const amount = Math.floor(absoluteElapsed / unit.milliseconds);
  const label = `${unit.label}${amount === 1 ? '' : 's'}`;
  return elapsed < 0 ? `In ${amount} ${label}` : `${amount} ${label} ago`;
};

export const toggleTopBarPopover = (
  current: TopBarPopover,
  requested: Exclude<TopBarPopover, null>
): TopBarPopover => current === requested ? null : requested;

export const isCouponCreateRequested = (value: string | null): boolean => value === '1';

export const removeCouponCreateQuery = (query: string): string => {
  const params = new URLSearchParams(query);
  params.delete('create');
  const nextQuery = params.toString();
  return nextQuery ? `/coupons?${nextQuery}` : '/coupons';
};

export const announceAdminNotificationChange = (): void => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(ADMIN_NOTIFICATION_CHANGE_EVENT));
  }
};
