import {
  Alert,
  Card,
  Grid,
  Group,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { BarChart, DonutChart } from "@mantine/charts";
import {
  IconAlertTriangle,
  IconBox,
  IconCash,
  IconCircleCheck,
  IconClockPause,
  IconDeviceDesktop,
  IconReceipt,
  IconTool,
  IconUsers,
} from "@tabler/icons-react";
import { Link } from "react-router-dom";

import { useAuth } from "../auth/useAuth";
import { FINANCIAL_ROLES } from "../auth/roles";
import { SO_STATUS_LABEL } from "../service-orders/types";
import { formatCurrency } from "../../utils/format";
import { StatCard } from "./StatCard";
import { OPEN_STATUSES, sumStatuses, useDashboard } from "./useDashboard";

export function DashboardPage() {
  const { user } = useAuth();
  if (user && !FINANCIAL_ROLES.includes(user.role)) {
    return <OperationalDashboard />;
  }
  return <FinancialDashboard />;
}

function PageTitle({ subtitle }: { subtitle: string }) {
  return (
    <div>
      <Title order={2}>Dashboard</Title>
      <Text c="dimmed" size="sm">
        {subtitle}
      </Text>
    </div>
  );
}

function FinancialDashboard() {
  const { data, isLoading, error } = useDashboard();

  if (isLoading) {
    return (
      <Stack>
        <PageTitle subtitle="Resumen de la operación." />
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={150} radius="lg" />
          ))}
        </SimpleGrid>
        <Skeleton height={320} radius="lg" />
      </Stack>
    );
  }

  if (error) {
    const forbidden = (error as Error).message === "forbidden";
    return (
      <Stack>
        <PageTitle subtitle="Resumen de la operación." />
        <Alert
          color={forbidden ? "yellow" : "red"}
          icon={<IconAlertTriangle size={18} />}
          title={forbidden ? "Sin acceso" : "Error"}
        >
          {forbidden
            ? "Tu rol no tiene acceso al panel financiero. Contacta a un administrador."
            : "No se pudo cargar el dashboard. Intenta de nuevo."}
        </Alert>
      </Stack>
    );
  }

  if (!data) return null;

  const openOrders = sumStatuses(data.service_orders_by_status, OPEN_STATUSES);
  const waitingParts = data.service_orders_by_status["waiting_parts"] ?? 0;
  const finishedThisMonth = data.service_orders_by_status["finished"] ?? 0;

  const ordersByStatus = Object.entries(data.service_orders_by_status)
    .filter(([, n]) => n > 0)
    .map(([status, n]) => ({
      estado: SO_STATUS_LABEL[status] ?? status,
      Órdenes: n,
    }));

  const sales = Number(data.invoices.sales_this_month) || 0;
  const pending = Number(data.invoices.pending_amount) || 0;
  const billing = [
    { name: "Cobrado", value: sales, color: "green.6" },
    { name: "Pendiente", value: pending, color: "orange.5" },
  ].filter((d) => d.value > 0);

  return (
    <Stack gap="lg">
      <PageTitle subtitle="Resumen de la operación del mes." />

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
        <StatCard
          label="Órdenes abiertas"
          value={openOrders}
          icon={<IconTool size={24} />}
          highlight
        />
        <StatCard
          label="Esperando piezas"
          value={waitingParts}
          icon={<IconClockPause size={24} />}
          color="orange"
        />
        <StatCard
          label="Facturas pendientes"
          value={data.invoices.pending_count}
          hint={formatCurrency(data.invoices.pending_amount)}
          icon={<IconReceipt size={24} />}
          color="grape"
        />
        <StatCard
          label="Ventas del mes"
          value={formatCurrency(data.invoices.sales_this_month)}
          icon={<IconCash size={24} />}
          color="green"
        />
      </SimpleGrid>

      <Grid>
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <Card>
            <Text fw={600} mb="md">
              Órdenes por estado
            </Text>
            {ordersByStatus.length ? (
              <BarChart
                h={300}
                data={ordersByStatus}
                dataKey="estado"
                series={[{ name: "Órdenes", color: "green.6" }]}
                tickLine="y"
                gridAxis="y"
                barProps={{ radius: 6 }}
              />
            ) : (
              <Text c="dimmed" size="sm">
                Sin órdenes registradas.
              </Text>
            )}
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 4 }}>
          <Card h="100%">
            <Text fw={600} mb="md">
              Facturación del mes
            </Text>
            {billing.length ? (
              <Stack align="center" gap="xs">
                <DonutChart
                  data={billing}
                  h={200}
                  thickness={26}
                  chartLabel={formatCurrency(sales + pending)}
                  withTooltip
                />
                <Group gap="lg">
                  {billing.map((b) => (
                    <Group key={b.name} gap={6}>
                      <ThemeIcon size={12} radius="xl" color={b.color}>
                        <span />
                      </ThemeIcon>
                      <Text size="sm" c="dimmed">
                        {b.name}
                      </Text>
                    </Group>
                  ))}
                </Group>
              </Stack>
            ) : (
              <Text c="dimmed" size="sm">
                Sin facturación este mes.
              </Text>
            )}
          </Card>
        </Grid.Col>
      </Grid>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
        <StatCard
          label="Piezas bajo stock"
          value={data.inventory.low_stock_count}
          icon={<IconBox size={24} />}
          color="red"
        />
        <StatCard
          label="Servicios terminados"
          value={finishedThisMonth}
          icon={<IconCircleCheck size={24} />}
          color="teal"
        />
        <StatCard
          label="Productos en catálogo"
          value={data.inventory.total_products}
          icon={<IconBox size={24} />}
          color="blue"
        />
        <StatCard
          label="Valor de inventario"
          value={formatCurrency(data.inventory.total_stock_value)}
          icon={<IconCash size={24} />}
          color="green"
        />
      </SimpleGrid>
    </Stack>
  );
}

interface QuickLink {
  label: string;
  description: string;
  to: string;
  icon: typeof IconTool;
  color: string;
}

const QUICK_LINKS: QuickLink[] = [
  {
    label: "Órdenes de servicio",
    description: "Diagnostica, reserva piezas, finaliza y entrega.",
    to: "/service-orders",
    icon: IconTool,
    color: "green",
  },
  {
    label: "Inventario",
    description: "Busca productos, revisa stock y ubicaciones.",
    to: "/inventory",
    icon: IconBox,
    color: "teal",
  },
  {
    label: "Equipos",
    description: "Consulta los equipos de cada cliente.",
    to: "/equipment",
    icon: IconDeviceDesktop,
    color: "grape",
  },
  {
    label: "Clientes",
    description: "Datos de contacto e historial.",
    to: "/customers",
    icon: IconUsers,
    color: "orange",
  },
];

function OperationalDashboard() {
  return (
    <Stack gap="lg">
      <PageTitle subtitle="Accesos rápidos a tu trabajo del día." />
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        {QUICK_LINKS.map((link) => {
          const Icon = link.icon;
          return (
            <Card key={link.to} component={Link} to={link.to} padding="lg">
              <Group>
                <ThemeIcon color={link.color} variant="light" size={48} radius="md">
                  <Icon size={26} />
                </ThemeIcon>
                <div>
                  <Text fw={600}>{link.label}</Text>
                  <Text size="sm" c="dimmed">
                    {link.description}
                  </Text>
                </div>
              </Group>
            </Card>
          );
        })}
      </SimpleGrid>
    </Stack>
  );
}
