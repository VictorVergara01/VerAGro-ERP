import { Group, Text, Tree, useTree, type TreeNodeData } from "@mantine/core";
import { IconChevronRight, IconComponents, IconPuzzle } from "@tabler/icons-react";
import { useMemo } from "react";

import type { ComponentTreeNode } from "../despieceTypes";

function toTreeData(nodes: ComponentTreeNode[]): TreeNodeData[] {
  return nodes.map((n) => ({
    value: String(n.id),
    label: n.name,
    children: n.children.length ? toTreeData(n.children) : undefined,
    nodeProps: { node: n },
  }));
}

export function EquipmentComponentTree({
  nodes,
  selectedId,
  onSelect,
}: {
  nodes: ComponentTreeNode[];
  selectedId: number | null;
  onSelect: (id: number, node: ComponentTreeNode) => void;
}) {
  const data = useMemo(() => toTreeData(nodes), [nodes]);
  const tree = useTree();

  return (
    <Tree
      data={data}
      tree={tree}
      levelOffset={22}
      renderNode={({ node, expanded, hasChildren, elementProps }) => {
        const original = (node as TreeNodeData & { nodeProps?: { node: ComponentTreeNode } })
          .nodeProps?.node as ComponentTreeNode;
        const isAssembly = original.component_type === "assembly";
        const isSelected = selectedId === original.id;
        return (
          <Group
            gap={6}
            wrap="nowrap"
            {...elementProps}
            onClick={(e) => {
              elementProps.onClick?.(e);
              onSelect(original.id, original);
            }}
            style={{
              ...elementProps.style,
              borderRadius: 6,
              padding: "3px 6px",
              cursor: "pointer",
              background: isSelected
                ? "var(--mantine-primary-color-light)"
                : undefined,
            }}
          >
            {hasChildren ? (
              <IconChevronRight
                size={14}
                style={{
                  transform: expanded ? "rotate(90deg)" : "none",
                  transition: "transform 120ms",
                  opacity: 0.6,
                }}
              />
            ) : (
              <span style={{ width: 14 }} />
            )}
            {isAssembly ? (
              <IconComponents size={16} style={{ opacity: 0.7 }} />
            ) : (
              <IconPuzzle size={16} style={{ opacity: 0.7 }} />
            )}
            <Text size="sm" fw={isSelected ? 600 : 400} ff="monospace">
              {original.code}
            </Text>
            <Text size="sm" fw={isSelected ? 600 : 400}>
              {original.name}
            </Text>
          </Group>
        );
      }}
    />
  );
}
