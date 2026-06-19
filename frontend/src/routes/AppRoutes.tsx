import { Route, Routes } from "react-router-dom";

import { AppLayout } from "../components/layout/AppLayout";
import { LoginPage } from "../features/auth/LoginPage";
import { InvoiceDetailPage } from "../features/billing/InvoiceDetailPage";
import { InvoicesPage } from "../features/billing/InvoicesPage";
import { QuoteDetailPage } from "../features/billing/QuoteDetailPage";
import { QuotesPage } from "../features/billing/QuotesPage";
import { CustomerDetailPage } from "../features/customers/CustomerDetailPage";
import { CustomersPage } from "../features/customers/CustomersPage";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { EquipmentDetailPage } from "../features/equipment/EquipmentDetailPage";
import { EquipmentPage } from "../features/equipment/EquipmentPage";
import { InventoryPage } from "../features/inventory/InventoryPage";
import { ProductDetailPage } from "../features/inventory/ProductDetailPage";
import { PurchaseOrderDetailPage } from "../features/purchasing/PurchaseOrderDetailPage";
import { PurchasingPage } from "../features/purchasing/PurchasingPage";
import { ReportsPage } from "../features/reports/ReportsPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { FieldJobDetailPage } from "../features/field-jobs/FieldJobDetailPage";
import { FieldJobsPage } from "../features/field-jobs/FieldJobsPage";
import { ServiceOrderDetailPage } from "../features/service-orders/ServiceOrderDetailPage";
import { ServiceOrdersPage } from "../features/service-orders/ServiceOrdersPage";
import { SupplierDetailPage } from "../features/suppliers/SupplierDetailPage";
import { SuppliersPage } from "../features/suppliers/SuppliersPage";
import { ProtectedRoute } from "./ProtectedRoute";

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
