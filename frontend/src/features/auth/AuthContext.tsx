import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { api, AUTH_EXPIRED_EVENT } from "../../lib/api/client";
import { clearTokens, getAccess, setTokens } from "../../lib/auth/tokens";

export interface AuthUser {
  id: number;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
}

export type AuthStatus = "loading" | "authenticated" | "anonymous";

export interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  const loadMe = useCallback(async () => {
    const { data, error } = await api.GET("/api/auth/me/");
    if (error || !data) {
      setUser(null);
      setStatus("anonymous");
      return;
    }
    setUser(data as AuthUser);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
    setStatus("anonymous");
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      // drf-spectacular reusa el componente TokenObtainPair para request y
      // response, así que el body tipado exige access/refresh (readonly). El
      // body real solo lleva email/password; casteamos para el tipado.
      const { data, error } = await api.POST("/api/auth/login/", {
        body: { email, password } as unknown as {
          email: string;
          password: string;
          access: string;
          refresh: string;
        },
      });
      if (error || !data) {
        throw new Error("Credenciales inválidas.");
      }
      setTokens(data.access, data.refresh);
      await loadMe();
    },
    [loadMe],
  );

  useEffect(() => {
    if (getAccess()) {
      void loadMe();
    } else {
      setStatus("anonymous");
    }
  }, [loadMe]);

  useEffect(() => {
    const handler = () => logout();
    window.addEventListener(AUTH_EXPIRED_EVENT, handler);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handler);
  }, [logout]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, login, logout }),
    [user, status, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
