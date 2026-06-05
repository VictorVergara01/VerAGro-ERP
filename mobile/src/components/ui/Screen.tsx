import type { ReactNode } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";

import { colors, spacing } from "../../theme";

/** Contenedor base de pantalla: fondo gris y padding consistente.
 * `scroll` envuelve el contenido en un ScrollView (con pull-to-refresh opcional). */
export function Screen({
  children,
  scroll = false,
  refreshing,
  onRefresh,
  padded = true,
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  padded?: boolean;
  style?: ViewStyle;
}) {
  if (scroll) {
    return (
      <ScrollView
        style={styles.bg}
        contentContainerStyle={[padded && styles.padded, style]}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
    );
  }
  return <View style={[styles.bg, padded && styles.padded, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.bg },
  padded: { padding: spacing.lg, gap: spacing.md },
});
