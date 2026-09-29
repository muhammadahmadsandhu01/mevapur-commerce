import axios from 'axios';
import { publicApiBaseUrl, resolveRuntimeApiBaseUrl } from '../config/publicConfig.ts';

export interface AuthPayload<TUser> {
  user: TUser;
  accessToken: string;
  csrfToken: string;
  expiresIn?: string;
}

interface CsrfContext {
  csrfToken: string;
  hasRefreshSession: boolean;
}

export const STOREFRONT_AUTH_KEY = 'mevapur_storefront_auth';

export interface StoredStorefrontAuth<TUser = unknown> {
  token: string;
  user: TUser;
  csrfToken?: string;
  timestamp?: number;
}

export const loadStoredStorefrontAuth = <TUser>(): StoredStorefrontAuth<TUser> | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STOREFRONT_AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredStorefrontAuth<TUser>;
    if (parsed && typeof parsed.token === 'string' && parsed.user) {
      return parsed;
    }
  } catch {
    // Ignore JSON parsing errors
  }
  return null;
};

export const saveStoredStorefrontAuth = <TUser>(auth: StoredStorefrontAuth<TUser>): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      STOREFRONT_AUTH_KEY,
      JSON.stringify({ ...auth, timestamp: Date.now() })
    );
  } catch {
    // Ignore storage quota/access errors
  }
};

export const clearStoredStorefrontAuth = (): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STOREFRONT_AUTH_KEY);
  } catch {
    // Ignore storage errors
  }
};

export const authHttp = axios.create({
  baseURL: publicApiBaseUrl,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    'X-Auth-Scope': 'storefront',
  },
});

authHttp.interceptors.request.use((config) => {
  config.baseURL = resolveRuntimeApiBaseUrl();
  return config;
});

let accessToken: string | null = null;
let csrfToken: string | null = null;
let refreshInFlight: Promise<AuthPayload<unknown> | null> | null = null;
let invalidationHandler: (() => void) | null = null;
let activeSessionGeneration = 0;

export const getAccessToken = () => accessToken;
export const getCsrfToken = () => csrfToken;
export const getSessionGeneration = () => activeSessionGeneration;
export const bumpSessionGeneration = () => ++activeSessionGeneration;
export const isCurrentSessionGeneration = (gen: number) => gen === activeSessionGeneration;

export const setInvalidationHandler = (handler: () => void) => {
  invalidationHandler = handler;
};

export const acceptAuthentication = <TUser>(
  payload: AuthPayload<TUser>
) => {
  if (!payload.accessToken || !payload.csrfToken) {
    throw new Error('Authentication response is incomplete');
  }

  accessToken = payload.accessToken;
  csrfToken = payload.csrfToken;
  bumpSessionGeneration();
  if (payload.user) {
    saveStoredStorefrontAuth({
      token: payload.accessToken,
      user: payload.user,
      csrfToken: payload.csrfToken,
    });
  }
  return payload;
};

export const clearAuthentication = (notify = false) => {
  accessToken = null;
  csrfToken = null;
  clearStoredStorefrontAuth();
  bumpSessionGeneration();
  if (notify) invalidationHandler?.();
};

export const fetchCsrfContext = async (): Promise<CsrfContext> => {
  const response = await authHttp.get('/auth/csrf-token');
  const context = response.data?.data as CsrfContext;
  if (!context?.csrfToken) {
    throw new Error('CSRF bootstrap response is incomplete');
  }
  csrfToken = context.csrfToken;
  return context;
};

export const refreshAuthentication = async (
  probeForRefreshCookie = false
): Promise<AuthPayload<unknown> | null> => {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      let context: CsrfContext | null = null;
      if (probeForRefreshCookie || !csrfToken) {
        context = await fetchCsrfContext();
      }

      if (context && !context.hasRefreshSession) {
        clearAuthentication();
        return null;
      }

      const response = await authHttp.post(
        '/auth/refresh',
        {},
        {
          headers: {
            'X-CSRF-Token': csrfToken,
          },
        }
      );
      return acceptAuthentication(
        response.data.data as AuthPayload<unknown>
      );
    } catch (error) {
      clearAuthentication(true);
      throw error;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
};

export const logoutAuthentication = async () => {
  const sendLogout = () => authHttp.post(
    '/auth/logout',
    {},
    {
      headers: {
        Authorization: accessToken ? `Bearer ${accessToken}` : undefined,
        'X-CSRF-Token': csrfToken,
      },
    }
  );

  try {
    if (!csrfToken) {
      await fetchCsrfContext().catch(() => undefined);
    }
    await sendLogout();
  } finally {
    clearAuthentication();
  }
};

export interface ActiveSession {
  id: string;
  ipAddress?: string;
  userAgent?: string;
  isCurrent?: boolean;
  createdAt: string;
  expiresAt?: string;
  deviceInfo?: {
    browser?: string;
    os?: string;
    device?: string;
  };
}

export const authService = {
  changePassword: async (data: { currentPassword: string; newPassword: string }) => {
    if (!csrfToken) {
      await fetchCsrfContext().catch(() => undefined);
    }
    const response = await authHttp.post(
      '/auth/change-password',
      data,
      {
        headers: {
          Authorization: accessToken ? `Bearer ${accessToken}` : undefined,
          'X-CSRF-Token': csrfToken,
        },
      }
    );
    clearAuthentication(true);
    return response.data;
  },

  getSessions: async () => {
    const response = await authHttp.get(
      '/auth/sessions',
      {
        headers: {
          Authorization: accessToken ? `Bearer ${accessToken}` : undefined,
        },
      }
    );
    return (response.data?.data?.sessions || []) as ActiveSession[];
  },

  revokeSession: async (sessionId: string) => {
    if (!csrfToken) {
      await fetchCsrfContext().catch(() => undefined);
    }
    const response = await authHttp.delete(
      `/auth/sessions/${sessionId}`,
      {
        headers: {
          Authorization: accessToken ? `Bearer ${accessToken}` : undefined,
          'X-CSRF-Token': csrfToken,
        },
      }
    );
    const result = response.data?.data;
    if (result?.revokedCurrent) {
      clearAuthentication(true);
    }
    return result;
  },

  logoutAll: async () => {
    if (!csrfToken) {
      await fetchCsrfContext().catch(() => undefined);
    }
    const response = await authHttp.post(
      '/auth/logout-all',
      {},
      {
        headers: {
          Authorization: accessToken ? `Bearer ${accessToken}` : undefined,
          'X-CSRF-Token': csrfToken,
        },
      }
    );
    clearAuthentication(true);
    return response.data;
  },
};
