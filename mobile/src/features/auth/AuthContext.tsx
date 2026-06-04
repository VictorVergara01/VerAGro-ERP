import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { api, onAuthExpired } from "../../lib/api/client";
import { API_BASE_URL } from "../../lib/api/baseUrl";
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
  logout: () => Promise<void>;
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

  const logout = useCallback(async () => {
    await clearTokens();
    setUser(null);
    setStatus("anonymous");
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      // El fetch rechaza si el dispositivo no alcanza el backend → result = null.
      const result = await api
        .POST("/api/auth/login/", {
          body: { email, password } as unknown as {
            email: string;
            password: string;
            access: string;
            refresh: string;
          },
        })
        .catch(() => null);
      if (!result) {
        // Fetch rechazado → el dispositivo no alcanza el backend.
        throw new Error(`No se pudo conectar al servidor (${API_BASE_URL}).`);
      }
      const { data, error } = result;
      if (error || !data) {
        // Respuesta del backend con error (típicamente 401): credenciales.
        throw new Error("Credenciales inválidas. Verifica correo y contraseña.");
      }
      await setTokens(data.access, data.refresh);
      await loadMe();
    },
    [loadMe],
  );

  useEffect(() => {
    (async () => {
      if (await getAccess()) {
        await loadMe();
      } else {
        setStatus("anonymous");
      }
    })();
  }, [loadMe]);

  useEffect(() => onAuthExpired(() => void logout()), [logout]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, login, logout }),
    [user, status, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
