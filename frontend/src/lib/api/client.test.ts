import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearTokens, getAccess, getRefresh, setTokens } from "../auth/tokens";
import { refreshAccessToken, revokeSession } from "./client";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("refreshAccessToken", () => {
  beforeEach(() => {
    clearTokens();
    setTokens("old-access", "old-refresh");
  });
  afterEach(() => vi.unstubAllGlobals());

  it("guarda el refresh rotado cuando el backend lo devuelve", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ access: "new-access", refresh: "new-refresh" })));
    expect(await refreshAccessToken()).toBe("new-access");
    expect(getAccess()).toBe("new-access");
    expect(getRefresh()).toBe("new-refresh");
  });

  it("conserva el refresh actual si el backend no rota", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ access: "new-access" })));
    await refreshAccessToken();
    expect(getRefresh()).toBe("old-refresh");
  });

  it("varias peticiones con 401 a la vez comparten un solo refresh", async () => {
    // Con rotación, dos refrescos en paralelo con el mismo token harían que el
    // segundo fallara (token ya en lista negra) y cerrarían la sesión.
    const fetchMock = vi.fn(async () => jsonResponse({ access: "new-access", refresh: "new-refresh" }));
    vi.stubGlobal("fetch", fetchMock);
    const results = await Promise.all([refreshAccessToken(), refreshAccessToken(), refreshAccessToken()]);
    expect(results).toEqual(["new-access", "new-access", "new-access"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("devuelve null si el refresh ya no es válido", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ detail: "Token is blacklisted" }, 401)));
    expect(await refreshAccessToken()).toBeNull();
  });
});

describe("revokeSession", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("envía el refresh al endpoint de logout", async () => {
    clearTokens();
    setTokens("a", "the-refresh");
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);
    await revokeSession();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/auth\/logout\/$/);
    expect(JSON.parse(init.body as string)).toEqual({ refresh: "the-refresh" });
  });

  it("no falla si el servidor no responde", async () => {
    clearTokens();
    setTokens("a", "r");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    await expect(revokeSession()).resolves.toBeUndefined();
  });
});
