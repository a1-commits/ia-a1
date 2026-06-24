import {
  clearRefreshToken,
  clearToken,
  getRefreshToken,
  setRefreshToken,
  setToken,
} from './auth-storage';
import { getApiBase } from './api-base';
import { API_POLL_TIMEOUT_MS } from '@agente-mobi/shared';

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

function redirectToLogin(): void {
  if (typeof window === 'undefined') return;
  if (window.location.pathname.startsWith('/login')) return;
  window.location.href = '/login';
}

export async function api<T>(
  path: string,
  init?: RequestInit & {
    token?: string | null;
    skipAuthRefresh?: boolean;
    timeoutMs?: number;
  },
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

  const timeoutMs = init?.timeoutMs ?? API_POLL_TIMEOUT_MS;

  const doFetch = (): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    const userSignal = init?.signal;
    if (userSignal) {
      if (userSignal.aborted) controller.abort();
      else userSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    return fetch(`${getApiBase()}${path}`, {
      ...init,
      headers: buildHeaders(),
      signal: controller.signal,
    }).finally(() => window.clearTimeout(timeoutId));
  };

  let res: Response;
  try {
    res = await doFetch();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError('Tempo esgotado na conexão com o servidor', 408);
    }
    throw new ApiError('Falha de rede ao contactar o servidor', 0);
  }

  if (
    res.status === 401 &&
    !init?.skipAuthRefresh &&
    !AUTH_PATHS_NO_REFRESH.includes(path)
  ) {
    const refreshed = await tryRefreshAccess();
    if (refreshed) {
      try {
        res = await doFetch();
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw new ApiError('Tempo esgotado na conexão com o servidor', 408);
        }
        throw new ApiError('Falha de rede ao contactar o servidor', 0);
      }
    }
    if (res.status === 401) {
      clearRefreshToken();
      clearToken();
      redirectToLogin();
      throw new ApiError('Sessão expirada', 401);
    }
  }

  if (res.status === 304) {
    return null as T;
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
