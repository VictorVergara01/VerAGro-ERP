import type { ReactElement } from "react";
import { FlatList, RefreshControl } from "react-native";

import { spacing, useTheme } from "../../theme";
import { EmptyState, ErrorState, Loading } from "./index";

/** Lista estándar: maneja loading/error/empty/refresh y renderiza tarjetas. */
export function ListView<T>({
  items,
  loading,
  error,
  refetch,
  isRefetching,
  keyExtractor,
  renderItem,
  header,
  emptyText = "Sin resultados.",
  errorText = "No se pudo cargar.",
}: {
  items: T[];
  loading?: boolean;
  error?: unknown;
  refetch?: () => void;
  isRefetching?: boolean;
  keyExtractor: (item: T) => string;
  renderItem: (item: T) => ReactElement;
  header?: ReactElement;
  emptyText?: string;
  errorText?: string;
}) {
  const { colors } = useTheme();
  if (loading) return <Loading />;
  if (error) return <ErrorState text={errorText} />;
  return (
    <FlatList
      data={items}
      keyExtractor={keyExtractor}
      renderItem={({ item }) => renderItem(item)}
      ListHeaderComponent={header}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
      refreshControl={
        refetch ? (
          <RefreshControl
            refreshing={!!isRefetching}
            onRefresh={refetch}
            tintColor={colors.primary}
          />
        ) : undefined
      }
      ListEmptyComponent={<EmptyState text={emptyText} />}
    />
  );
}
