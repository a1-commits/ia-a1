import {
  clearRefreshToken,
  clearToken,
  getRefreshToken,
  getToken,
  setRefreshToken,
  setToken,
} from './auth-storage';
import { getApiBase } from './api-base';

const AUTH_PATHS_NO_REFRESH = ['/api/auth/login', '/api/auth/register', '/api/auth/refresh'];

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function tryRefreshAccess(): Promise<boolean> {
  const rt = getRefreshToken();
  if (!rt) return false;
  try {
    const res = await fetch(`${getApiBase()}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt }),
    });
    if (!res.ok) {
      clearRefreshToken();
      clearToken();
      return false;
    }
    const data = (await res.json()) as {
      accessToken?: string;
      token?: string;
      refreshToken?: string;
    };
    const access = data.accessToken ?? data.token;
    if (!access) {
      clearRefreshToken();
      clearToken();
      return false;
    }
    setToken(access);
    if (data.refreshToken) setRefreshToken(data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

export async function api<T>(
  path: string,
  init?: RequestInit & { token?: string | null; skipAuthRefresh?: boolean },
): Promise<T> {
  const buildHeaders = (): Headers => {
    const headers = new Headers(init?.headers);
    const token =
      init?.token ??
      (typeof window !== 'undefined' ? localStorage.getItem('agente_mobi_token') : null);
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    if (!headers.has('Content-Type') && init?.body) {
      headers.set('Content-Type', 'application/json');
    }
    return headers;
  };

  const doFetch = (): Promise<Response> =>
    fetch(`${getApiBase()}${path}`, { ...init, headers: buildHeaders() });

  let res = await doFetch();

  if (
    res.status === 401 &&
    !init?.skipAuthRefresh &&
    !AUTH_PATHS_NO_REFRESH.includes(path)
  ) {
    const refreshed = await tryRefreshAccess();
    if (refreshed) {
      res = await doFetch();
    }
  }

  if (!res.ok) {
    const errBody = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(errBody?.error ?? res.statusText, res.status);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

export { getApiBase } from './api-base';
