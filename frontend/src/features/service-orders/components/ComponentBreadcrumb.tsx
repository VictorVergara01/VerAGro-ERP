import { Text } from "@mantine/core";

export function ComponentBreadcrumb({ path }: { path: string | null }) {
  if (!path) return null;
  return (
    <Text size="sm" c="dimmed" ff="monospace">
      {path}
    </Text>
  );
}
