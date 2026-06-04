import { Card, Group, Text, ThemeIcon } from "@mantine/core";
import type { ReactNode } from "react";

export function StatCard({
  label,
  value,
  icon,
  color = "green",
  hint,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  color?: string;
  hint?: string;
}) {
  return (
    <Card withBorder radius="md" padding="lg">
      <Group justify="space-between" align="flex-start">
        <div>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            {label}
          </Text>
          <Text fz={28} fw={700} mt={4}>
            {value}
          </Text>
          {hint && (
            <Text size="xs" c="dimmed" mt={2}>
              {hint}
            </Text>
          )}
        </div>
        <ThemeIcon color={color} variant="light" size={42} radius="md">
          {icon}
        </ThemeIcon>
      </Group>
    </Card>
  );
}
