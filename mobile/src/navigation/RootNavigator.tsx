import { ActivityIndicator, View } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { useAuth } from "../features/auth/useAuth";
import { LoginScreen } from "../features/auth/LoginScreen";
import { MyOrdersScreen } from "../features/orders/MyOrdersScreen";
import { OrderDetailScreen } from "../features/orders/OrderDetailScreen";
import { ChecklistScreen } from "../features/checklists/ChecklistScreen";
import { PhotosScreen } from "../features/orders/PhotosScreen";
import { InventorySearchScreen } from "../features/inventory/InventorySearchScreen";
import type { AppStackParamList } from "./types";
import { colors } from "../theme";

const Stack = createNativeStackNavigator<AppStackParamList>();

export function RootNavigator() {
  const { status } = useAuth();

  if (status === "loading") {
    return (
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: "#fff",
        headerTitleStyle: { fontWeight: "700" },
      }}
    >
      {status === "authenticated" ? (
        <>
          <Stack.Screen
            name="MyOrders"
            component={MyOrdersScreen}
            options={{ title: "Mis órdenes" }}
          />
          <Stack.Screen
            name="OrderDetail"
            component={OrderDetailScreen}
            options={({ route }) => ({ title: route.params.title })}
          />
          <Stack.Screen
            name="OrderChecklist"
            component={ChecklistScreen}
            options={{ title: "Checklist" }}
          />
          <Stack.Screen
            name="OrderPhotos"
            component={PhotosScreen}
            options={{ title: "Fotos" }}
          />
          <Stack.Screen
            name="InventorySearch"
            component={InventorySearchScreen}
            options={{ title: "Inventario" }}
          />
        </>
      ) : (
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: false }}
        />
      )}
    </Stack.Navigator>
  );
}
