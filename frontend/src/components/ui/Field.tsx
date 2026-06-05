import { Text } from "@mantine/core";
import type { ReactNode } from "react";

/** Par etiqueta/valor para las páginas de detalle. */
export function Field({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {label}
      </Text>
      <Text component="div">{value === 0 ? value : value || "—"}</Text>
    </div>
  );
}
