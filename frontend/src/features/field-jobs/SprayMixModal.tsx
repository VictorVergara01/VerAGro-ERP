import {
  ActionIcon,
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useEffect, useState } from "react";

import { useCalculateMix } from "./api";
import type { SprayMixProduct, SprayMixResult } from "./types";

interface ProductRow {
  name: string;
  dose_per_liter: number | string;
  dose_unit: string;
}

export function SprayMixModal({
  opened,
  onClose,
  prefill,
}: {
  opened: boolean;
  onClose: () => void;
  prefill?: { hectares?: number; water_per_hectare?: number; tank_volume_liters?: number };
}) {
  const calc = useCalculateMix();
  const [hectares, setHectares] = useState<number | string>(prefill?.hectares ?? 0);
  const [water, setWater] = useState<number | string>(prefill?.water_per_hectare ?? 0);
  const [tank, setTank] = useState<number | string>(prefill?.tank_volume_liters ?? 0);
  const [products, setProducts] = useState<ProductRow[]>([
    { name: "", dose_per_liter: 0, dose_unit: "mL/L" },
  ]);
  const [result, setResult] = useState<SprayMixResult | null>(null);

  // Al abrir, sincroniza los valores numéricos desde el prefill del trabajo (el
  // modal queda montado dentro del formulario, así que useState no basta).
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (opened && prefill) {
      if (prefill.hectares != null) setHectares(prefill.hectares);
      if (prefill.water_per_hectare != null) setWater(prefill.water_per_hectare);
      if (prefill.tank_volume_liters != null) setTank(prefill.tank_volume_liters);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  const setProduct = (i: number, patch: Partial<ProductRow>) =>
    setProducts((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addProduct = () =>
    setProducts((rows) => [...rows, { name: "", dose_per_liter: 0, dose_unit: "mL/L" }]);
  const removeProduct = (i: number) =>
    setProducts((rows) => rows.filter((_, idx) => idx !== i));

  const run = async () => {
    try {
      const res = await calc.mutateAsync({
        hectares: Number(hectares),
        water_per_hectare: Number(water),
        tank_volume_liters: Number(tank),
        products: products.map((p) => ({
          name: p.name,
          dose_per_liter: Number(p.dose_per_liter),
          dose_unit: p.dose_unit,
        })) as SprayMixProduct[],
      });
      setResult(res);
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };

  const copy = () => {
    if (!result) return;
    const lines = [
      `Mezcla: ${result.total_volume_liters} L en ${result.fills_needed} llenados`,
      "Por tanque completo:",
      ...result.per_full_fill.map((r) => `  ${r.name}: ${r.quantity} ${r.unit}`),
    ];
    if (result.last_fill.length) {
      lines.push(`Último llenado (${result.last_fill_liters} L):`);
      lines.push(...result.last_fill.map((r) => `  ${r.name}: ${r.quantity} ${r.unit}`));
    }
    void navigator.clipboard?.writeText(lines.join("\n"));
    notifications.show({ color: "green", message: "Resultado copiado." });
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Calculadora de mezcla" size="lg">
      <Stack>
        <Group grow>
          <NumberInput label="Hectáreas" min={0} decimalScale={2} value={hectares} onChange={(v) => setHectares(v as number | string)} />
          <NumberInput label="Agua/ha (L)" min={0} decimalScale={2} value={water} onChange={(v) => setWater(v as number | string)} />
          <NumberInput label="Tanque (L)" min={0} decimalScale={2} value={tank} onChange={(v) => setTank(v as number | string)} />
        </Group>

        <Text fw={600} size="sm">Productos</Text>
        {products.map((p, i) => (
          <Group key={i} wrap="nowrap">
            <TextInput
              placeholder="Nombre"
              value={p.name}
              onChange={(e) => setProduct(i, { name: e.currentTarget.value })}
              style={{ flex: 1 }}
            />
            <NumberInput
              placeholder="Dosis/L"
              min={0}
              decimalScale={2}
              value={p.dose_per_liter}
              onChange={(v) => setProduct(i, { dose_per_liter: v })}
              w={110}
            />
            <Select
              data={["mL/L", "cc/L"]}
              value={p.dose_unit}
              onChange={(v) => setProduct(i, { dose_unit: v ?? "mL/L" })}
              allowDeselect={false}
              w={90}
            />
            <ActionIcon
              variant="subtle"
              color="red"
              aria-label="Quitar producto"
              onClick={() => removeProduct(i)}
              disabled={products.length === 1}
            >
              <IconTrash size={18} />
            </ActionIcon>
          </Group>
        ))}
        <Group>
          <Button variant="light" size="xs" leftSection={<IconPlus size={16} />} onClick={addProduct}>
            Agregar producto
          </Button>
          <Button size="xs" onClick={run} loading={calc.isPending}>
            Calcular
          </Button>
        </Group>

        {result && (
          <Stack gap="xs">
            <Text fw={700} c="green">
              Total: {result.total_volume_liters} L en {result.fills_needed} llenados
            </Text>
            <Table withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Producto</Table.Th>
                  <Table.Th>Por tanque</Table.Th>
                  <Table.Th>Último tanque</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {result.per_full_fill.map((r, i) => (
                  <Table.Tr key={r.name + i}>
                    <Table.Td>{r.name}</Table.Td>
                    <Table.Td>{r.quantity} {r.unit}</Table.Td>
                    <Table.Td>
                      {result.last_fill[i] ? `${result.last_fill[i].quantity} ${result.last_fill[i].unit}` : "—"}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            <Group>
              <Button variant="default" size="xs" onClick={copy}>Copiar resultado</Button>
            </Group>
          </Stack>
        )}
      </Stack>
    </Modal>
  );
}
