import { ActivityIndicator, View } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { useAuth } from "../features/auth/useAuth";
import { LoginScreen } from "../features/auth/LoginScreen";
import { MainTabs } from "./MainTabs";
import type { AuthStackParamList } from "./types";
import { useTheme } from "../theme";

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function RootNavigator() {
  const { status } = useAuth();
  const { colors } = useTheme();

  if (status === "loading") {
    return (
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (status !== "authenticated") {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
      </Stack.Navigator>
    );
  }

  return <MainTabs />;
}
