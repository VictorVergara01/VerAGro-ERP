import { lazy } from "react";
import { Route, Routes } from "react-router-dom";

import { AppLayout } from "../components/layout/AppLayout";
import { LoginPage } from "../features/auth/LoginPage";
import { ProtectedRoute } from "./ProtectedRoute";

// Las páginas de cada módulo se cargan bajo demanda (code-splitting por ruta).
// Login y el shell (AppLayout/ProtectedRoute) se mantienen eager para que el
// arranque sea inmediato.
const DashboardPage = lazy(() =>
  import("../features/dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const CustomersPage = lazy(() =>
  import("../features/customers/CustomersPage").then((m) => ({ default: m.CustomersPage })),
);
const CustomerDetailPage = lazy(() =>
  import("../features/customers/CustomerDetailPage").then((m) => ({ default: m.CustomerDetailPage })),
);
const EquipmentPage = lazy(() =>
  import("../features/equipment/EquipmentPage").then((m) => ({ default: m.EquipmentPage })),
);
const EquipmentDetailPage = lazy(() =>
  import("../features/equipment/EquipmentDetailPage").then((m) => ({ default: m.EquipmentDetailPage })),
);
const InventoryPage = lazy(() =>
  import("../features/inventory/InventoryPage").then((m) => ({ default: m.InventoryPage })),
);
const ProductDetailPage = lazy(() =>
  import("../features/inventory/ProductDetailPage").then((m) => ({ default: m.ProductDetailPage })),
);
const SuppliersPage = lazy(() =>
  import("../features/suppliers/SuppliersPage").then((m) => ({ default: m.SuppliersPage })),
);
const SupplierDetailPage = lazy(() =>
  import("../features/suppliers/SupplierDetailPage").then((m) => ({ default: m.SupplierDetailPage })),
);
const PurchasingPage = lazy(() =>
  import("../features/purchasing/PurchasingPage").then((m) => ({ default: m.PurchasingPage })),
);
const PurchaseOrderDetailPage = lazy(() =>
  import("../features/purchasing/PurchaseOrderDetailPage").then((m) => ({ default: m.PurchaseOrderDetailPage })),
);
const ServiceOrdersPage = lazy(() =>
  import("../features/service-orders/ServiceOrdersPage").then((m) => ({ default: m.ServiceOrdersPage })),
);
const ServiceOrderDetailPage = lazy(() =>
  import("../features/service-orders/ServiceOrderDetailPage").then((m) => ({ default: m.ServiceOrderDetailPage })),
);
const FieldJobsPage = lazy(() =>
  import("../features/field-jobs/FieldJobsPage").then((m) => ({ default: m.FieldJobsPage })),
);
const FieldJobDetailPage = lazy(() =>
  import("../features/field-jobs/FieldJobDetailPage").then((m) => ({ default: m.FieldJobDetailPage })),
);
const QuotesPage = lazy(() =>
  import("../features/billing/QuotesPage").then((m) => ({ default: m.QuotesPage })),
);
const QuoteDetailPage = lazy(() =>
  import("../features/billing/QuoteDetailPage").then((m) => ({ default: m.QuoteDetailPage })),
);
const InvoicesPage = lazy(() =>
  import("../features/billing/InvoicesPage").then((m) => ({ default: m.InvoicesPage })),
);
const InvoiceDetailPage = lazy(() =>
  import("../features/billing/InvoiceDetailPage").then((m) => ({ default: m.InvoiceDetailPage })),
);
const ReportsPage = lazy(() =>
  import("../features/reports/ReportsPage").then((m) => ({ default: m.ReportsPage })),
);
const SettingsPage = lazy(() =>
  import("../features/settings/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/customers/:id" element={<CustomerDetailPage />} />
          <Route path="/equipment" element={<EquipmentPage />} />
          <Route path="/equipment/:id" element={<EquipmentDetailPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/inventory/:id" element={<ProductDetailPage />} />
          <Route path="/suppliers" element={<SuppliersPage />} />
          <Route path="/suppliers/:id" element={<SupplierDetailPage />} />
          <Route path="/purchasing" element={<PurchasingPage />} />
          <Route path="/purchasing/:id" element={<PurchaseOrderDetailPage />} />
          <Route path="/service-orders" element={<ServiceOrdersPage />} />
          <Route path="/service-orders/:id" element={<ServiceOrderDetailPage />} />
          <Route path="/field-jobs" element={<FieldJobsPage />} />
          <Route path="/field-jobs/:id" element={<FieldJobDetailPage />} />
          <Route path="/quotes" element={<QuotesPage />} />
          <Route path="/quotes/:id" element={<QuoteDetailPage />} />
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
