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

async function tryRefresh(): Promise<string | null> {
  const refresh = getRefresh();
  if (!refresh) return null;
  const res = await fetch(`${API_BASE_URL}/api/auth/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access: string };
  setTokens(data.access);
  return data.access;
}

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
