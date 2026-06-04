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

async function tryRefresh(): Promise<string | null> {
  const refresh = await getRefresh();
  if (!refresh) return null;
  const res = await fetch(`${API_BASE_URL}/api/auth/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access: string };
  await setTokens(data.access);
  return data.access;
}

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
