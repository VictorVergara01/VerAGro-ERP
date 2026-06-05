import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { colors } from "../theme";
import { DashboardScreen } from "../features/dashboard/DashboardScreen";
import { MyOrdersScreen } from "../features/orders/MyOrdersScreen";
import { OrderDetailScreen } from "../features/orders/OrderDetailScreen";
import { ChecklistScreen } from "../features/checklists/ChecklistScreen";
import { PhotosScreen } from "../features/orders/PhotosScreen";
import { InventorySearchScreen } from "../features/inventory/InventorySearchScreen";
import { MenuScreen } from "../features/menu/MenuScreen";
import type {
  DashboardStackParamList,
  InventoryStackParamList,
  MoreStackParamList,
  OrdersStackParamList,
  RootTabParamList,
} from "./types";

const stackOptions = {
  headerStyle: { backgroundColor: colors.headerBg },
  headerTintColor: colors.text,
  headerTitleStyle: { fontWeight: "700" as const },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.bg },
};

const DashboardStack = createNativeStackNavigator<DashboardStackParamList>();
function DashboardNavigator() {
  return (
    <DashboardStack.Navigator screenOptions={stackOptions}>
      <DashboardStack.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ title: "Inicio" }}
      />
    </DashboardStack.Navigator>
  );
}

const OrdersStack = createNativeStackNavigator<OrdersStackParamList>();
function OrdersNavigator() {
  return (
    <OrdersStack.Navigator screenOptions={stackOptions}>
      <OrdersStack.Screen
        name="OrdersList"
        component={MyOrdersScreen}
        options={{ title: "Órdenes de servicio" }}
      />
      <OrdersStack.Screen
        name="OrderDetail"
        component={OrderDetailScreen}
        options={({ route }) => ({ title: route.params.title })}
      />
      <OrdersStack.Screen
        name="OrderChecklist"
        component={ChecklistScreen}
        options={{ title: "Checklist" }}
      />
      <OrdersStack.Screen
        name="OrderPhotos"
        component={PhotosScreen}
        options={{ title: "Fotos" }}
      />
    </OrdersStack.Navigator>
  );
}

const InventoryStack = createNativeStackNavigator<InventoryStackParamList>();
function InventoryNavigator() {
  return (
    <InventoryStack.Navigator screenOptions={stackOptions}>
      <InventoryStack.Screen
        name="InventoryList"
        component={InventorySearchScreen}
        options={{ title: "Inventario" }}
      />
    </InventoryStack.Navigator>
  );
}

const MoreStack = createNativeStackNavigator<MoreStackParamList>();
function MoreNavigator() {
  return (
    <MoreStack.Navigator screenOptions={stackOptions}>
      <MoreStack.Screen name="Menu" component={MenuScreen} options={{ title: "Más" }} />
    </MoreStack.Navigator>
  );
}

const Tab = createBottomTabNavigator<RootTabParamList>();

export function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.dimmed,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          height: 60,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tab.Screen
        name="InicioTab"
        component={DashboardNavigator}
        options={{
          title: "Inicio",
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="OrdersTab"
        component={OrdersNavigator}
        options={{
          title: "Órdenes",
          tabBarIcon: ({ color, size }) => <Ionicons name="construct" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="InventoryTab"
        component={InventoryNavigator}
        options={{
          title: "Inventario",
          tabBarIcon: ({ color, size }) => <Ionicons name="cube" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="MoreTab"
        component={MoreNavigator}
        options={{
          title: "Más",
          tabBarIcon: ({ color, size }) => <Ionicons name="grid" size={size} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}
