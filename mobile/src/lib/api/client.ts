import createClient, { type Middleware } from "openapi-fetch";

import type { paths } from "./schema";
import { API_BASE_URL } from "./baseUrl";
import { clearTokens, getAccess, getRefresh, setTokens } from "../auth/tokens";

// Pequeño bus de eventos (RN no tiene window): la app se suscribe para forzar logout.
type Listener = () => void;
const authExpiredListeners = new Set<Listener>();
export function onAuthExpired(fn: Listener): () => void {
  authExpiredListeners.add(fn);
  return () => authExpiredListeners.delete(fn);
}
function emitAuthExpired() {
  authExpiredListeners.forEach((fn) => fn());
}

let refreshInFlight: Promise<string | null> | null = null;

// Mismo contrato que el cliente web: guarda el refresh rotado y comparte una sola
// petición entre llamadas concurrentes (con rotación, dos refrescos en paralelo
// con el mismo token cerrarían la sesión).
export function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = requestRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function requestRefresh(): Promise<string | null> {
  const refresh = await getRefresh();
  if (!refresh) return null;
  const res = await fetch(`${API_BASE_URL}/api/auth/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access: string; refresh?: string };
  await setTokens(data.access, data.refresh);
  return data.access;
}

// Invalida el refresh en el servidor. Con red lenta o sin red no bloquea el
// cierre de sesión más de 5 s.
export async function revokeSession(): Promise<void> {
  const refresh = await getRefresh();
  if (!refresh) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    await fetch(`${API_BASE_URL}/api/auth/logout/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
      signal: controller.signal,
    });
  } catch {
    // Sin conexión: el refresh vence solo en su plazo.
  } finally {
    clearTimeout(timer);
  }
}

const tryRefresh = refreshAccessToken;

const authMiddleware: Middleware = {
  async onRequest({ request }) {
    const token = await getAccess();
    if (token) request.headers.set("Authorization", `Bearer ${token}`);
    return request;
  },
  async onResponse({ request, response }) {
    // openapi-fetch exige devolver undefined si NO se modifica la respuesta,
    // o una Response nueva si se reemplaza.
    if (response.status !== 401 || request.url.includes("/api/auth/")) {
      return undefined;
    }
    const access = await tryRefresh();
    if (!access) {
      await clearTokens();
      emitAuthExpired();
      return undefined; // dejar pasar el 401 original
    }
    const retry = request.clone();
    retry.headers.set("Authorization", `Bearer ${access}`);
    return await fetch(retry);
  },
};

export const api = createClient<paths>({ baseUrl: API_BASE_URL });
api.use(authMiddleware);
