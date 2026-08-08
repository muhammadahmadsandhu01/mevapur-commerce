import axios from 'axios';
import { publicApiBaseUrl } from '@/config/publicConfig';

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

export const authHttp = axios.create({
  baseURL: publicApiBaseUrl,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

let accessToken: string | null = null;
let csrfToken: string | null = null;
let refreshInFlight: Promise<AuthPayload<unknown> | null> | null = null;
let invalidationHandler: (() => void) | null = null;

export const getAccessToken = () => accessToken;
export const getCsrfToken = () => csrfToken;

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
  return payload;
};

export const clearAuthentication = (notify = false) => {
  accessToken = null;
  csrfToken = null;
  if (notify) invalidationHandler?.();
};

const fetchCsrfContext = async (): Promise<CsrfContext> => {
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
    if (!accessToken || !csrfToken) {
      await refreshAuthentication(true);
    }
    if (accessToken && csrfToken) {
      try {
        await sendLogout();
      } catch {
        const refreshed = await refreshAuthentication();
        if (refreshed) await sendLogout();
      }
    }
  } finally {
    clearAuthentication();
  }
};
