import { Group, Stack, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <Group justify="space-between" align="flex-end" mb="lg" gap="sm">
      <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
        <Title order={2}>{title}</Title>
        {subtitle && (
          <Text c="dimmed" size="sm">
            {subtitle}
          </Text>
        )}
      </Stack>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </Group>
  );
}
