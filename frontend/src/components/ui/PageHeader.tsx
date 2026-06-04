import { Group, Title } from "@mantine/core";
import type { ReactNode } from "react";

export function PageHeader({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <Group justify="space-between" mb="md">
      <Title order={2}>{title}</Title>
      {action}
    </Group>
  );
}
