import { beforeEach, describe, expect, it } from "vitest";

import { clearTokens, getAccess, getRefresh, setTokens } from "./tokens";

describe("tokens", () => {
  beforeEach(() => localStorage.clear());

  it("set y get de access/refresh", () => {
    setTokens("acc", "ref");
    expect(getAccess()).toBe("acc");
    expect(getRefresh()).toBe("ref");
  });

  it("setTokens sin refresh conserva solo access", () => {
    setTokens("acc");
    expect(getAccess()).toBe("acc");
    expect(getRefresh()).toBeNull();
  });

  it("clear borra ambos", () => {
    setTokens("acc", "ref");
    clearTokens();
    expect(getAccess()).toBeNull();
    expect(getRefresh()).toBeNull();
  });
});
