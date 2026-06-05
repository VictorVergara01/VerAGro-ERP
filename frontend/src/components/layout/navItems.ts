import {
  IconBox,
  IconDeviceDesktop,
  IconFileInvoice,
  IconHome,
  IconReceipt,
  IconReportAnalytics,
  IconSettings,
  IconShoppingCart,
  IconTool,
  IconTruck,
  IconUsers,
} from "@tabler/icons-react";

export interface NavItem {
  label: string;
  to: string;
  icon: typeof IconHome;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Menú",
    items: [
      { label: "Dashboard", to: "/", icon: IconHome },
      { label: "Órdenes de servicio", to: "/service-orders", icon: IconTool },
      { label: "Clientes", to: "/customers", icon: IconUsers },
      { label: "Equipos", to: "/equipment", icon: IconDeviceDesktop },
      { label: "Inventario", to: "/inventory", icon: IconBox },
      { label: "Proveedores", to: "/suppliers", icon: IconTruck },
      { label: "Compras", to: "/purchasing", icon: IconShoppingCart },
    ],
  },
  {
    title: "Facturación",
    items: [
      { label: "Cotizaciones", to: "/quotes", icon: IconFileInvoice },
      { label: "Facturas", to: "/invoices", icon: IconReceipt },
    ],
  },
  {
    title: "General",
    items: [
      { label: "Reportes", to: "/reports", icon: IconReportAnalytics },
      { label: "Configuración", to: "/settings", icon: IconSettings },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
