import {
  Alert,
  Card,
  Group,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  TextInput,
} from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useState } from "react";
import type { UseQueryResult } from "@tanstack/react-query";

import { DataTable, type Column } from "../../components/ui/DataTable";
import { PageHeader } from "../../components/ui/PageHeader";
import { formatCurrency } from "../../utils/format";
import {
  useLowStockReport,
  useProfitReport,
  useSalesReport,
  useServiceOrdersReport,
} from "./api";
import type {
  DateRange,
  LowStockReport,
  ProfitReport,
  SalesReport,
  ServiceOrdersReport,
} from "./types";

function Guard<T>({
  query,
  children,
}: {
  query: UseQueryResult<T>;
  children: (data: T) => React.ReactNode;
}) {
  if (query.isLoading) return <Text c="dimmed">Cargando…</Text>;
  if (query.error) {
    const forbidden = (query.error as Error).message === "forbidden";
    return (
      <Alert
        color={forbidden ? "yellow" : "red"}
        icon={<IconAlertTriangle size={18} />}
        title={forbidden ? "Sin acceso" : "Error"}
      >
        {forbidden
          ? "Tu rol no tiene acceso a este reporte financiero (solo admin y ventas)."
          : "No se pudo cargar el reporte."}
      </Alert>
    );
  }
  if (!query.data) return null;
  return <>{children(query.data)}</>;
}

function LowStockPanel() {
  const q = useLowStockReport();
  const columns: Column<LowStockReport["low_stock"][number]>[] = [
    { header: "SKU", render: (p) => p.sku },
    { header: "Producto", render: (p) => p.name },
    { header: "Stock", align: "right", render: (p) => p.stock_quantity },
    { header: "Disponible", align: "right", render: (p) => p.available_quantity },
    { header: "Mínimo", align: "right", render: (p) => p.minimum_stock },
  ];
  return (
    <Guard query={q}>
      {(d) => (
        <Stack>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <Card withBorder radius="md">
              <Text c="dimmed" size="xs" tt="uppercase" fw={600}>
                Productos activos
              </Text>
              <Text fz={26} fw={700}>
                {d.summary.total_products}
              </Text>
            </Card>
            <Card withBorder radius="md">
              <Text c="dimmed" size="xs" tt="uppercase" fw={600}>
                Valor del inventario
              </Text>
              <Text fz={26} fw={700}>
                {formatCurrency(d.summary.total_stock_value)}
              </Text>
            </Card>
          </SimpleGrid>
          <Text fw={600}>Piezas bajo stock mínimo</Text>
          <DataTable
            columns={columns}
            rows={d.low_stock}
            rowKey={(p) => p.id}
            emptyText="No hay piezas bajo el mínimo."
          />
        </Stack>
      )}
    </Guard>
  );
}

function ServiceOrdersPanel({ range }: { range: DateRange }) {
  const q = useServiceOrdersReport(range);
  const techColumns: Column<ServiceOrdersReport["finished_by_technician"][number]>[] = [
    { header: "Técnico", render: (t) => t.technician__full_name ?? "Sin asignar" },
    { header: "Finalizadas", align: "right", render: (t) => t.count },
  ];
  const partColumns: Column<ServiceOrdersReport["most_used_parts"][number]>[] = [
    { header: "SKU", render: (p) => p.product__sku },
    { header: "Producto", render: (p) => p.product__name },
    { header: "Cantidad", align: "right", render: (p) => p.total_quantity },
  ];
  return (
    <Guard query={q}>
      {(d) => (
        <Stack>
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <Card withBorder radius="md">
              <Text c="dimmed" size="xs" tt="uppercase" fw={600}>
                Pendientes
              </Text>
              <Text fz={26} fw={700}>
                {d.pending}
              </Text>
            </Card>
            <Card withBorder radius="md">
              <Text c="dimmed" size="xs" tt="uppercase" fw={600}>
                Esperando piezas
              </Text>
              <Text fz={26} fw={700}>
                {d.waiting_parts}
              </Text>
            </Card>
            <Card withBorder radius="md">
              <Text c="dimmed" size="xs" tt="uppercase" fw={600}>
                Estados
              </Text>
              <Text size="sm">
                {Object.entries(d.by_status)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(" · ") || "—"}
              </Text>
            </Card>
          </SimpleGrid>
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            <div>
              <Text fw={600} mb="xs">
                Finalizadas por técnico
              </Text>
              <DataTable
                columns={techColumns}
                rows={d.finished_by_technician}
                rowKey={(t) => String(t.technician)}
                emptyText="Sin datos."
              />
            </div>
            <div>
              <Text fw={600} mb="xs">
                Piezas más usadas
              </Text>
              <DataTable
                columns={partColumns}
                rows={d.most_used_parts}
                rowKey={(p) => p.product}
                emptyText="Sin datos."
              />
            </div>
          </SimpleGrid>
        </Stack>
      )}
    </Guard>
  );
}

function SalesPanel({ range }: { range: DateRange }) {
  const q = useSalesReport(range);
  const monthColumns: Column<SalesReport["sales_by_month"][number]>[] = [
    { header: "Mes", render: (m) => m.month },
    { header: "Facturas", align: "right", render: (m) => m.count },
    { header: "Total", align: "right", render: (m) => formatCurrency(m.total) },
  ];
  const pendingColumns: Column<SalesReport["pending_invoices"][number]>[] = [
    { header: "N.º", render: (i) => i.invoice_number },
    { header: "Cliente", render: (i) => i.customer__name },
    { header: "Total", align: "right", render: (i) => formatCurrency(i.total) },
    { header: "Saldo", align: "right", render: (i) => formatCurrency(i.balance_due) },
  ];
  return (
    <Guard query={q}>
      {(d) => (
        <Stack>
          <Text fw={600}>Ventas por mes</Text>
          <DataTable
            columns={monthColumns}
            rows={d.sales_by_month}
            rowKey={(m) => m.month}
            emptyText="Sin ventas en el rango."
          />
          <Text fw={600}>Facturas pendientes de pago</Text>
          <DataTable
            columns={pendingColumns}
            rows={d.pending_invoices}
            rowKey={(i) => i.invoice_number}
            emptyText="Sin facturas pendientes."
          />
        </Stack>
      )}
    </Guard>
  );
}

function ProfitPanel({ range }: { range: DateRange }) {
  const q = useProfitReport(range);
  const invColumns: Column<ProfitReport["by_invoice"][number]>[] = [
    { header: "Factura", render: (i) => i.invoice_number },
    { header: "Ingreso", align: "right", render: (i) => formatCurrency(i.revenue) },
    { header: "Costo", align: "right", render: (i) => formatCurrency(i.cost) },
    { header: "Ganancia", align: "right", render: (i) => formatCurrency(i.margin) },
  ];
  const partColumns: Column<ProfitReport["by_part"][number]>[] = [
    { header: "SKU", render: (p) => p.product__sku },
    { header: "Producto", render: (p) => p.product__name },
    { header: "Cant.", align: "right", render: (p) => p.total_quantity },
    { header: "Ganancia", align: "right", render: (p) => formatCurrency(p.total_margin) },
  ];
  return (
    <Guard query={q}>
      {(d) => (
        <Stack>
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <Card withBorder radius="md">
              <Text c="dimmed" size="xs" tt="uppercase" fw={600}>
                Ingresos
              </Text>
              <Text fz={24} fw={700}>
                {formatCurrency(d.totals.revenue)}
              </Text>
            </Card>
            <Card withBorder radius="md">
              <Text c="dimmed" size="xs" tt="uppercase" fw={600}>
                Costo
              </Text>
              <Text fz={24} fw={700}>
                {formatCurrency(d.totals.cost)}
              </Text>
            </Card>
            <Card withBorder radius="md">
              <Text c="dimmed" size="xs" tt="uppercase" fw={600}>
                Ganancia
              </Text>
              <Text fz={24} fw={700} c="green">
                {formatCurrency(d.totals.margin)}
              </Text>
            </Card>
          </SimpleGrid>
          <Text fw={600}>Ganancia por factura</Text>
          <DataTable
            columns={invColumns}
            rows={d.by_invoice}
            rowKey={(i) => i.invoice_number}
            emptyText="Sin datos."
          />
          <Text fw={600}>Ganancia por pieza</Text>
          <DataTable
            columns={partColumns}
            rows={d.by_part}
            rowKey={(p) => p.product__sku}
            emptyText="Sin datos."
          />
        </Stack>
      )}
    </Guard>
  );
}

export function ReportsPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const range: DateRange = { from, to };

  return (
    <Stack>
      <PageHeader title="Reportes" />
      <Tabs defaultValue="low-stock">
        <Tabs.List>
          <Tabs.Tab value="low-stock">Bajo stock</Tabs.Tab>
          <Tabs.Tab value="service-orders">Servicios</Tabs.Tab>
          <Tabs.Tab value="sales">Ventas</Tabs.Tab>
          <Tabs.Tab value="profit">Ganancia</Tabs.Tab>
        </Tabs.List>

        <Group my="md">
          <TextInput
            label="Desde"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.currentTarget.value)}
          />
          <TextInput
            label="Hasta"
            type="date"
            value={to}
            onChange={(e) => setTo(e.currentTarget.value)}
          />
        </Group>

        <Tabs.Panel value="low-stock">
          <LowStockPanel />
        </Tabs.Panel>
        <Tabs.Panel value="service-orders">
          <ServiceOrdersPanel range={range} />
        </Tabs.Panel>
        <Tabs.Panel value="sales">
          <SalesPanel range={range} />
        </Tabs.Panel>
        <Tabs.Panel value="profit">
          <ProfitPanel range={range} />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
