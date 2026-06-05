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

export type MoreStackParamList = {
  Menu: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
};

export type RootTabParamList = {
  InicioTab: undefined;
  OrdersTab: undefined;
  InventoryTab: undefined;
  MoreTab: undefined;
};

// --- Aliases usados por las pantallas existentes (Órdenes) ---
export type AppNav = NativeStackNavigationProp<OrdersStackParamList>;
export type OrderDetailRoute = RouteProp<OrdersStackParamList, "OrderDetail">;
export type OrderChecklistRoute = RouteProp<OrdersStackParamList, "OrderChecklist">;
