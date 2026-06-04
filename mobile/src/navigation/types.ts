import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";

export type AppStackParamList = {
  Login: undefined;
  MyOrders: undefined;
  OrderDetail: { id: number; title: string };
  OrderChecklist: { id: number };
  InventorySearch: undefined;
};

export type AppNav = NativeStackNavigationProp<AppStackParamList>;
export type OrderDetailRoute = RouteProp<AppStackParamList, "OrderDetail">;
export type OrderChecklistRoute = RouteProp<AppStackParamList, "OrderChecklist">;
