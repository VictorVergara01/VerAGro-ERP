import {
  Alert,
  Card,
  Group,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
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
import { formatCurrency } from "../../utils/format";
import { StatCard } from "./StatCard";
import { OPEN_STATUSES, sumStatuses, useDashboard } from "./useDashboard";

// El dashboard financiero (reportes) solo lo pueden ver admin y ventas.
const FINANCIAL_ROLES = ["admin", "sales"];

export function DashboardPage() {
  const { user } = useAuth();
  // Roles operativos (técnico, inventario, solo-lectura) no acceden al panel
  // financiero: en vez del 403 ven un panel de accesos rápidos a su trabajo.
  if (user && !FINANCIAL_ROLES.includes(user.role)) {
    return <OperationalDashboard />;
  }
  return <FinancialDashboard />;
}

function FinancialDashboard() {
  const { data, isLoading, error } = useDashboard();

  if (isLoading) {
    return (
      <Stack>
        <Title order={2}>Dashboard</Title>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} height={120} radius="md" />
          ))}
        </SimpleGrid>
      </Stack>
    );
  }

  if (error) {
    const forbidden = (error as Error).message === "forbidden";
    return (
      <Stack>
        <Title order={2}>Dashboard</Title>
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
  const finishedThisMonth =
    data.service_orders_by_status["finished"] ?? 0;

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Dashboard</Title>
      </Group>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
        <StatCard
          label="Órdenes abiertas"
          value={openOrders}
          icon={<IconTool size={24} />}
          color="blue"
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
          label="Piezas bajo stock"
          value={data.inventory.low_stock_count}
          icon={<IconBox size={24} />}
          color="red"
        />
        <StatCard
          label="Ventas del mes"
          value={formatCurrency(data.invoices.sales_this_month)}
          icon={<IconCash size={24} />}
          color="green"
        />
        <StatCard
          label="Servicios terminados"
          value={finishedThisMonth}
          icon={<IconCircleCheck size={24} />}
          color="teal"
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
    color: "blue",
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
    <Stack>
      <Title order={2}>Inicio</Title>
      <Text c="dimmed">Accesos rápidos a tu trabajo del día.</Text>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        {QUICK_LINKS.map((link) => {
          const Icon = link.icon;
          return (
            <Card
              key={link.to}
              component={Link}
              to={link.to}
              withBorder
              radius="md"
              padding="lg"
            >
              <Group>
                <ThemeIcon color={link.color} variant="light" size={44} radius="md">
                  <Icon size={24} />
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
