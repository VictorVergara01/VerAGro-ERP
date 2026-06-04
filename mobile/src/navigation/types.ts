import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";

export type AppStackParamList = {
  Login: undefined;
  MyOrders: undefined;
  OrderDetail: { id: number; title: string };
};

export type AppNav = NativeStackNavigationProp<AppStackParamList>;
export type OrderDetailRoute = RouteProp<AppStackParamList, "OrderDetail">;
