/** Espejo en cliente de apply_margin() del backend, para la vista previa en vivo. */

/**
 * Espejo de pick() dentro de effective_margins() en
 * backend/apps/inventory/services.py: el margen propio manda si está
 * configurado (> 0); si no, cae al de la categoría; si tampoco, 0 ("no
 * configurado").
 */
export function pickMargin(ownValue: number, categoryValue: number): number {
  if (ownValue > 0) return ownValue;
  if (categoryValue > 0) return categoryValue;
  return 0;
}

function priceAt(base: number, margin: number): number {
  return Math.round(base * (1 + margin / 100) * 100) / 100;
}

export function computeRange(
  averageCost: number,
  minMargin: number,
  targetMargin: number,
  maxMargin: number,
): { floor: number; suggested: number; ceiling: number } {
  if (!averageCost || averageCost <= 0) {
    return { floor: 0, suggested: 0, ceiling: 0 };
  }
  const suggested = priceAt(averageCost, targetMargin || 0);
  return {
    floor: minMargin > 0 ? priceAt(averageCost, minMargin) : suggested,
    suggested,
    ceiling: maxMargin > 0 ? priceAt(averageCost, maxMargin) : suggested,
  };
}
