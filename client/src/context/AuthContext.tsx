import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiFetch, setInMemoryToken } from '../lib/api';

export type UserRole = 'student' | 'admin' | 'approver';
export type RoleCode = 'ADMIN' | 'APPROVER_1' | 'APPROVER_2' | 'STUDENT';

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  role_code: RoleCode;
  public_key_hex: string | null;
  designation?: string;
  department?: string;
  registration_id?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  loginWithCredentials: (email: string, password: string) => Promise<AuthUser>;
  loginWithDevIdentity: (identityKey: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function restoreSession() {
      try {
        // Restores session automatically via HttpOnly marksure_sid cookie
        const res = await apiFetch<{ user: AuthUser }>('/api/auth/me');
        setUser(res.user);
      } catch {
        setInMemoryToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    }
    restoreSession();
  }, []);

  async function loginWithCredentials(
    email: string,
    password: string
  ): Promise<AuthUser> {
    const res = await apiFetch<{ user: AuthUser; session_token?: string }>(
      '/api/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }
    );
    if (res.session_token) {
      setInMemoryToken(res.session_token);
    }
    setUser(res.user);
    return res.user;
  }

  async function loginWithDevIdentity(identityKey: string): Promise<AuthUser> {
    const res = await apiFetch<{ user: AuthUser; session_token?: string }>(
      '/api/auth/dev-session',
      {
        method: 'POST',
        body: JSON.stringify({ identity_key: identityKey }),
      }
    );
    if (res.session_token) {
      setInMemoryToken(res.session_token);
    }
    setUser(res.user);
    return res.user;
  }

  async function logout(): Promise<void> {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setInMemoryToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        loginWithCredentials,
        loginWithDevIdentity,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
