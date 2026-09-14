import createClient, { type Middleware } from "openapi-fetch";

import type { paths } from "./schema";
import { clearTokens, getAccess, getRefresh, setTokens } from "../auth/tokens";

export const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? "http://localhost:8000";

/** Se dispara cuando el refresh falla: la app debe forzar logout/redirect. */
export const AUTH_EXPIRED_EVENT = "veragro:auth-expired";

function emitAuthExpired() {
  window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
}

let refreshInFlight: Promise<string | null> | null = null;

/**
 * Pide un access nuevo con el refresh guardado. Si el backend rota el refresh,
 * guarda también el nuevo. Las llamadas concurrentes comparten una sola petición:
 * con rotación, dos refrescos en paralelo con el mismo token harían fallar al
 * segundo (token ya en lista negra) y cerrarían la sesión.
 */
export function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = requestRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function requestRefresh(): Promise<string | null> {
  const refresh = getRefresh();
  if (!refresh) return null;
  const res = await fetch(`${API_BASE_URL}/api/auth/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access: string; refresh?: string };
  setTokens(data.access, data.refresh);
  return data.access;
}

/** Invalida el refresh en el servidor. Sin red no falla: la sesión local se cierra igual. */
export async function revokeSession(): Promise<void> {
  const refresh = getRefresh();
  if (!refresh) return;
  try {
    await fetch(`${API_BASE_URL}/api/auth/logout/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
    });
  } catch {
    // Sin conexión: el refresh vence solo en su plazo.
  }
}

const tryRefresh = refreshAccessToken;

const authMiddleware: Middleware = {
  onRequest({ request }) {
    const token = getAccess();
    if (token) request.headers.set("Authorization", `Bearer ${token}`);
    return request;
  },
  async onResponse({ request, response }) {
    if (response.status !== 401) return response;
    // No intentar refrescar sobre los propios endpoints de auth.
    if (request.url.includes("/api/auth/")) return response;

    const access = await tryRefresh();
    if (!access) {
      clearTokens();
      emitAuthExpired();
      return response;
    }
    // Reintenta la petición original con el nuevo token.
    const retry = request.clone();
    retry.headers.set("Authorization", `Bearer ${access}`);
    return fetch(retry);
  },
};

export const api = createClient<paths>({ baseUrl: API_BASE_URL });
api.use(authMiddleware);

/**
 * `fetch` autenticado para endpoints que no pasan por openapi-fetch (descargas,
 * subidas multipart). Adjunta el Bearer y, ante 401, intenta refrescar el token
 * y reintenta una vez (mismo comportamiento que el middleware). `path` es relativo
 * al `API_BASE_URL` (p.ej. "/api/inventory/products/export/").
 */
export async function authedFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getAccess();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  if (res.status !== 401 || path.includes("/api/auth/")) return res;

  const access = await tryRefresh();
  if (!access) {
    clearTokens();
    emitAuthExpired();
    return res;
  }
  headers.set("Authorization", `Bearer ${access}`);
  return fetch(`${API_BASE_URL}${path}`, { ...init, headers });
}
