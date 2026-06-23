import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";

// --- Stacks por pestaña ---
export type DashboardStackParamList = {
  Dashboard: undefined;
};

export type OrdersStackParamList = {
  OrdersList: undefined;
  OrderDetail: { id: number; title: string };
  OrderChecklist: { id: number };
  OrderPhotos: { id: number };
};

export type InventoryStackParamList = {
  InventoryList: undefined;
};

export type FieldJobsStackParamList = {
  FieldJobsList: undefined;
  FieldJobDetail: { id: number; title: string };
  SprayCalculator: {
    prefill?: {
      hectares?: number;
      caldo_per_hectare?: number;
      tank_volume_liters?: number;
      products?: { name: string; dose_per_hectare: number; unit: string }[];
    };
  };
};

export type MoreStackParamList = {
  Menu: undefined;
  Profile: undefined;
  Customers: undefined;
  CustomerDetail: { id: number; title: string };
  Equipment: undefined;
  EquipmentDetail: { id: number; title: string };
  Suppliers: undefined;
  SupplierDetail: { id: number; title: string };
  Purchasing: undefined;
  PurchaseOrderDetail: { id: number; title: string };
  Quotes: undefined;
  QuoteDetail: { id: number; title: string };
  Invoices: undefined;
  InvoiceDetail: { id: number; title: string };
  Reports: undefined;
  Settings: undefined;
};

export type MoreNav = NativeStackNavigationProp<MoreStackParamList>;

export type AuthStackParamList = {
  Login: undefined;
};

export type RootTabParamList = {
  InicioTab: undefined;
  FieldJobsTab: undefined;
  OrdersTab: undefined;
  InventoryTab: undefined;
  MoreTab: undefined;
};

// --- Aliases usados por las pantallas existentes (Órdenes) ---
export type AppNav = NativeStackNavigationProp<OrdersStackParamList>;
export type OrderDetailRoute = RouteProp<OrdersStackParamList, "OrderDetail">;
export type OrderChecklistRoute = RouteProp<OrdersStackParamList, "OrderChecklist">;

export type FieldJobsNav = NativeStackNavigationProp<FieldJobsStackParamList>;
export type FieldJobDetailRoute = RouteProp<FieldJobsStackParamList, "FieldJobDetail">;
export type SprayCalculatorRoute = RouteProp<FieldJobsStackParamList, "SprayCalculator">;
