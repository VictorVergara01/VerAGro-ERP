import { NavLink as MantineNavLink, Stack, Text } from "@mantine/core";
import {
  IconBox,
  IconClipboardList,
  IconFileInvoice,
  IconHome,
  IconReceipt,
  IconReportAnalytics,
  IconSettings,
  IconShoppingCart,
  IconTool,
  IconTruck,
  IconUsers,
  IconDeviceDesktop,
} from "@tabler/icons-react";
import { NavLink } from "react-router-dom";

interface NavItem {
  label: string;
  to: string;
  icon: typeof IconHome;
  ready?: boolean;
}

const ITEMS: NavItem[] = [
  { label: "Dashboard", to: "/", icon: IconHome, ready: true },
  { label: "Clientes", to: "/customers", icon: IconUsers, ready: true },
  { label: "Equipos", to: "/equipment", icon: IconDeviceDesktop, ready: true },
  { label: "Inventario", to: "/inventory", icon: IconBox, ready: true },
  { label: "Proveedores", to: "/suppliers", icon: IconTruck, ready: true },
  { label: "Compras", to: "/purchasing", icon: IconShoppingCart, ready: true },
  { label: "Órdenes de servicio", to: "/service-orders", icon: IconTool, ready: true },
  { label: "Checklists", to: "/checklists", icon: IconClipboardList },
  { label: "Cotizaciones", to: "/quotes", icon: IconFileInvoice, ready: true },
  { label: "Facturas", to: "/invoices", icon: IconReceipt, ready: true },
  { label: "Reportes", to: "/reports", icon: IconReportAnalytics },
  { label: "Configuración", to: "/settings", icon: IconSettings },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Stack gap={4}>
      {ITEMS.map((item) => {
        const Icon = item.icon;
        if (!item.ready) {
          return (
            <MantineNavLink
              key={item.to}
              label={item.label}
              description="Próximamente"
              leftSection={<Icon size={18} />}
              disabled
            />
          );
        }
        return (
          <MantineNavLink
            key={item.to}
            component={NavLink}
            to={item.to}
            end
            label={item.label}
            leftSection={<Icon size={18} />}
            onClick={onNavigate}
          />
        );
      })}
      <Text c="dimmed" size="xs" mt="md" px="sm">
        Veragro ERP · v0.1
      </Text>
    </Stack>
  );
}
