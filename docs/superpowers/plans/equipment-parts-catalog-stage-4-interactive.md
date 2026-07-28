# Catálogo técnico — Etapa 4: Orden interactiva (Despiece)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir una pestaña **Despiece** en el detalle de la orden de servicio: un árbol de componentes (Mantine Tree) + un diagrama SVG 2D del equipo, sincronizados en ambos sentidos, y un panel de piezas compatibles con el componente seleccionado que permite agregarlas a la orden guardando el componente. Responsive y accesible.

**Architecture:** Un orquestador `InteractivePartsTab` obtiene el árbol de la orden (`/component-tree/`) y, al seleccionar un componente, sus piezas compatibles (`/compatible-products/?component=`). El árbol y el diagrama comparten un `selectedComponentId` controlado; el diagrama mapea zonas por `code`/`diagram_key` y resalta la zona del componente seleccionado o de su ancestro. Agregar una pieza reutiliza `add-part` (Etapa 2) enviando `component`. Todo con Mantine 9; sin librerías nuevas.

**Tech Stack:** React 19, TypeScript, Mantine 9 (`Tree`/`useTree`), TanStack Query, SVG inline, Vitest + RTL.

## Global Constraints

- Frontend en Docker; tests `docker compose exec frontend npx vitest run <ruta>`; typecheck `npm run typecheck`; lint `npm run lint`; build `npm run build`. Frontend arriba: `docker compose up -d frontend`.
- Estilo Mantine existente. Sin librerías nuevas. Idioma español.
- Lint baseline con ~14 errores preexistentes ajenos: solo importan errores NUEVOS.
- Tests de página que monten estos componentes deben mockear sus hooks (lección de la Etapa 3: completar `vi.mock`).
- Rama `V3.0`. Commits en español, imperativo, footer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Endpoints (Etapa 2): `GET /api/service-orders/{id}/component-tree/` → árbol anidado `{id,code,name,component_type,diagram_key,position,sort_order,children[]}`; `GET /api/service-orders/{id}/compatible-products/?component=` → `{equipment_model:{id,name}, component:{id,name,path}, products:[{id,sku,name,stock_quantity,reserved_quantity,available_quantity,sale_price,location,is_primary}]}`; `POST /api/service-orders/{id}/add-part/` acepta `component`.
- La orden expone `equipment_catalog_model` (id|null): si es null, el equipo no tiene modelo técnico → estado de error claro.
- Spec: `docs/superpowers/specs/equipment-parts-catalog.md`.

## Design tokens (Etapa 4)

- **Color:** usar tokens del tema Mantine. Acento de selección = color primario del tema (`var(--mantine-primary-color-filled)`); hover = `var(--mantine-primary-color-light)`; trazo estructural del diagrama = `var(--mantine-color-dimmed)` / `currentColor` a baja opacidad; fondo del lienzo = `var(--mantine-color-body)`. Todo theme-aware (claro/oscuro) por usar variables Mantine.
- **Tipografía:** UI = Inter (tema). **Códigos de componente y SKU en monoespaciada** (`ff="monospace"` o `<Text ff="monospace">`) — registro de catálogo técnico.
- **Layout:** escritorio 3 columnas `Árbol (0.9fr) · Diagrama (1.4fr) · Piezas (1.1fr)` con `SimpleGrid`/`Grid`; en `base`/`sm` apiladas (árbol → diagrama → piezas). El diagrama es el centro visual.
- **Firma:** los dos SVG esquemáticos originales (vista superior T50, vista frontal D12500iE) con zonas seleccionables que se resaltan; selección bidireccional árbol↔diagrama.
- **Estados de stock (tarjeta de pieza):** disponible>0 → badge verde "Disponible"; disponible=0 → badge rojo "Sin existencia"; 0<disponible<cantidad pedida no aplica aquí (se muestra el número). Botón "Agregar a la orden" deshabilitado si la orden es terminal.
- **Movimiento:** mínimo — transición de `fill`/`opacity` 120ms en las zonas del diagrama al hover/selección; respetar `prefers-reduced-motion` (sin transición). Nada más.

---

### Task 1: Hooks y tipos del despiece de orden

**Files:**
- Create: `frontend/src/features/service-orders/despieceTypes.ts`
- Modify: `frontend/src/features/service-orders/api.ts`

**Interfaces:**
- Produces:
  - Tipos `ComponentTreeNode`, `CompatibleProduct`, `CompatibleProductsResponse`.
  - `useOrderComponentTree(orderId?: number)` → `ComponentTreeNode[]` (usa la query key `["order-component-tree", orderId]`; maneja el 400 "sin modelo técnico" devolviendo un error con mensaje).
  - `useCompatibleProducts(orderId?: number, componentId?: number)` → `CompatibleProductsResponse` (key `["order-compatible", orderId, componentId]`, `enabled` cuando ambos existen).
  - `useAddPart` ya existe (Etapa 1); su `AddPartInput` se extiende con `component?: number`.

- [ ] **Step 1: Crear los tipos**

Crear `frontend/src/features/service-orders/despieceTypes.ts`:

```typescript
export interface ComponentTreeNode {
  id: number;
  code: string;
  name: string;
  component_type: string;
  diagram_key: string;
  position: string;
  sort_order: number;
  children: ComponentTreeNode[];
}

export interface CompatibleProduct {
  id: number;
  sku: string;
  name: string;
  stock_quantity: string;
  reserved_quantity: string;
  available_quantity: string;
  sale_price: string;
  location: string;
  is_primary: boolean;
}

export interface CompatibleProductsResponse {
  equipment_model: { id: number; name: string };
  component: { id: number; name: string; path: string };
  products: CompatibleProduct[];
}
```

- [ ] **Step 2: Añadir los hooks y extender AddPartInput**

En `frontend/src/features/service-orders/api.ts`:

1. Import: `import type { ComponentTreeNode, CompatibleProductsResponse } from "./despieceTypes";`.
2. En `AddPartInput` agregar `component?: number;`.
3. Agregar los hooks:

```typescript
export function useOrderComponentTree(orderId: number | undefined) {
  return useQuery({
    queryKey: ["order-component-tree", orderId],
    enabled: orderId != null,
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/service-orders/{id}/component-tree/",
        { params: { path: { id: orderId as number } } },
      );
      if (error || !data)
        throw new Error(
          "El equipo de la orden no tiene un modelo técnico asignado.",
        );
      return data as unknown as ComponentTreeNode[];
    },
    retry: false,
  });
}

export function useCompatibleProducts(
  orderId: number | undefined,
  componentId: number | undefined,
) {
  return useQuery({
    queryKey: ["order-compatible", orderId, componentId],
    enabled: orderId != null && componentId != null,
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/service-orders/{id}/compatible-products/",
        {
          params: {
            path: { id: orderId as number },
            query: { component: componentId } as Record<string, unknown>,
          },
        },
      );
      if (error || !data)
        throw new Error("No se pudieron cargar las piezas compatibles.");
      return data as unknown as CompatibleProductsResponse;
    },
  });
}
```

(Si el path `/api/service-orders/{id}/component-tree/` no está tipado en el schema como GET con array, usar `as unknown as` — ya está previsto arriba.)

- [ ] **Step 3: Typecheck**

Run: `docker compose exec frontend npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/service-orders/despieceTypes.ts frontend/src/features/service-orders/api.ts
git commit -m "feat(service-orders): hooks del despiece de orden (árbol y piezas compatibles)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `EquipmentComponentTree` (Mantine Tree)

**Files:**
- Create: `frontend/src/features/service-orders/components/EquipmentComponentTree.tsx`
- Create: `frontend/src/features/service-orders/components/EquipmentComponentTree.test.tsx`

**Interfaces:**
- Consumes: `ComponentTreeNode` (Task 1).
- Produces: `EquipmentComponentTree({ nodes, selectedId, onSelect })` — renderiza el árbol con Mantine `Tree`; expandir/contraer; resalta el seleccionado; iconos distintos para `assembly` (carpeta) y `position` (pieza); `onSelect(componentId, node)` al hacer clic en cualquier nodo (hoja o conjunto). Los códigos en monoespaciada.

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/features/service-orders/components/EquipmentComponentTree.test.tsx`:

```tsx
import { MantineProvider } from "@mantine/core";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EquipmentComponentTree } from "./EquipmentComponentTree";
import type { ComponentTreeNode } from "../despieceTypes";

const nodes: ComponentTreeNode[] = [
  {
    id: 1, code: "propulsion", name: "Sistema de propulsión", component_type: "assembly",
    diagram_key: "propulsion", position: "", sort_order: 0,
    children: [
      {
        id: 2, code: "arm_m1", name: "Brazo M1", component_type: "assembly",
        diagram_key: "arm_m1", position: "", sort_order: 0,
        children: [
          { id: 3, code: "motor_m1", name: "Motor M1", component_type: "position",
            diagram_key: "motor_m1", position: "", sort_order: 0, children: [] },
        ],
      },
    ],
  },
];

function renderTree(selectedId: number | null = null) {
  const onSelect = vi.fn();
  render(
    <MantineProvider>
      <EquipmentComponentTree nodes={nodes} selectedId={selectedId} onSelect={onSelect} />
    </MantineProvider>,
  );
  return onSelect;
}

describe("EquipmentComponentTree", () => {
  it("renderiza los conjuntos raíz", () => {
    renderTree();
    expect(screen.getByText("Sistema de propulsión")).toBeInTheDocument();
  });

  it("al hacer clic en un nodo llama onSelect con su id", () => {
    const onSelect = renderTree();
    fireEvent.click(screen.getByText("Sistema de propulsión"));
    expect(onSelect).toHaveBeenCalledWith(1, expect.objectContaining({ code: "propulsion" }));
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `docker compose exec frontend npx vitest run src/features/service-orders/components/EquipmentComponentTree.test.tsx`
Expected: FAIL (el componente no existe).

- [ ] **Step 3: Implementar el árbol**

Crear `frontend/src/features/service-orders/components/EquipmentComponentTree.tsx`:

```tsx
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
            <Text size="sm" fw={isSelected ? 600 : 400}>
              {original.name}
            </Text>
          </Group>
        );
      }}
    />
  );
}
```

- [ ] **Step 4: Correr el test**

Run: `docker compose exec frontend npx vitest run src/features/service-orders/components/EquipmentComponentTree.test.tsx`
Expected: PASS (2 tests). Si la firma de `renderNode` difiere en esta versión de Mantine, ajustar el destructuring mínimamente (leer `frontend/node_modules/@mantine/core/lib/components/Tree/Tree.d.ts` para la forma de `RenderTreeNodePayload`), preservando el comportamiento (clic → onSelect, iconos por tipo, resaltado). Documentar el ajuste.

- [ ] **Step 5: Typecheck + commit**

Run: `docker compose exec frontend npm run typecheck` → PASS.

```bash
git add frontend/src/features/service-orders/components/EquipmentComponentTree.tsx frontend/src/features/service-orders/components/EquipmentComponentTree.test.tsx
git commit -m "feat(service-orders): árbol de componentes del despiece (Mantine Tree)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `EquipmentDiagram` (SVG esquemático, la firma)

**Files:**
- Create: `frontend/src/features/service-orders/components/EquipmentDiagram.tsx`
- Create: `frontend/src/features/service-orders/components/EquipmentDiagram.test.tsx`

**Interfaces:**
- Consumes: nada de red. Props `{ modelCode, selectedKeys, onZoneSelect }`.
- Produces: `EquipmentDiagram({ modelCode, selectedKeys, onZoneSelect })` — dibuja el esquema del `modelCode` ("T50" → vista superior; "D12500IE" → vista frontal; otro → mensaje "Sin diagrama para este modelo"). Cada zona es un `<g role="button" tabIndex={0} aria-label data-key>` que resalta cuando su `data-key` está en `selectedKeys` (set de claves del componente seleccionado y sus ancestros); clic/Enter/Espacio → `onZoneSelect(key)`. Accesible (foco visible, activación por teclado). Zonas mapeadas a los `code`/`diagram_key` sembrados.

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/features/service-orders/components/EquipmentDiagram.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EquipmentDiagram } from "./EquipmentDiagram";

describe("EquipmentDiagram", () => {
  it("dibuja las zonas del T50 y responde al clic", () => {
    const onZoneSelect = vi.fn();
    render(
      <EquipmentDiagram modelCode="T50" selectedKeys={new Set()} onZoneSelect={onZoneSelect} />,
    );
    const arm = screen.getByRole("button", { name: /Brazo M1/i });
    fireEvent.click(arm);
    expect(onZoneSelect).toHaveBeenCalledWith("arm_m1");
  });

  it("resalta la zona seleccionada (aria-pressed)", () => {
    render(
      <EquipmentDiagram
        modelCode="T50"
        selectedKeys={new Set(["arm_m1"])}
        onZoneSelect={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /Brazo M1/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("activa por teclado (Enter)", () => {
    const onZoneSelect = vi.fn();
    render(
      <EquipmentDiagram modelCode="T50" selectedKeys={new Set()} onZoneSelect={onZoneSelect} />,
    );
    fireEvent.keyDown(screen.getByRole("button", { name: /Sistema de pulverización/i }), {
      key: "Enter",
    });
    expect(onZoneSelect).toHaveBeenCalledWith("spray");
  });

  it("muestra un aviso si el modelo no tiene diagrama", () => {
    render(
      <EquipmentDiagram modelCode="ZZZ" selectedKeys={new Set()} onZoneSelect={vi.fn()} />,
    );
    expect(screen.getByText(/Sin diagrama/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `docker compose exec frontend npx vitest run src/features/service-orders/components/EquipmentDiagram.test.tsx`
Expected: FAIL (no existe).

- [ ] **Step 3: Implementar el diagrama**

Crear `frontend/src/features/service-orders/components/EquipmentDiagram.tsx`. Un `Zone` reutilizable (grupo SVG accesible) + dos esquemas originales. Los `key` coinciden con los `code`/`diagram_key` sembrados (`arm_m1..arm_m4`, `spray`, `navigation`, `structure`, `spreading`, `electrical`; y `engine`, `fuel`, `electrical`, `cooling`, `control_panel`, `structure`).

```tsx
import { Text } from "@mantine/core";
import type { KeyboardEvent, ReactNode } from "react";

interface ZoneProps {
  zoneKey: string;
  label: string;
  selectedKeys: Set<string>;
  onZoneSelect: (key: string) => void;
  children: ReactNode;
}

function Zone({ zoneKey, label, selectedKeys, onZoneSelect, children }: ZoneProps) {
  const selected = selectedKeys.has(zoneKey);
  const activate = () => onZoneSelect(zoneKey);
  const onKey = (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activate();
    }
  };
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={selected}
      data-key={zoneKey}
      onClick={activate}
      onKeyDown={onKey}
      className={`veragro-zone${selected ? " is-selected" : ""}`}
      style={{ cursor: "pointer" }}
    >
      <title>{label}</title>
      {children}
    </g>
  );
}

const ZONE_CSS = `
.veragro-zone { outline: none; }
.veragro-zone .zone-fill {
  fill: var(--mantine-color-default);
  stroke: var(--mantine-color-dimmed);
  stroke-width: 1.5;
  transition: fill 120ms, stroke 120ms;
}
.veragro-zone:hover .zone-fill { fill: var(--mantine-primary-color-light); }
.veragro-zone.is-selected .zone-fill {
  fill: var(--mantine-primary-color-light);
  stroke: var(--mantine-primary-color-filled);
  stroke-width: 2.5;
}
.veragro-zone:focus-visible .zone-fill { stroke: var(--mantine-primary-color-filled); stroke-width: 2.5; }
.veragro-diagram text { fill: var(--mantine-color-dimmed); font-size: 11px; font-family: var(--mantine-font-family-monospace, monospace); }
@media (prefers-reduced-motion: reduce) { .veragro-zone .zone-fill { transition: none; } }
`;

function T50Diagram(props: Omit<ZoneProps, "zoneKey" | "label" | "children">) {
  // Vista superior: cuerpo central + 4 brazos en X, tanque, radar, tren.
  const arm = (key: string, label: string, x1: number, y1: number, x2: number, y2: number, cx: number, cy: number) => (
    <Zone zoneKey={key} label={label} {...props}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} className="zone-fill" />
      <circle cx={cx} cy={cy} r={26} className="zone-fill" />
      <circle cx={cx} cy={cy} r={11} className="zone-fill" />
      <text x={cx} y={cy - 34} textAnchor="middle">{key.toUpperCase()}</text>
    </Zone>
  );
  return (
    <svg viewBox="0 0 360 360" className="veragro-diagram" role="group" aria-label="Diagrama DJI Agras T50 (vista superior)" style={{ width: "100%", height: "auto" }}>
      <style>{ZONE_CSS}</style>
      {arm("arm_m1", "Brazo M1", 180, 180, 70, 70, 60, 60)}
      {arm("arm_m2", "Brazo M2", 180, 180, 290, 70, 300, 60)}
      {arm("arm_m3", "Brazo M3", 180, 180, 70, 290, 60, 300)}
      {arm("arm_m4", "Brazo M4", 180, 180, 290, 290, 300, 300)}
      <Zone zoneKey="structure" label="Estructura" {...props}>
        <rect x={135} y={135} width={90} height={90} rx={16} className="zone-fill" />
      </Zone>
      <Zone zoneKey="spray" label="Sistema de pulverización" {...props}>
        <rect x={152} y={150} width={56} height={40} rx={8} className="zone-fill" />
      </Zone>
      <Zone zoneKey="navigation" label="Navegación y seguridad" {...props}>
        <rect x={168} y={120} width={24} height={16} rx={4} className="zone-fill" />
      </Zone>
      <Zone zoneKey="spreading" label="Sistema de esparcimiento" {...props}>
        <rect x={160} y={196} width={40} height={22} rx={6} className="zone-fill" />
      </Zone>
    </svg>
  );
}

function D12500Diagram(props: Omit<ZoneProps, "zoneKey" | "label" | "children">) {
  // Vista frontal: bloque motor, tanque combustible, panel, refrigeración, chasis.
  const block = (key: string, label: string, x: number, y: number, w: number, h: number) => (
    <Zone zoneKey={key} label={label} {...props}>
      <rect x={x} y={y} width={w} height={h} rx={8} className="zone-fill" />
      <text x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle">{key.toUpperCase()}</text>
    </Zone>
  );
  return (
    <svg viewBox="0 0 360 300" className="veragro-diagram" role="group" aria-label="Diagrama DJI D12500iE (vista frontal)" style={{ width: "100%", height: "auto" }}>
      <style>{ZONE_CSS}</style>
      <Zone zoneKey="structure" label="Estructura" {...props}>
        <rect x={20} y={20} width={320} height={260} rx={14} className="zone-fill" />
      </Zone>
      {block("engine", "Motor", 40, 60, 140, 120)}
      {block("cooling", "Refrigeración", 40, 190, 140, 60)}
      {block("fuel", "Sistema de combustible", 200, 60, 120, 70)}
      {block("electrical", "Sistema eléctrico", 200, 140, 120, 50)}
      {block("control_panel", "Panel de control", 200, 200, 120, 50)}
    </svg>
  );
}

export function EquipmentDiagram({
  modelCode,
  selectedKeys,
  onZoneSelect,
}: {
  modelCode: string | null | undefined;
  selectedKeys: Set<string>;
  onZoneSelect: (key: string) => void;
}) {
  const code = (modelCode ?? "").toUpperCase();
  const zoneProps = { selectedKeys, onZoneSelect };
  if (code === "T50") return <T50Diagram {...zoneProps} />;
  if (code === "D12500IE") return <D12500Diagram {...zoneProps} />;
  return (
    <Text c="dimmed" ta="center" py="xl">
      Sin diagrama para este modelo.
    </Text>
  );
}
```

- [ ] **Step 4: Correr el test**

Run: `docker compose exec frontend npx vitest run src/features/service-orders/components/EquipmentDiagram.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + lint + commit**

Run: `docker compose exec frontend npm run typecheck` → PASS. `npm run lint` → sin errores nuevos.

```bash
git add frontend/src/features/service-orders/components/EquipmentDiagram.tsx frontend/src/features/service-orders/components/EquipmentDiagram.test.tsx
git commit -m "feat(service-orders): diagrama SVG esquemático del equipo con zonas seleccionables

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `CompatibleProductsPanel` + `ComponentBreadcrumb`

**Files:**
- Create: `frontend/src/features/service-orders/components/ComponentBreadcrumb.tsx`
- Create: `frontend/src/features/service-orders/components/CompatibleProductsPanel.tsx`
- Create: `frontend/src/features/service-orders/components/CompatibleProductsPanel.test.tsx`

**Interfaces:**
- Consumes: `CompatibleProductsResponse`, `CompatibleProduct` (Task 1).
- Produces:
  - `ComponentBreadcrumb({ path })` — muestra la ruta del componente (`A > B > C`).
  - `CompatibleProductsPanel({ data, isLoading, disabled, onAdd })` — tarjetas de pieza (SKU mono, nombre, existencia/reservado/disponible, precio, ubicación, badge "Principal", estado de stock) con cantidad y botón "Agregar a la orden" (deshabilitado si `disabled`, p.ej. orden terminal). Estado vacío cuando no hay pieza o no hay compatibles. `onAdd(productId, quantity)`.

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/features/service-orders/components/CompatibleProductsPanel.test.tsx`:

```tsx
import { MantineProvider } from "@mantine/core";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CompatibleProductsPanel } from "./CompatibleProductsPanel";
import type { CompatibleProductsResponse } from "../despieceTypes";

const data: CompatibleProductsResponse = {
  equipment_model: { id: 1, name: "DJI Agras T50" },
  component: { id: 3, name: "Motor M1", path: "Propulsión > Brazo M1 > Motor M1" },
  products: [
    { id: 10, sku: "DJI-T50-MOTOR-CW", name: "Motor CW", stock_quantity: "4.00",
      reserved_quantity: "0.00", available_quantity: "4.00", sale_price: "450.00",
      location: "A-03", is_primary: true },
    { id: 11, sku: "DJI-T50-MOTOR-CCW", name: "Motor CCW", stock_quantity: "0.00",
      reserved_quantity: "0.00", available_quantity: "0.00", sale_price: "450.00",
      location: "A-04", is_primary: false },
  ],
};

function renderPanel(disabled = false) {
  const onAdd = vi.fn();
  render(
    <MantineProvider>
      <CompatibleProductsPanel data={data} isLoading={false} disabled={disabled} onAdd={onAdd} />
    </MantineProvider>,
  );
  return onAdd;
}

describe("CompatibleProductsPanel", () => {
  it("muestra la ruta y las piezas con estado de stock", () => {
    renderPanel();
    expect(screen.getByText(/Propulsión > Brazo M1 > Motor M1/)).toBeInTheDocument();
    expect(screen.getByText("DJI-T50-MOTOR-CW")).toBeInTheDocument();
    expect(screen.getByText("Sin existencia")).toBeInTheDocument(); // el CCW disp 0
    expect(screen.getByText("Principal")).toBeInTheDocument();
  });

  it("agrega la pieza disponible a la orden", () => {
    const onAdd = renderPanel();
    fireEvent.click(screen.getAllByRole("button", { name: /Agregar a la orden/i })[0]);
    expect(onAdd).toHaveBeenCalledWith(10, expect.any(Number));
  });

  it("deshabilita agregar cuando la orden es terminal", () => {
    renderPanel(true);
    screen.getAllByRole("button", { name: /Agregar a la orden/i }).forEach((b) =>
      expect(b).toBeDisabled(),
    );
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `docker compose exec frontend npx vitest run src/features/service-orders/components/CompatibleProductsPanel.test.tsx`
Expected: FAIL (no existe).

- [ ] **Step 3: Implementar los componentes**

Crear `frontend/src/features/service-orders/components/ComponentBreadcrumb.tsx`:

```tsx
import { Text } from "@mantine/core";

export function ComponentBreadcrumb({ path }: { path: string | null }) {
  if (!path) return null;
  return (
    <Text size="sm" c="dimmed" ff="monospace">
      {path}
    </Text>
  );
}
```

Crear `frontend/src/features/service-orders/components/CompatibleProductsPanel.tsx`:

```tsx
import {
  Badge,
  Button,
  Card,
  Group,
  NumberInput,
  Stack,
  Text,
} from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useState } from "react";

import { formatCurrency } from "../../../utils/format";
import type {
  CompatibleProduct,
  CompatibleProductsResponse,
} from "../despieceTypes";
import { ComponentBreadcrumb } from "./ComponentBreadcrumb";

function stockBadge(available: number) {
  if (available <= 0)
    return <Badge color="red" variant="light">Sin existencia</Badge>;
  return <Badge color="green" variant="light">Disponible</Badge>;
}

function ProductRow({
  product,
  disabled,
  onAdd,
}: {
  product: CompatibleProduct;
  disabled: boolean;
  onAdd: (productId: number, quantity: number) => void;
}) {
  const [qty, setQty] = useState<number | string>(1);
  const available = Number(product.available_quantity);
  return (
    <Card withBorder padding="sm" radius="md">
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <div style={{ minWidth: 0 }}>
          <Group gap="xs">
            <Text ff="monospace" size="sm" fw={600}>
              {product.sku}
            </Text>
            {product.is_primary && (
              <Badge size="xs" color="teal" variant="light">Principal</Badge>
            )}
            {stockBadge(available)}
          </Group>
          <Text size="sm">{product.name}</Text>
          <Text size="xs" c="dimmed">
            Disp. {product.available_quantity} · Reserv. {product.reserved_quantity} ·{" "}
            {formatCurrency(product.sale_price)} · Ubic. {product.location || "—"}
          </Text>
        </div>
        <Stack gap={6} align="flex-end">
          <NumberInput
            value={qty}
            onChange={setQty}
            min={1}
            step={1}
            w={80}
            size="xs"
            aria-label={`Cantidad ${product.sku}`}
          />
          <Button
            size="xs"
            leftSection={<IconPlus size={14} />}
            disabled={disabled}
            onClick={() => onAdd(product.id, Number(qty) || 1)}
          >
            Agregar a la orden
          </Button>
        </Stack>
      </Group>
    </Card>
  );
}

export function CompatibleProductsPanel({
  data,
  isLoading,
  disabled,
  onAdd,
}: {
  data: CompatibleProductsResponse | undefined;
  isLoading: boolean;
  disabled: boolean;
  onAdd: (productId: number, quantity: number) => void;
}) {
  if (isLoading) return <Text c="dimmed" size="sm">Cargando piezas…</Text>;
  if (!data)
    return (
      <Text c="dimmed" size="sm" ta="center" py="lg">
        Selecciona un componente en el árbol o el diagrama para ver sus piezas.
      </Text>
    );
  return (
    <Stack gap="sm">
      <ComponentBreadcrumb path={data.component.path} />
      {data.products.length === 0 ? (
        <Text c="dimmed" size="sm">
          No hay piezas compatibles registradas para este componente.
        </Text>
      ) : (
        data.products.map((p) => (
          <ProductRow key={p.id} product={p} disabled={disabled} onAdd={onAdd} />
        ))
      )}
    </Stack>
  );
}
```

- [ ] **Step 4: Correr el test**

Run: `docker compose exec frontend npx vitest run src/features/service-orders/components/CompatibleProductsPanel.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `docker compose exec frontend npm run typecheck` → PASS.

```bash
git add frontend/src/features/service-orders/components/ComponentBreadcrumb.tsx frontend/src/features/service-orders/components/CompatibleProductsPanel.tsx frontend/src/features/service-orders/components/CompatibleProductsPanel.test.tsx
git commit -m "feat(service-orders): panel de piezas compatibles con estado de stock

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `InteractivePartsTab` + pestaña Despiece

**Files:**
- Create: `frontend/src/features/service-orders/components/InteractivePartsTab.tsx`
- Create: `frontend/src/features/service-orders/components/InteractivePartsTab.test.tsx`
- Modify: `frontend/src/features/service-orders/ServiceOrderDetailPage.tsx`

**Interfaces:**
- Consumes: `useOrderComponentTree`, `useCompatibleProducts`, `useAddPart` (Task 1), `EquipmentComponentTree` (T2), `EquipmentDiagram` (T3), `CompatibleProductsPanel` (T4), `ServiceOrder` (para `equipment_catalog_model` y estado terminal).
- Produces: `InteractivePartsTab({ order })` — layout 3 columnas responsive; obtiene el árbol; mantiene `selectedComponentId`; deriva `selectedKeys` (código del seleccionado + ancestros) para el diagrama; consulta compatibles; agrega piezas (refresca orden/productos/compatibles); estados de carga/vacío/error (equipo sin modelo técnico); respeta orden terminal. `ServiceOrderDetailPage` gana la pestaña **Despiece** como primera pestaña.

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/features/service-orders/components/InteractivePartsTab.test.tsx`:

```tsx
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { InteractivePartsTab } from "./InteractivePartsTab";

const addMutate = vi.fn().mockResolvedValue({});
const tree = [
  {
    id: 1, code: "propulsion", name: "Sistema de propulsión", component_type: "assembly",
    diagram_key: "propulsion", position: "", sort_order: 0,
    children: [
      { id: 3, code: "motor_m1", name: "Motor M1", component_type: "position",
        diagram_key: "motor_m1", position: "", sort_order: 0, children: [] },
    ],
  },
];
const compat = {
  equipment_model: { id: 1, name: "DJI Agras T50" },
  component: { id: 3, name: "Motor M1", path: "Sistema de propulsión > Motor M1" },
  products: [
    { id: 10, sku: "MOT-1", name: "Motor CW", stock_quantity: "4.00", reserved_quantity: "0.00",
      available_quantity: "4.00", sale_price: "450.00", location: "A-03", is_primary: true },
  ],
};

vi.mock("../api", () => ({
  useOrderComponentTree: () => ({ data: tree, isLoading: false, error: null }),
  useCompatibleProducts: (_o: number, componentId?: number) => ({
    data: componentId ? compat : undefined,
    isLoading: false,
  }),
  useAddPart: () => ({ mutateAsync: addMutate, isPending: false }),
}));

function renderTab(status = "in_progress") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MantineProvider>
        <Notifications />
        <InteractivePartsTab
          order={{ id: 27, status, equipment_catalog_model: 1, equipment_catalog_model_name: "DJI Agras T50" } as never}
        />
      </MantineProvider>
    </QueryClientProvider>,
  );
}

describe("InteractivePartsTab", () => {
  it("muestra el árbol del despiece", () => {
    renderTab();
    expect(screen.getByText("Sistema de propulsión")).toBeInTheDocument();
  });

  it("al seleccionar un componente carga y agrega una pieza compatible", async () => {
    addMutate.mockClear();
    renderTab();
    fireEvent.click(screen.getByText("Sistema de propulsión"));
    // Selecciona la hoja para ver piezas
    fireEvent.click(await screen.findByText("Motor M1"));
    fireEvent.click(await screen.findByRole("button", { name: /Agregar a la orden/i }));
    await waitFor(() => expect(addMutate).toHaveBeenCalledTimes(1));
    expect(addMutate.mock.calls[0][0]).toMatchObject({ product: 10, component: 3 });
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `docker compose exec frontend npx vitest run src/features/service-orders/components/InteractivePartsTab.test.tsx`
Expected: FAIL (no existe).

- [ ] **Step 3: Implementar el orquestador**

Crear `frontend/src/features/service-orders/components/InteractivePartsTab.tsx`:

```tsx
import { Alert, Card, Grid, Loader, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMemo, useState } from "react";

import type { ServiceOrder } from "../types";
import { useAddPart, useCompatibleProducts, useOrderComponentTree } from "../api";
import type { ComponentTreeNode } from "../despieceTypes";
import { CompatibleProductsPanel } from "./CompatibleProductsPanel";
import { EquipmentComponentTree } from "./EquipmentComponentTree";
import { EquipmentDiagram } from "./EquipmentDiagram";

const TERMINAL = ["finished", "invoiced", "delivered", "cancelled"];

// Aplana el árbol en índices: id→nodo, id→códigos (propio + ancestros), code→id.
function indexTree(nodes: ComponentTreeNode[]) {
  const byId = new Map<number, ComponentTreeNode>();
  const ancestorCodes = new Map<number, Set<string>>();
  const idByCode = new Map<string, number>();
  const walk = (node: ComponentTreeNode, parentCodes: string[]) => {
    byId.set(node.id, node);
    idByCode.set(node.code, node.id);
    const codes = new Set([...parentCodes, node.code, node.diagram_key].filter(Boolean));
    ancestorCodes.set(node.id, codes);
    node.children.forEach((c) => walk(c, [...parentCodes, node.code, node.diagram_key]));
  };
  nodes.forEach((n) => walk(n, []));
  return { byId, ancestorCodes, idByCode };
}

export function InteractivePartsTab({ order }: { order: ServiceOrder }) {
  const orderId = order.id as number;
  const hasModel = order.equipment_catalog_model != null;
  const treeQ = useOrderComponentTree(hasModel ? orderId : undefined);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const add = useAddPart(orderId);
  const terminal = TERMINAL.includes(order.status ?? "");

  const tree = treeQ.data ?? [];
  const { ancestorCodes, idByCode } = useMemo(() => indexTree(tree), [tree]);
  const compatQ = useCompatibleProducts(orderId, selectedId ?? undefined);

  const selectedKeys = useMemo(
    () => (selectedId != null ? ancestorCodes.get(selectedId) ?? new Set<string>() : new Set<string>()),
    [selectedId, ancestorCodes],
  );

  const onAdd = async (productId: number, quantity: number) => {
    try {
      await add.mutateAsync({
        product: productId,
        component: selectedId ?? undefined,
        quantity: String(quantity),
      });
      notifications.show({ color: "green", message: "Pieza agregada a la orden." });
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };

  if (!hasModel) {
    return (
      <Alert color="yellow" title="Sin modelo técnico">
        El equipo de esta orden no tiene un modelo técnico asignado. Asígnalo en la ficha
        del equipo para usar el despiece.
      </Alert>
    );
  }
  if (treeQ.isLoading) return <Loader />;
  if (treeQ.error)
    return <Alert color="red">{(treeQ.error as Error).message}</Alert>;

  const modelCode = deriveModelCode(order.equipment_catalog_model_name);

  return (
    <Grid gutter="md">
      <Grid.Col span={{ base: 12, md: 3.5 }}>
        <Card withBorder padding="sm" radius="md">
          <Text fw={600} size="sm" mb="xs">Componentes</Text>
          <EquipmentComponentTree
            nodes={tree}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId(id)}
          />
        </Card>
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 4.5 }}>
        <Card withBorder padding="sm" radius="md">
          <Text fw={600} size="sm" mb="xs">Diagrama</Text>
          <EquipmentDiagram
            modelCode={modelCode}
            selectedKeys={selectedKeys}
            onZoneSelect={(key) => {
              const id = idByCode.get(key);
              if (id != null) setSelectedId(id);
            }}
          />
        </Card>
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 4 }}>
        <Card withBorder padding="sm" radius="md">
          <Text fw={600} size="sm" mb="xs">Piezas compatibles</Text>
          <CompatibleProductsPanel
            data={selectedId != null ? compatQ.data : undefined}
            isLoading={compatQ.isLoading}
            disabled={terminal}
            onAdd={onAdd}
          />
        </Card>
      </Grid.Col>
    </Grid>
  );
}

// Deriva el código de modelo para elegir el diagrama, desde el nombre del modelo.
function deriveModelCode(name: string | null | undefined): string | null {
  if (!name) return null;
  const n = name.toLowerCase();
  if (n.includes("t50")) return "T50";
  if (n.includes("d12500")) return "D12500IE";
  return null;
}
```

- [ ] **Step 4: Añadir la pestaña Despiece en la orden**

En `frontend/src/features/service-orders/ServiceOrderDetailPage.tsx`:

1. Import: `import { InteractivePartsTab } from "./components/InteractivePartsTab";`.
2. Cambiar la pestaña por defecto y añadir la pestaña como primera. Reemplazar:
```tsx
      <Tabs defaultValue="parts">
        <Tabs.List>
          <Tabs.Tab value="parts">Piezas</Tabs.Tab>
          <Tabs.Tab value="checklist">Checklist</Tabs.Tab>
        </Tabs.List>
```
por:
```tsx
      <Tabs defaultValue="despiece">
        <Tabs.List>
          <Tabs.Tab value="despiece">Despiece</Tabs.Tab>
          <Tabs.Tab value="parts">Piezas</Tabs.Tab>
          <Tabs.Tab value="checklist">Checklist</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="despiece" pt="md">
          <InteractivePartsTab order={order} />
        </Tabs.Panel>
```
(Mantener los `Tabs.Panel` de `parts` y `checklist` como están.)

- [ ] **Step 5: Correr el test**

Run: `docker compose exec frontend npx vitest run src/features/service-orders/components/InteractivePartsTab.test.tsx`
Expected: PASS (2 tests). Ajustar el mock/interacción si la selección de nodo del árbol necesita otra query (mantener las aserciones: árbol visible; agregar envía `{product, component}`).

- [ ] **Step 6: Actualizar tests de página afectados**

La `ServiceOrderDetailPage` ahora monta `InteractivePartsTab`, que llama `useOrderComponentTree`/`useCompatibleProducts`. Si existe `service-orders.test.tsx` que renderiza el detalle, completar su `vi.mock("./api", …)` con esos hooks (stub: `useOrderComponentTree: () => ({ data: [], isLoading: false, error: null })`, `useCompatibleProducts: () => ({ data: undefined, isLoading: false })`). Verificar con:
Run: `docker compose exec frontend npx vitest run src/features/service-orders`
Expected: PASS (nuevos + existentes).

- [ ] **Step 7: Typecheck + lint + commit**

Run: `docker compose exec frontend npm run typecheck` → PASS. `npm run lint` → sin errores nuevos.

```bash
git add frontend/src/features/service-orders/components/InteractivePartsTab.tsx frontend/src/features/service-orders/components/InteractivePartsTab.test.tsx frontend/src/features/service-orders/ServiceOrderDetailPage.tsx frontend/src/features/service-orders/service-orders.test.tsx
git commit -m "feat(service-orders): pestaña Despiece interactiva (árbol + diagrama + piezas)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Verificación de la Etapa 4

**Files:** ninguno (verificación).

- [ ] **Step 1: Suite frontend completa**

Run: `docker compose exec frontend npx vitest run`
Expected: PASS (todo — nuevos + existentes).

- [ ] **Step 2: Typecheck y build**

Run: `docker compose exec frontend npm run typecheck` → PASS.
Run: `docker compose exec frontend npm run build` → build OK.

- [ ] **Step 3: Verificación manual (con `docker compose up`)**

1. Abrir la orden **OS-000027** (Agras T50 con compatibilidades demo) → pestaña **Despiece**.
2. Confirmar 3 columnas en escritorio; en móvil, apiladas.
3. Clic en **Brazo M1** en el diagrama → se resalta y selecciona en el árbol; drill a **Motor M1** → aparecen las piezas compatibles.
4. Clic en un nodo del árbol → se resalta la zona del diagrama.
5. "Agregar a la orden" en el Motor CW → aparece en la pestaña **Piezas** con su componente.
6. Verificar foco por teclado en las zonas del diagrama (Tab + Enter).

Si algo falla, reportar antes de cerrar la etapa.

## Notas / decisiones

- **Sincronización árbol↔diagrama** vía códigos: `selectedKeys` = código del componente seleccionado + ancestros; el diagrama resalta cualquier zona cuyo `data-key` esté en ese set (clic en hoja `motor_m1` resalta la zona `arm_m1`/`propulsion` según el esquema). Clic en zona → selecciona el componente cuyo `code` coincide.
- **Elección de diagrama** por el nombre del modelo (`deriveModelCode`) para no depender de exponer `model_code` en la orden; los dos modelos del alcance (T50, D12500iE) se cubren; otros → aviso "Sin diagrama".
- **`add-part` reutilizado** con `component`; el backend valida la compatibilidad (Etapa 2). El refresco de orden/productos ya lo hace `useAddPart` (invalida `["service-order", id]`, `["service-orders"]`, `["products"]`).
- **Diagramas SVG originales y esquemáticos** (no técnicos exactos, sin imágenes de DJI); `diagram_key`/`code` sembrados en la Etapa 1 son la única fuente del mapeo.
- **Caché por `serviceOrderId + componentId`** en `useCompatibleProducts` (query key), como pide la spec.
