import { ActionIcon, Group, Title, Tooltip } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export function DetailHeader({
  backTo,
  backLabel = "Volver",
  title,
  badge,
  actions,
}: {
  backTo: string;
  backLabel?: string;
  title: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <Group justify="space-between" align="center" wrap="wrap" gap="sm" mb="xs">
      <Group gap="sm" wrap="nowrap">
        <Tooltip label={backLabel} withArrow>
          <ActionIcon
            component={Link}
            to={backTo}
            variant="default"
            size="lg"
            radius="md"
            aria-label={backLabel}
          >
            <IconArrowLeft size={18} />
          </ActionIcon>
        </Tooltip>
        <Title order={2} lineClamp={1}>
          {title}
        </Title>
        {badge}
      </Group>
      {actions && (
        <Group gap="sm" wrap="wrap">
          {actions}
        </Group>
      )}
    </Group>
  );
}
