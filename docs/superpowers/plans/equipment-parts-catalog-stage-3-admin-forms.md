# Catálogo técnico — Etapa 3: Formularios admin web

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un administrador pueda, desde la web (sin el admin de Django): (a) asociar un equipo físico a un modelo técnico del catálogo, y (b) registrar las compatibilidades técnicas de un producto (modelo + componente + principal + notas). Usar los tipos OpenAPI ya regenerados.

**Architecture:** Hooks de TanStack Query nuevos para los endpoints de catálogo (Etapa 2), un `Select` de modelo técnico en el formulario de equipo (filtrado por tipo, con autocompletado no destructivo de marca/modelo), y un `ProductCompatibilityModal` (patrón de `SupplierProductModal`) abierto desde una acción por fila en Inventario. Mantener el estilo Mantine existente; sin librerías nuevas.

**Tech Stack:** React 19, TypeScript, Mantine 9, TanStack Query, openapi-fetch, Vitest + React Testing Library.

## Global Constraints

- Frontend en Docker; tests: `docker compose exec frontend npx vitest run <ruta>`; typecheck `docker compose exec frontend npm run typecheck`; lint `docker compose exec frontend npm run lint`; build `docker compose exec frontend npm run build`. Frontend arriba: `docker compose up -d frontend`.
- Idioma de UI: español. Estilo visual Mantine existente (seguir `SupplierProductModal`, `EquipmentFormModal`, `AdjustStockModal`).
- Usar los tipos generados donde sea posible; tipos locales solo para lo que el schema no represente bien (patrón de `inventory/types.ts::InventoryMovement`).
- No romper el flujo actual de equipos ni de inventario. Campos heredados (`brand`, `model`, `compatible_models`) intactos.
- Lint tiene ~10 errores preexistentes ajenos a esta etapa: solo importan errores NUEVOS.
- Rama `V3.0`. Commits en español, imperativo, footer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Endpoints (Etapa 2): `GET /api/equipment/models/` (sin paginar), `GET /api/equipment/components/?equipment_model=` (sin paginar), `GET/POST /api/inventory/product-compatibilities/` (paginado, filtro `?product=`), `DELETE /api/inventory/product-compatibilities/{id}/`.
- Spec: `docs/superpowers/specs/equipment-parts-catalog.md`.

---

### Task 1: Tipos y hooks de API del catálogo (frontend)

**Files:**
- Create: `frontend/src/features/equipment/catalogTypes.ts`
- Modify: `frontend/src/features/equipment/api.ts`
- Modify: `frontend/src/features/inventory/api.ts`

**Interfaces:**
- Produces:
  - Tipos `EquipmentModel`, `EquipmentComponent`, `ProductCompatibility` (locales, en `catalogTypes.ts`).
  - `useEquipmentModels()` → `EquipmentModel[]` (equipment/api.ts).
  - `useComponentsByModel(modelId?: number)` → `EquipmentComponent[]` (inventory/api.ts o equipment/api.ts — ver abajo).
  - `useProductCompatibilities(productId?: number)` → `ProductCompatibility[]` (inventory/api.ts).
  - `useSaveCompatibility()` y `useDeleteCompatibility()` (inventory/api.ts).

- [ ] **Step 1: Crear los tipos locales**

Crear `frontend/src/features/equipment/catalogTypes.ts`:

```typescript
export interface EquipmentModel {
  id: number;
  equipment_type: number;
  equipment_type_name?: string;
  brand: string;
  name: string;
  model_code: string;
  revision: string;
  description: string;
  diagram_type: string;
  is_active: boolean;
}

export interface EquipmentComponent {
  id: number;
  equipment_model: number;
  parent: number | null;
  code: string;
  name: string;
  component_type: string;
  diagram_key: string;
  position: string;
  sort_order: number;
  is_active: boolean;
  path: string;
}

export interface ProductCompatibility {
  id: number;
  product: number;
  equipment_model: number;
  equipment_model_name?: string;
  component: number;
  component_name?: string;
  component_code?: string;
  component_path?: string;
  is_primary: boolean;
  notes: string;
}
```

- [ ] **Step 2: Hook de modelos técnicos (equipment/api.ts)**

En `frontend/src/features/equipment/api.ts`, agregar el import `import type { EquipmentModel } from "./catalogTypes";` y el hook:

```typescript
export function useEquipmentModels() {
  return useQuery({
    queryKey: ["equipment-models"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await api.GET("/api/equipment/models/");
      if (error || !data) throw new Error("No se pudieron cargar los modelos técnicos.");
      return data as unknown as EquipmentModel[];
    },
  });
}
```

- [ ] **Step 3: Hooks de componentes y compatibilidades (inventory/api.ts)**

En `frontend/src/features/inventory/api.ts`, agregar imports:

```typescript
import type {
  EquipmentComponent,
  ProductCompatibility,
} from "../equipment/catalogTypes";
```

Y los hooks:

```typescript
export function useComponentsByModel(modelId: number | undefined) {
  return useQuery({
    queryKey: ["equipment-components", modelId],
    enabled: modelId != null,
    queryFn: async () => {
      const { data, error } = await api.GET("/api/equipment/components/", {
        params: { query: { equipment_model: modelId } as Record<string, unknown> },
      });
      if (error || !data) throw new Error("No se pudieron cargar los componentes.");
      return data as unknown as EquipmentComponent[];
    },
  });
}

export function useProductCompatibilities(productId: number | undefined) {
  return useQuery({
    queryKey: ["product-compatibilities", productId],
    enabled: productId != null,
    queryFn: async () => {
      const { data, error } = await api.GET("/api/inventory/product-compatibilities/", {
        params: { query: { product: productId } as Record<string, unknown> },
      });
      if (error || !data) throw new Error("No se pudieron cargar las compatibilidades.");
      return (data as unknown as Paginated<ProductCompatibility>).results;
    },
  });
}

export function useSaveCompatibility() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      product: number;
      equipment_model: number;
      component: number;
      is_primary: boolean;
      notes: string;
    }) => {
      const { data, error } = await api.POST("/api/inventory/product-compatibilities/", {
        body: payload as unknown as ProductCompatibility,
      });
      if (error) throw new Error("No se pudo guardar la compatibilidad.");
      return data as unknown as ProductCompatibility;
    },
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ["product-compatibilities", vars.product] });
    },
  });
}

export function useDeleteCompatibility(productId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await api.DELETE("/api/inventory/product-compatibilities/{id}/", {
        params: { path: { id } },
      });
      if (error) throw new Error("No se pudo eliminar la compatibilidad.");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["product-compatibilities", productId] });
    },
  });
}
```

(`Paginated` ya está importado en `inventory/api.ts`.)

- [ ] **Step 4: Typecheck**

Run: `docker compose exec frontend npm run typecheck`
Expected: PASS (hooks nuevos, sin usar todavía).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/equipment/catalogTypes.ts frontend/src/features/equipment/api.ts frontend/src/features/inventory/api.ts
git commit -m "feat(frontend): hooks y tipos del catálogo técnico

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Modelo técnico en el formulario y detalle de equipo

**Files:**
- Modify: `frontend/src/features/equipment/EquipmentFormModal.tsx`
- Modify: `frontend/src/features/equipment/EquipmentDetailPage.tsx`
- Create: `frontend/src/features/equipment/EquipmentFormModal.test.tsx`

**Interfaces:**
- Consumes: `useEquipmentModels` (Task 1), `Equipment.catalog_model` (schema regenerado).
- Produces: el form permite elegir "Modelo técnico" (filtrado por el tipo elegido); al elegirlo, rellena `brand`/`model` **solo si están vacíos**; el detalle muestra el modelo técnico y su código.

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/features/equipment/EquipmentFormModal.test.tsx`:

```tsx
import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EquipmentFormModal } from "./EquipmentFormModal";

const saveMutate = vi.fn().mockResolvedValue({});
vi.mock("./api", () => ({
  useSaveEquipment: () => ({ mutateAsync: saveMutate, isPending: false }),
  useEquipmentTypes: () => ({ data: [{ id: 1, name: "Drone agrícola" }] }),
  useEquipmentModels: () => ({
    data: [
      { id: 7, equipment_type: 1, brand: "DJI", name: "DJI Agras T50", model_code: "T50" },
      { id: 8, equipment_type: 2, brand: "DJI", name: "Otro", model_code: "X" },
    ],
  }),
}));
vi.mock("../customers/api", () => ({ useCustomers: () => ({ data: { results: [] } }) }));

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MantineProvider>
        <ModalsProvider>
          <Notifications />
          <EquipmentFormModal opened onClose={vi.fn()} equipment={null} />
        </ModalsProvider>
      </MantineProvider>
    </QueryClientProvider>,
  );
}

describe("EquipmentFormModal · modelo técnico", () => {
  it("muestra el selector de modelo técnico", () => {
    renderModal();
    expect(screen.getByRole("textbox", { name: /Modelo técnico/ })).toBeInTheDocument();
  });

  it("al elegir un modelo técnico rellena marca y modelo si están vacíos", async () => {
    saveMutate.mockClear();
    renderModal();
    fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: "Dron 1" } });
    // Selecciona tipo "Drone agrícola"
    fireEvent.click(screen.getByRole("textbox", { name: /Tipo de equipo/ }));
    fireEvent.click(await screen.findByText("Drone agrícola"));
    // Selecciona modelo técnico
    fireEvent.click(screen.getByRole("textbox", { name: /Modelo técnico/ }));
    fireEvent.click(await screen.findByText("DJI Agras T50"));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(saveMutate).toHaveBeenCalledTimes(1));
    const payload = saveMutate.mock.calls[0][0];
    expect(payload.catalog_model).toBe(7);
    expect(payload.brand).toBe("DJI");
    expect(payload.model).toBe("DJI Agras T50");
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `docker compose exec frontend npx vitest run src/features/equipment/EquipmentFormModal.test.tsx`
Expected: FAIL (no existe el selector "Modelo técnico"; `useEquipmentModels` no está en el componente).

- [ ] **Step 3: Añadir el campo al formulario**

En `frontend/src/features/equipment/EquipmentFormModal.tsx`:

1. En los imports, agregar `useEquipmentModels` al import de `./api`:
   `import { useEquipmentModels, useEquipmentTypes, useSaveEquipment } from "./api";`
2. En `FormValues` agregar `catalog_model: string | null;` y en `EMPTY` agregar `catalog_model: null,`.
3. Tras `const types = useEquipmentTypes();` agregar `const models = useEquipmentModels();`.
4. En el `useEffect` de carga, mapear el valor existente:
   dentro del objeto `...(equipment ? {...} : {})` agregar
   `catalog_model: equipment.catalog_model ? String(equipment.catalog_model) : null,`.
5. Antes del `return`, calcular las opciones de modelo filtradas por el tipo elegido:

```tsx
  const modelOptions = (models.data ?? [])
    .filter((m) =>
      form.values.equipment_type
        ? String(m.equipment_type) === form.values.equipment_type
        : true,
    )
    .map((m) => ({ value: String(m.id), label: `${m.brand} ${m.name}` }));

  const onPickModel = (value: string | null) => {
    form.setFieldValue("catalog_model", value);
    const model = (models.data ?? []).find((m) => String(m.id) === value);
    if (model) {
      if (!form.values.brand.trim()) form.setFieldValue("brand", model.brand);
      if (!form.values.model.trim()) form.setFieldValue("model", model.name);
    }
  };
```

6. En el `handleSubmit`, en `payload`, agregar:
   `catalog_model: values.catalog_model ? Number(values.catalog_model) : null,`.
7. En el JSX, tras el `Select` de "Tipo de equipo" (o junto a Marca/Modelo), agregar una columna:

```tsx
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Modelo técnico"
              placeholder="Opcional — catálogo de despiece"
              data={modelOptions}
              searchable
              clearable
              value={form.values.catalog_model}
              onChange={onPickModel}
            />
          </Grid.Col>
```

- [ ] **Step 4: Mostrar el modelo técnico en el detalle**

El serializer de equipo expone `catalog_model` (id) pero no su nombre, así que se resuelve en el cliente con `useEquipmentModels` (evita tocar el backend/regen en esta etapa).

En `frontend/src/features/equipment/EquipmentDetailPage.tsx`:

1. Agregar el import `import { useEquipment, useEquipmentModels, useEquipmentServiceHistory, type EquipmentServiceSummary } from "./api";` (añadir `useEquipmentModels` a los imports existentes de `./api`).
2. Dentro del componente, tras `const history = useEquipmentServiceHistory(equipmentId);`, agregar:

```tsx
  const models = useEquipmentModels();
  const catalogModelName =
    (models.data ?? []).find((m) => m.id === equipment?.catalog_model)?.name ?? null;
```

(Nota: `equipment` puede ser `undefined` en la primera render; el `?.` lo cubre y el early-return de `isLoading`/`error` ya está más abajo — mover la línea después de esos returns si TS se queja del narrowing; ambas ubicaciones son válidas porque `useEquipmentModels` no es condicional.)

3. En el `Card`, tras el `Field` de "Modelo", agregar:

```tsx
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Field label="Modelo técnico" value={catalogModelName ?? "—"} />
          </Grid.Col>
```

- [ ] **Step 5: Correr el test**

Run: `docker compose exec frontend npx vitest run src/features/equipment/EquipmentFormModal.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Typecheck + lint**

Run: `docker compose exec frontend npm run typecheck`
Expected: PASS.
Run: `docker compose exec frontend npm run lint`
Expected: sin errores nuevos.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/equipment/EquipmentFormModal.tsx frontend/src/features/equipment/EquipmentDetailPage.tsx frontend/src/features/equipment/EquipmentFormModal.test.tsx
git commit -m "feat(equipment): selecciona modelo técnico en el formulario y detalle de equipo

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Modal de compatibilidad técnica del producto

**Files:**
- Create: `frontend/src/features/inventory/ProductCompatibilityModal.tsx`
- Modify: `frontend/src/features/inventory/InventoryPage.tsx`
- Create: `frontend/src/features/inventory/ProductCompatibilityModal.test.tsx`

**Interfaces:**
- Consumes: `useEquipmentModels`, `useComponentsByModel`, `useProductCompatibilities`, `useSaveCompatibility`, `useDeleteCompatibility` (Task 1).
- Produces: `ProductCompatibilityModal({opened, onClose, product})` — lista las compatibilidades existentes (con ruta y "principal"), permite agregar (modelo → componente → principal → notas) y eliminar. Se abre desde una acción por fila en Inventario.

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/features/inventory/ProductCompatibilityModal.test.tsx`:

```tsx
import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProductCompatibilityModal } from "./ProductCompatibilityModal";

const saveMutate = vi.fn().mockResolvedValue({});
const delMutate = vi.fn().mockResolvedValue({});

vi.mock("../equipment/api", () => ({
  useEquipmentModels: () => ({
    data: [{ id: 1, equipment_type: 1, brand: "DJI", name: "DJI Agras T50", model_code: "T50" }],
  }),
}));
vi.mock("./api", () => ({
  useComponentsByModel: (modelId: number | undefined) => ({
    data: modelId
      ? [
          { id: 3, equipment_model: 1, code: "motor_m1", name: "Motor M1", path: "Propulsión > Brazo M1 > Motor M1" },
          { id: 6, equipment_model: 1, code: "prop_m1", name: "Hélice M1", path: "Propulsión > Brazo M1 > Hélice M1" },
        ]
      : [],
  }),
  useProductCompatibilities: () => ({
    data: [
      {
        id: 50, product: 10, equipment_model: 1, equipment_model_name: "DJI Agras T50",
        component: 3, component_name: "Motor M1", component_path: "Propulsión > Brazo M1 > Motor M1",
        is_primary: true, notes: "",
      },
    ],
  }),
  useSaveCompatibility: () => ({ mutateAsync: saveMutate, isPending: false }),
  useDeleteCompatibility: () => ({ mutateAsync: delMutate, isPending: false }),
}));

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MantineProvider>
        <ModalsProvider>
          <Notifications />
          <ProductCompatibilityModal
            opened
            onClose={vi.fn()}
            product={{ id: 10, sku: "MOT-1", name: "Motor CW" } as never}
          />
        </ModalsProvider>
      </MantineProvider>
    </QueryClientProvider>,
  );
}

describe("ProductCompatibilityModal", () => {
  it("lista las compatibilidades existentes con su ruta", () => {
    renderModal();
    expect(screen.getByText(/Propulsión > Brazo M1 > Motor M1/)).toBeInTheDocument();
    expect(screen.getByText(/DJI Agras T50/)).toBeInTheDocument();
  });

  it("agrega una compatibilidad eligiendo modelo y componente", async () => {
    saveMutate.mockClear();
    renderModal();
    fireEvent.click(screen.getByRole("textbox", { name: /Modelo técnico/ }));
    fireEvent.click(await screen.findByText("DJI DJI Agras T50"));
    fireEvent.click(screen.getByRole("textbox", { name: /Componente/ }));
    fireEvent.click(await screen.findByText(/Hélice M1/));
    fireEvent.click(screen.getByRole("button", { name: "Agregar compatibilidad" }));
    await waitFor(() => expect(saveMutate).toHaveBeenCalledTimes(1));
    expect(saveMutate.mock.calls[0][0]).toMatchObject({
      product: 10, equipment_model: 1, component: 6,
    });
  });

  it("elimina una compatibilidad existente", async () => {
    delMutate.mockClear();
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /Eliminar compatibilidad/ }));
    await waitFor(() => expect(delMutate).toHaveBeenCalledWith(50));
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `docker compose exec frontend npx vitest run src/features/inventory/ProductCompatibilityModal.test.tsx`
Expected: FAIL (el componente no existe).

- [ ] **Step 3: Crear el modal**

Crear `frontend/src/features/inventory/ProductCompatibilityModal.tsx`:

```tsx
import {
  ActionIcon,
  Badge,
  Button,
  Grid,
  Group,
  Modal,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconTrash } from "@tabler/icons-react";
import { useEffect, useState } from "react";

import { useEquipmentModels } from "../equipment/api";
import {
  useComponentsByModel,
  useDeleteCompatibility,
  useProductCompatibilities,
  useSaveCompatibility,
} from "./api";
import type { Product } from "./types";

export function ProductCompatibilityModal({
  opened,
  onClose,
  product,
}: {
  opened: boolean;
  onClose: () => void;
  product: Product | null;
}) {
  const productId = product?.id;
  const models = useEquipmentModels();
  const compatibilities = useProductCompatibilities(productId);
  const save = useSaveCompatibility();
  const del = useDeleteCompatibility(productId);

  const [modelId, setModelId] = useState<string | null>(null);
  const [componentId, setComponentId] = useState<string | null>(null);
  const [isPrimary, setIsPrimary] = useState(false);
  const [notes, setNotes] = useState("");

  const components = useComponentsByModel(modelId ? Number(modelId) : undefined);

  useEffect(() => {
    if (opened) {
      setModelId(null);
      setComponentId(null);
      setIsPrimary(false);
      setNotes("");
    }
  }, [opened]);

  const add = async () => {
    if (!productId || !modelId || !componentId) {
      notifications.show({ color: "red", message: "Elige modelo y componente." });
      return;
    }
    try {
      await save.mutateAsync({
        product: productId,
        equipment_model: Number(modelId),
        component: Number(componentId),
        is_primary: isPrimary,
        notes,
      });
      notifications.show({ color: "green", message: "Compatibilidad agregada." });
      setComponentId(null);
      setIsPrimary(false);
      setNotes("");
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };

  const remove = async (id: number) => {
    try {
      await del.mutateAsync(id);
      notifications.show({ color: "green", message: "Compatibilidad eliminada." });
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={`Compatibilidad técnica${product ? ` · ${product.name}` : ""}`}
      size="lg"
    >
      <Stack>
        <Text fw={600} size="sm">
          Compatibilidades registradas
        </Text>
        {(compatibilities.data ?? []).length === 0 ? (
          <Text size="sm" c="dimmed">
            Aún no hay compatibilidades para este producto.
          </Text>
        ) : (
          <Stack gap="xs">
            {(compatibilities.data ?? []).map((c) => (
              <Group key={c.id} justify="space-between" wrap="nowrap">
                <div>
                  <Group gap="xs">
                    <Text size="sm" fw={500}>
                      {c.equipment_model_name}
                    </Text>
                    {c.is_primary && (
                      <Badge size="xs" variant="light" color="teal">
                        Principal
                      </Badge>
                    )}
                  </Group>
                  <Text size="xs" c="dimmed">
                    {c.component_path ?? c.component_name}
                  </Text>
                </div>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  aria-label="Eliminar compatibilidad"
                  onClick={() => remove(c.id)}
                >
                  <IconTrash size={18} />
                </ActionIcon>
              </Group>
            ))}
          </Stack>
        )}

        <Text fw={600} size="sm" mt="sm">
          Agregar compatibilidad
        </Text>
        <Grid>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Modelo técnico"
              placeholder="Elige un modelo"
              data={(models.data ?? []).map((m) => ({
                value: String(m.id),
                label: `${m.brand} ${m.name}`,
              }))}
              searchable
              value={modelId}
              onChange={(v) => {
                setModelId(v);
                setComponentId(null);
              }}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Componente"
              placeholder={modelId ? "Elige un componente" : "Elige primero un modelo"}
              data={(components.data ?? []).map((c) => ({
                value: String(c.id),
                label: c.path || c.name,
              }))}
              searchable
              disabled={!modelId}
              value={componentId}
              onChange={setComponentId}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 8 }}>
            <TextInput
              label="Notas"
              value={notes}
              onChange={(e) => setNotes(e.currentTarget.value)}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }} mt="lg">
            <Switch
              label="Compatibilidad principal"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.currentTarget.checked)}
            />
          </Grid.Col>
        </Grid>
        <Group justify="flex-end">
          <Button onClick={add} loading={save.isPending}>
            Agregar compatibilidad
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
```

- [ ] **Step 4: Enganchar la acción por fila en Inventario**

En `frontend/src/features/inventory/InventoryPage.tsx`:

1. Import: `import { ProductCompatibilityModal } from "./ProductCompatibilityModal";` y agregar `IconLink` al import de `@tabler/icons-react`.
2. Estado (junto a `adjusting`):
```tsx
  const [compatProduct, setCompatProduct] = useState<Product | null>(null);
```
3. En la columna de acciones de la tabla (donde están los `ActionIcon` de editar/ajustar), agregar (solo si el usuario puede escribir inventario — junto a los otros, dentro del mismo bloque condicional `canWrite`):
```tsx
                <ActionIcon
                  variant="subtle"
                  aria-label="Compatibilidad técnica"
                  onClick={() => setCompatProduct(p)}
                >
                  <IconLink size={18} />
                </ActionIcon>
```
(Localizar el patrón exacto de los `ActionIcon` existentes en la fila —editar/ajustar— y añadirlo con el mismo estilo/condición.)
4. Antes del cierre del componente (junto a los otros modales como `AdjustStockModal`), montar:
```tsx
      <ProductCompatibilityModal
        opened={compatProduct != null}
        onClose={() => setCompatProduct(null)}
        product={compatProduct}
      />
```

- [ ] **Step 5: Correr el test**

Run: `docker compose exec frontend npx vitest run src/features/inventory/ProductCompatibilityModal.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Typecheck + lint**

Run: `docker compose exec frontend npm run typecheck`
Expected: PASS.
Run: `docker compose exec frontend npm run lint`
Expected: sin errores nuevos.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/inventory/ProductCompatibilityModal.tsx frontend/src/features/inventory/InventoryPage.tsx frontend/src/features/inventory/ProductCompatibilityModal.test.tsx
git commit -m "feat(inventory): panel de compatibilidad técnica del producto

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Verificación de la Etapa 3

**Files:** ninguno (verificación).

- [ ] **Step 1: Tests del frontend afectados**

Run: `docker compose exec frontend npx vitest run src/features/equipment src/features/inventory`
Expected: PASS (nuevos + existentes de esas features).

- [ ] **Step 2: Typecheck y build**

Run: `docker compose exec frontend npm run typecheck`
Expected: PASS.
Run: `docker compose exec frontend npm run build`
Expected: build OK (tsc -b + vite build).

Si algo falla, reportar antes de cerrar la etapa.

## Notas / decisiones

- **`ProductCompatibilityModal` se abre desde una acción por fila en Inventario** (patrón `AdjustStockModal`), no anidado dentro de `ProductFormModal` — evita modales anidados y no requiere un `ProductDetailPage` (que no existe).
- **Selección de componente por `Select` con la ruta como etiqueta** (no árbol) en esta etapa admin; el árbol interactivo + SVG es la Etapa 4.
- **Autocompletado de marca/modelo no destructivo**: solo rellena si el campo está vacío (`.trim()`), respetando textos existentes.
- **Detalle de equipo**: si `catalog_model_name` no está en el schema, mostrar el id o añadir `catalog_model_name` al `EquipmentSerializer` (cambio menor). Confirmar contra `schema.d.ts` al implementar.
- Sin librerías nuevas; todo con componentes Mantine ya usados en el repo.
