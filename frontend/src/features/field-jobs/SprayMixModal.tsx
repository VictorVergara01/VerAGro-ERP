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
import { PRODUCT_UNIT_OPTIONS, type SprayMixPrefill, type SprayMixResult } from "./types";

interface ProductRow {
  name: string;
  dose_per_hectare: number | string;
  unit: string;
}

const emptyRow = (): ProductRow => ({ name: "", dose_per_hectare: 0, unit: "L/ha" });

export function SprayMixModal({
  opened,
  onClose,
  prefill,
}: {
  opened: boolean;
  onClose: () => void;
  prefill?: SprayMixPrefill;
}) {
  const calc = useCalculateMix();
  const [hectares, setHectares] = useState<number | string>(0);
  const [caldo, setCaldo] = useState<number | string>(0);
  const [tank, setTank] = useState<number | string>(200);
  const [rows, setRows] = useState<ProductRow[]>([emptyRow()]);
  const [result, setResult] = useState<SprayMixResult | null>(null);

  // Sincroniza los inputs desde el prefill al abrir (el modal queda montado).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (opened) {
      setHectares(prefill?.hectares ?? 0);
      setCaldo(prefill?.caldo_per_hectare ?? 0);
      setTank(prefill?.tank_volume_liters ?? 200);
      const seeded = (prefill?.products ?? []).filter((p) => p.name);
      setRows(
        seeded.length
          ? seeded.map((p) => ({ name: p.name, dose_per_hectare: p.dose_per_hectare, unit: p.unit }))
          : [emptyRow()],
      );
      setResult(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const setRow = (i: number, patch: Partial<ProductRow>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, emptyRow()]);
  const removeRow = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));

  const run = async () => {
    setResult(null);
    try {
      const res = await calc.mutateAsync({
        hectares: Number(hectares),
        caldo_per_hectare: Number(caldo),
        tank_volume_liters: Number(tank),
        products: rows
          .filter((r) => r.name.trim())
          .map((r) => ({ name: r.name.trim(), dose_per_hectare: Number(r.dose_per_hectare), unit: r.unit })),
      });
      setResult(res);
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Calculadora de mezcla" size="lg">
      <Stack>
        <Group grow>
          <NumberInput label="Hectáreas" min={0} decimalScale={4} value={hectares} onChange={(v) => setHectares(v as number | string)} />
          <NumberInput label="Tasa de aplicación (L/ha)" min={0} decimalScale={2} value={caldo} onChange={(v) => setCaldo(v as number | string)} />
          <NumberInput label="Tanque (L)" min={0} decimalScale={2} value={tank} onChange={(v) => setTank(v as number | string)} />
        </Group>

        <Text fw={600} size="sm">Productos (dosis por hectárea)</Text>
        {rows.map((r, i) => (
          <Group key={i} wrap="nowrap">
            <TextInput
              placeholder="Producto"
              value={r.name}
              onChange={(e) => setRow(i, { name: e.currentTarget.value })}
              style={{ flex: 1 }}
            />
            <NumberInput
              placeholder="Dosis/ha"
              min={0}
              decimalScale={4}
              value={r.dose_per_hectare}
              onChange={(v) => setRow(i, { dose_per_hectare: v })}
              w={120}
            />
            <Select
              data={PRODUCT_UNIT_OPTIONS}
              value={r.unit}
              onChange={(v) => setRow(i, { unit: v ?? "L/ha" })}
              allowDeselect={false}
              w={100}
            />
            <ActionIcon
              variant="subtle"
              color="red"
              aria-label="Quitar producto"
              onClick={() => removeRow(i)}
              disabled={rows.length === 1}
            >
              <IconTrash size={18} />
            </ActionIcon>
          </Group>
        ))}
        <Group>
          <Button variant="light" size="xs" leftSection={<IconPlus size={16} />} onClick={addRow}>
            Agregar producto
          </Button>
          <Button size="xs" onClick={run} loading={calc.isPending}>Calcular</Button>
        </Group>

        {result && (
          <Stack gap="xs">
            <Text fw={700} c="green">
              Caldo total: {result.total_caldo_liters} L · {result.tanks_needed} tanque(s) ·
              químico líquido {result.liquid_chemical_liters} L · agua {result.water_liters} L
            </Text>
            <Table.ScrollContainer minWidth={480}>
            <Table withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Producto</Table.Th>
                  <Table.Th>Total</Table.Th>
                  <Table.Th>Por tanque lleno</Table.Th>
                  <Table.Th>Último tanque</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {result.products_total.map((p, i) => (
                  <Table.Tr key={p.name + i}>
                    <Table.Td>{p.name}</Table.Td>
                    <Table.Td>{p.quantity} {p.unit}</Table.Td>
                    <Table.Td>
                      {result.per_full_tank[i] ? `${result.per_full_tank[i].quantity} ${result.per_full_tank[i].unit}` : "—"}
                    </Table.Td>
                    <Table.Td>
                      {result.last_tank[i] ? `${result.last_tank[i].quantity} ${result.last_tank[i].unit}` : "—"}
                    </Table.Td>
                  </Table.Tr>
                ))}
                <Table.Tr>
                  <Table.Td fw={700}>Agua</Table.Td>
                  <Table.Td fw={700}>{result.water_liters} L</Table.Td>
                  <Table.Td>{result.full_tanks > 0 ? `${result.water_per_full_tank} L` : "—"}</Table.Td>
                  <Table.Td>{result.last_tank_liters > 0 ? `${result.water_last_tank} L` : "—"}</Table.Td>
                </Table.Tr>
              </Table.Tbody>
            </Table>
            </Table.ScrollContainer>
            {result.full_tanks > 0 && (
              <Text size="sm" c="dimmed">
                {result.full_tanks} tanque(s) lleno(s) de {tank} L
                {result.last_tank_liters > 0 ? ` + 1 parcial de ${result.last_tank_liters} L` : ""}.
              </Text>
            )}
          </Stack>
        )}
      </Stack>
    </Modal>
  );
}
