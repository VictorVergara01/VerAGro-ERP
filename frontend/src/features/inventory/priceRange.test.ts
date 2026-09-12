import { describe, expect, it } from "vitest";

import { computeRange } from "./priceRange";

describe("computeRange", () => {
  it("calcula piso, sugerido y techo sobre el costo promedio", () => {
    expect(computeRange(27.5, 25, 30, 45)).toEqual({
      floor: 34.38,
      suggested: 35.75,
      ceiling: 39.88,
    });
  });

  it("colapsa el rango al sugerido cuando no hay min ni max", () => {
    expect(computeRange(100, 0, 30, 0)).toEqual({
      floor: 130,
      suggested: 130,
      ceiling: 130,
    });
  });

  it("devuelve ceros sin costo promedio", () => {
    expect(computeRange(0, 25, 30, 45)).toEqual({
      floor: 0,
      suggested: 0,
      ceiling: 0,
    });
  });
});
