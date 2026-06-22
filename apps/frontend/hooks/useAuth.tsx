'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, getApiBase } from '@/lib/api';
import {
  clearRefreshToken,
  clearToken,
  getRefreshToken,
  getToken,
  setRefreshToken,
  setToken,
} from '@/lib/auth-storage';
import type { User } from '@/types/models';

type AuthResponse = {
  token: string;
  accessToken?: string;
  refreshToken?: string;
  user: User;
};

type AuthContextValue = {
  token: string | null;
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function applySession(res: AuthResponse): void {
  const access = res.accessToken ?? res.token;
  setToken(access);
  if (res.refreshToken) {
    setRefreshToken(res.refreshToken);
  }
}

export function AuthProvider({ children }: { children: ReactNode }): React.ReactElement {
  const [token, setTok] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const t = getToken();
    if (!t) {
      setUser(null);
      return;
    }
    const me = await api<User>('/api/user/me', { token: t });
    setUser(me);
  }, []);

  useEffect(() => {
    const t = getToken();
    setTok(t);
    if (!t) {
      setLoading(false);
      return;
    }
    refreshUser()
      .catch(() => {
        clearToken();
        clearRefreshToken();
        setTok(null);
      })
      .finally(() => setLoading(false));
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      token: null,
      skipAuthRefresh: true,
    });
    applySession(res);
    setTok(res.accessToken ?? res.token);
    setUser(res.user);
  }, []);

  const register = useCallback(async (email: string, password: string, name?: string) => {
    const res = await api<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
      token: null,
      skipAuthRefresh: true,
    });
    applySession(res);
    setTok(res.accessToken ?? res.token);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    const rt = getRefreshToken();
    if (rt) {
      await fetch(`${getApiBase()}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      }).catch(() => {});
    }
    clearToken();
    clearRefreshToken();
    setTok(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      token,
      user,
      loading,
      login,
      register,
      logout,
      refreshUser,
    }),
    [token, user, loading, login, register, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider');
  }
  return ctx;
}
