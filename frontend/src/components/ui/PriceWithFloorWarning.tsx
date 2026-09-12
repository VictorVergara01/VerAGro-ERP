import { Text, Tooltip } from "@mantine/core";

import { formatCurrency } from "../../utils/format";

/**
 * Precio unitario de una línea de venta (factura, cotización o pieza de orden de
 * servicio), marcado en rojo con un tooltip cuando quedó vendido bajo el piso
 * (`below_min_price`). Puramente informativo: no valida ni bloquea el guardado.
 *
 * `belowMin` recibe el campo tal cual lo expone el serializer — el schema OpenAPI
 * lo tipa como `string` (SerializerMethodField sin type hint) aunque en runtime es
 * boolean, así que se acepta `unknown` y sólo se evalúa su truthiness.
 */
export function PriceWithFloorWarning({
  value,
  floor,
  belowMin,
}: {
  value: string | number | null | undefined;
  floor: string | number | null | undefined;
  belowMin: unknown;
}) {
  if (!belowMin) return <>{formatCurrency(value)}</>;
  return (
    <Tooltip label={`Bajo el mínimo: piso ${formatCurrency(floor)}`}>
      <Text c="red" fw={600} component="span">
        {formatCurrency(value)}
      </Text>
    </Tooltip>
  );
}
