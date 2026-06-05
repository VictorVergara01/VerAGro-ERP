import { Card, Group, Text, ThemeIcon } from "@mantine/core";
import { IconArrowUpRight } from "@tabler/icons-react";
import type { ReactNode } from "react";

export function StatCard({
  label,
  value,
  icon,
  color = "green",
  hint,
  highlight = false,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  color?: string;
  hint?: string;
  highlight?: boolean;
}) {
  return (
    <Card
      padding="lg"
      withBorder={!highlight}
      style={
        highlight
          ? {
              background:
                "linear-gradient(135deg, var(--mantine-color-green-7), var(--mantine-color-green-5))",
              color: "white",
            }
          : undefined
      }
    >
      <Group justify="space-between" align="flex-start" mb="md">
        <ThemeIcon
          size={44}
          radius="md"
          variant={highlight ? "white" : "light"}
          color={color}
        >
          {icon}
        </ThemeIcon>
        <ThemeIcon
          size={28}
          radius="xl"
          variant={highlight ? "white" : "light"}
          color={highlight ? "green" : "gray"}
        >
          <IconArrowUpRight size={16} />
        </ThemeIcon>
      </Group>
      <Text size="sm" fw={500} opacity={highlight ? 0.9 : 1} c={highlight ? "white" : "dimmed"}>
        {label}
      </Text>
      <Text fz={32} fw={700} lh={1.1} mt={4}>
        {value}
      </Text>
      {hint && (
        <Text size="xs" mt={6} opacity={highlight ? 0.9 : 1} c={highlight ? "white" : "dimmed"}>
          {hint}
        </Text>
      )}
    </Card>
  );
}
