import {
  Alert,
  Card,
  Group,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  TextInput,
} from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useState } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useFieldFinanceReport } from "../field-finance/api";
import type { FieldPerformance } from "../field-finance/api";
import { FieldReceivablesPanel } from "../field-collections/FieldCollectionsPage";

import { DataTable, type Column } from "../../components/ui/DataTable";
import { PageHeader } from "../../components/ui/PageHeader";
import { formatCurrency, formatDate } from "../../utils/format";
import {
  useBelowFloorSalesReport,
  useFieldJobsReport,
  useLowStockReport,
  useProfitReport,
  useSalesReport,
  useServiceOrdersReport,
} from "./api";
import type {
  BelowFloorRow,
  DateRange,
  FieldJobsReport,
  ReportSegment,
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

function SalesPanel({ range, segment = "workshop" }: { range: DateRange; segment?: ReportSegment }) {
  const q = useSalesReport(range, segment);
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
          <Text fw={600}>{segment === "field" ? "Facturación de campo por mes" : "Ventas de taller y repuestos por mes"}</Text>
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

function BelowFloorPanel({ range }: { range: DateRange }) {
  const q = useBelowFloorSalesReport(range);
  const belowFloorColumns: Column<BelowFloorRow>[] = [
    { header: "Documento", render: (r) => r.document },
    { header: "Fecha", render: (r) => formatDate(r.date) },
    { header: "Producto", render: (r) => `${r.product_sku} — ${r.product_name}` },
    { header: "Cant.", align: "right", render: (r) => r.quantity },
    {
      header: "Precio vendido",
      align: "right",
      render: (r) => (
        <Text c="red" fw={600} component="span">
          {formatCurrency(r.unit_price)}
        </Text>
      ),
    },
    { header: "Piso", align: "right", render: (r) => formatCurrency(r.price_floor) },
    {
      header: "Faltante bajo el piso",
      align: "right",
      // El backend devuelve difference/difference_percentage en positivo (cuánto
      // le falta al precio vendido para llegar al piso); se antepone el signo acá
      // para que quede claro que es un faltante, no una diferencia cualquiera.
      render: (r) => `-${formatCurrency(r.difference)} (-${r.difference_percentage}%)`,
    },
    { header: "Creado por", render: (r) => r.created_by ?? "—" },
  ];
  return (
    <Guard query={q}>
      {(d) => (
        <Stack>
          <Text fw={600}>Ventas facturadas bajo el piso</Text>
          <DataTable
            columns={belowFloorColumns}
            rows={d.items}
            rowKey={(r) => `${r.document_type}-${r.document}-${r.product_id}`}
            emptyText="Sin ventas bajo el piso en el rango."
          />
        </Stack>
      )}
    </Guard>
  );
}

function FieldJobsPanel({ range }: { range: DateRange }) {
  const query = useFieldJobsReport(range);
  const columns: Column<FieldJobsReport["by_type"][number]>[] = [
    { header: "Actividad", render: (r) => r.job_type === "spreading" ? "Aplicación de sólidos" : "Pulverización" },
    { header: "Trabajos realizados", align: "right", render: (r) => r.count },
    { header: "Hectáreas reales", align: "right", render: (r) => r.hectares },
    { header: "Quintales aplicados", align: "right", render: (r) => r.quintals },
  ];
  return (
    <Guard query={query}>
      {(data) => (
        <Stack>
          <SimpleGrid cols={{ base: 1, sm: 4 }}>
            {[
              ["Programados en el período", data.scheduled_count],
              ["Realizados en el período", data.completed_count],
              ["Hectáreas reales", data.actual_hectares],
              ["Quintales aplicados", data.applied_quintals],
            ].map(([label, value]) => (
              <Card withBorder radius="md" key={String(label)}>
                <Text c="dimmed" size="xs" tt="uppercase" fw={600}>{label}</Text>
                <Text fz={26} fw={700}>{value}</Text>
              </Card>
            ))}
          </SimpleGrid>
          <Text c="dimmed" size="sm">Los trabajos e ingresos operativos usan la fecha de cierre y las cantidades reales. Los cobros se registran por la fecha del dinero recibido.</Text>
          <DataTable columns={columns} rows={data.by_type} rowKey={(r) => r.job_type} emptyText="Sin trabajos realizados en el rango." />
        </Stack>
      )}
    </Guard>
  );
}

function FieldCostsPanel({ range }: { range: DateRange }) {
  const query = useFieldFinanceReport(range);
  return <Guard query={query}>{(d) => <Stack>
    {!!d.unpriced_jobs.length && <Alert color="yellow">Hay {d.unpriced_jobs.length} trabajos sin costo de piloto registrado. El resultado está incompleto; configura las tarifas en Gastos de campo.</Alert>}
    {!!d.unlinked_invoice_count && <Alert color="yellow">Hay {d.unlinked_invoice_count} facturas antiguas de campo sin trabajo vinculado. Se conservan en los totales, pero no forman parte de los resultados por piloto.</Alert>}
    <SimpleGrid cols={{ base: 1, sm: 3 }}>
      {[
        ["Ingresos por servicios realizados", d.revenue], ["Costo de pilotos", d.pilot_cost], ["Costo de asistentes", d.assistant_cost],
        ["Gastos generales", d.general_cost], ["Costos totales", d.total_cost], ["Resultado operativo", d.operating_result],
        ["Pagado en el período", d.paid_in_period], ["Cobrado en el período", d.collected_in_period],
        ["Flujo neto de caja del período", d.cash_flow_in_period],
        ["Costos del período pendientes de pago", d.pending_cost], ["Servicios del período pendientes de cobro", d.receivable],
      ].map(([label, amount]) => <Card withBorder key={String(label)}><Text c="dimmed" size="sm">{label}</Text><Text fz={24} fw={700}>{formatCurrency(amount)}</Text></Card>)}
    </SimpleGrid>
    <Text size="sm" c="dimmed">Los costos corresponden a la fecha del trabajo, jornada o gasto. Los cobros y pagos se muestran por su fecha real. El flujo neto es cobrado menos pagado; no incluye saldo inicial de caja.</Text>
    <Text component={Link} to="/field-finance">Administrar gastos y liquidaciones de campo</Text>
  </Stack>}</Guard>;
}

function FieldPerformancePanel({ range }: { range: DateRange }) {
  const query = useFieldFinanceReport(range);
  const columns = (label: string): Column<FieldPerformance>[] => [
    { header: label, render: (r) => r.name || String(r.id || "Sin asignar") },
    { header: "Trabajos", render: (r) => r.count }, { header: "Ha reales", render: (r) => r.hectares },
    { header: "Quintales", render: (r) => r.quintals }, { header: "Importe servicios", render: (r) => formatCurrency(r.revenue) },
    { header: "Cobrado", render: (r) => formatCurrency(r.collected) }, { header: "Saldo", render: (r) => formatCurrency(r.balance_due) },
    { header: "Costo piloto", render: (r) => formatCurrency(r.pilot_cost) },
    { header: "Margen antes de asistentes y gastos generales", render: (r) => <>{formatCurrency(r.margin_before_general_costs)}{r.unpriced_count > 0 && <Text size="xs" c="orange">Falta costo en {r.unpriced_count} trabajos</Text>}</> },
  ];
  return <Guard query={query}>{(d) => <Stack>
    <Text size="sm" c="dimmed">Los gastos generales y las jornadas de asistentes se descuentan en el resultado del área, sin distribuirlos entre clientes o pilotos. Los cobros y saldos de estas tablas corresponden a los trabajos realizados en el período.</Text>
    <Text fw={600}>Resultados por cliente</Text><DataTable columns={columns("Cliente")} rows={d.by_customer || []} rowKey={(r) => String(r.id)} emptyText="Sin trabajos realizados en el rango." />
    <Text fw={600}>Resultados por piloto</Text><DataTable columns={columns("Piloto")} rows={d.by_pilot || []} rowKey={(r) => String(r.id)} emptyText="Sin trabajos realizados en el rango." />
    <Text fw={600}>Resumen mensual de operaciones</Text><DataTable columns={columns("Mes")} rows={d.by_month || []} rowKey={(r) => String(r.id)} emptyText="Sin trabajos realizados en el rango." />
  </Stack>}</Guard>;
}

export function ReportsPage() {
  const [segment, setSegment] = useState<ReportSegment>("workshop");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const range: DateRange = { from, to };

  return (
    <Stack>
      <PageHeader title="Reportes" />
      <SegmentedControl
        aria-label="Área del reporte"
        value={segment}
        onChange={(value) => setSegment(value as ReportSegment)}
        data={[
          { value: "workshop", label: "Taller y repuestos" },
          { value: "field", label: "Trabajos de campo" },
        ]}
      />
      <Text c="dimmed" size="sm">
        {segment === "workshop"
          ? "Órdenes de servicio y ventas de repuestos. Los trabajos de campo se consultan por separado."
          : "Actividad y facturación exclusiva de los trabajos de campo."}
      </Text>
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
      {segment === "field" ? (
        <Tabs defaultValue="activity" keepMounted={false}>
          <Tabs.List>
            <Tabs.Tab value="activity">Actividad de campo</Tabs.Tab>
            <Tabs.Tab value="billing">Cobros y saldos</Tabs.Tab>
            <Tabs.Tab value="costs">Costos y resultado</Tabs.Tab>
            <Tabs.Tab value="performance">Clientes y pilotos</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="activity" pt="md"><FieldJobsPanel range={range} /></Tabs.Panel>
          <Tabs.Panel value="billing" pt="md"><FieldReceivablesPanel range={range} /></Tabs.Panel>
          <Tabs.Panel value="costs" pt="md"><FieldCostsPanel range={range} /></Tabs.Panel>
          <Tabs.Panel value="performance" pt="md"><FieldPerformancePanel range={range} /></Tabs.Panel>
        </Tabs>
      ) : (
      <Tabs defaultValue="low-stock" key="workshop">
        <Tabs.List>
          <Tabs.Tab value="low-stock">Bajo stock</Tabs.Tab>
          <Tabs.Tab value="service-orders">Órdenes de servicio</Tabs.Tab>
          <Tabs.Tab value="sales">Ventas</Tabs.Tab>
          <Tabs.Tab value="profit">Ganancia</Tabs.Tab>
          <Tabs.Tab value="below-floor">Ventas bajo el piso</Tabs.Tab>
        </Tabs.List>
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
        <Tabs.Panel value="below-floor">
          <BelowFloorPanel range={range} />
        </Tabs.Panel>
      </Tabs>
      )}
    </Stack>
  );
}
