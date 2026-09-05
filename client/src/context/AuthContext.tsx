import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { api, setTokens, clearTokens, getAccessToken } from '../api/client';
import type { Role } from '../types/roles';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  loginType: string;
  scope: {
    provinceId?: string | null;
    districtId?: string | null;
    municipalityId?: string | null;
    wardId?: string | null;
    organizationId?: string | null;
  };
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  // Used by flows that mint a session without a /auth/login call — e.g.
  // organization self-registration, which returns tokens + user directly.
  adoptSession: (accessToken: string, refreshToken: string, user: AuthUser) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get('/auth/me')
      .then((res) => setUser(res.data.user))
      .catch(() => clearTokens())
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const res = await api.post('/auth/login', { email, password });
    setTokens(res.data.accessToken, res.data.refreshToken);
    setUser(res.data.user);
  }

  function adoptSession(accessToken: string, refreshToken: string, nextUser: AuthUser) {
    setTokens(accessToken, refreshToken);
    setUser(nextUser);
  }

  function logout() {
    clearTokens();
    setUser(null);
  }

  const value = useMemo(() => ({ user, loading, login, logout, adoptSession }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
