# Piezas por modelo (menú Modelo→Categoría→Pieza) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Al agregar piezas a una orden de servicio, reemplazar el selector plano de producto por un menú en cascada Modelo → Categoría → Pieza, preseleccionado con el modelo del equipo de la orden y con escape para ver todas las piezas.

**Architecture:** La relación pieza↔modelo ya existe (`Product.compatible_equipment_types` M2M a `EquipmentType`) y la categoría también (`Product.category`). Se añade al backend un filtro `?equipment_type=` en productos y se expone el modelo del equipo en el serializer de la orden. En el frontend se reescribe `AddPartModal` como cascada de 3 pasos que hace una sola consulta por modelo y filtra categorías/piezas en memoria.

**Tech Stack:** Django REST Framework, React 19 + Mantine v9, TanStack Query, openapi-fetch/openapi-typescript, Vitest, pytest, Docker Compose.

## Global Constraints

- Backend corre en Docker; tests: `docker compose exec backend pytest <ruta>`.
- Frontend corre en Docker; tests: `docker compose exec frontend npx vitest run <ruta>`.
- Tras cambios en serializers/params del backend, regenerar tipos OpenAPI (Task 3) antes de tocar frontend que dependa de esos tipos.
- Idioma de UI y mensajes: español (seguir el estilo existente).
- Rama de trabajo: `V3.0`.
- Commits en español, imperativo, con footer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Backend — filtro `equipment_type` en productos

**Files:**
- Modify: `backend/apps/inventory/views.py` (`ProductViewSet.get_queryset`, ~líneas 34-46)
- Test: `backend/apps/inventory/tests/test_api.py` (agregar al final)

**Interfaces:**
- Produces: el endpoint `GET /api/inventory/products/?equipment_type=<id>` filtra por `compatible_equipment_types__id`; combina (AND) con `?category=<id>`; `equipment_type` no numérico → 400.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `backend/apps/inventory/tests/test_api.py`:

```python
@pytest.mark.django_db
def test_filter_by_equipment_type(inv_client):
    from apps.equipment.models import EquipmentType

    t50 = EquipmentType.objects.create(name="Agras T50")
    gen = EquipmentType.objects.create(name="Generador D12500")
    p_t50 = Product.objects.create(sku="ET-1", name="Impeller")
    p_t50.compatible_equipment_types.add(t50)
    p_both = Product.objects.create(sku="ET-2", name="Tornillo comun")
    p_both.compatible_equipment_types.add(t50, gen)
    Product.objects.create(sku="ET-3", name="Sin modelo")

    resp = inv_client.get(f"/api/inventory/products/?equipment_type={t50.id}")
    names = sorted(p["name"] for p in resp.data["results"])
    assert names == ["Impeller", "Tornillo comun"]


@pytest.mark.django_db
def test_filter_equipment_type_no_duplicates(inv_client):
    from apps.equipment.models import EquipmentType

    t50 = EquipmentType.objects.create(name="Agras T50")
    gen = EquipmentType.objects.create(name="Generador D12500")
    p = Product.objects.create(sku="DUP-ET", name="Multi")
    p.compatible_equipment_types.add(t50, gen)

    resp = inv_client.get(f"/api/inventory/products/?equipment_type={t50.id}")
    skus = [x["sku"] for x in resp.data["results"]]
    assert skus.count("DUP-ET") == 1  # sin duplicados por el join M2M


@pytest.mark.django_db
def test_invalid_equipment_type_filter_returns_400(inv_client):
    resp = inv_client.get("/api/inventory/products/?equipment_type=abc")
    assert resp.status_code == 400
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `docker compose exec backend pytest apps/inventory/tests/test_api.py -k equipment_type -v`
Expected: FAIL (el filtro aún no existe; `test_filter_by_equipment_type` devuelve 3 resultados y `test_invalid...` devuelve 200).

- [ ] **Step 3: Implementar el filtro**

En `backend/apps/inventory/views.py`, dentro de `ProductViewSet.get_queryset`, justo después del bloque `if category:` y antes de `return qs`:

```python
        equipment_type = params.get("equipment_type")
        if equipment_type:
            try:
                qs = qs.filter(
                    compatible_equipment_types__id=int(equipment_type)
                ).distinct()
            except (TypeError, ValueError):
                raise ValidationError(
                    {"equipment_type": "Debe ser un id numérico."}
                )
        return qs
```

(El `return qs` existente se reemplaza por el de arriba; no dejar dos `return`.)

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `docker compose exec backend pytest apps/inventory/tests/test_api.py -k equipment_type -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Correr la suite de inventario completa (no romper nada)**

Run: `docker compose exec backend pytest apps/inventory/tests/test_api.py -v`
Expected: PASS (todos).

- [ ] **Step 6: Commit**

```bash
git add backend/apps/inventory/views.py backend/apps/inventory/tests/test_api.py
git commit -m "feat(inventory): filtra productos por equipment_type compatible

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Backend — exponer el modelo del equipo en la orden

**Files:**
- Modify: `backend/apps/service_orders/serializers.py` (`ServiceOrderSerializer`, ~líneas 64-104)
- Test: `backend/apps/service_orders/tests/test_api.py` (agregar al final)

**Interfaces:**
- Produces: `GET /api/service-orders/{id}/` incluye `equipment_type` (int | null) y `equipment_type_name` (str | null), tomados del equipo de la orden.

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `backend/apps/service_orders/tests/test_api.py`:

```python
@pytest.mark.django_db
def test_order_exposes_equipment_type(tech_client, customer):
    etype = EquipmentType.objects.create(name="Agras T50")
    eq = Equipment.objects.create(
        name="Dron 1", customer=customer, equipment_type=etype
    )
    o = ServiceOrder.objects.create(customer=customer, equipment=eq)
    resp = tech_client.get(f"/api/service-orders/{o.id}/")
    assert resp.status_code == 200
    assert resp.data["equipment_type"] == etype.id
    assert resp.data["equipment_type_name"] == "Agras T50"


@pytest.mark.django_db
def test_order_without_equipment_has_null_equipment_type(tech_client, customer):
    o = ServiceOrder.objects.create(customer=customer)
    resp = tech_client.get(f"/api/service-orders/{o.id}/")
    assert resp.status_code == 200
    assert resp.data["equipment_type"] is None
    assert resp.data["equipment_type_name"] is None
```

(`EquipmentType` y `Equipment` ya se importan en este archivo.)

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `docker compose exec backend pytest apps/service_orders/tests/test_api.py -k equipment_type -v`
Expected: FAIL con `KeyError: 'equipment_type'`.

- [ ] **Step 3: Implementar los campos en el serializer**

En `backend/apps/service_orders/serializers.py`, en `ServiceOrderSerializer`, junto a `equipment_name` (línea ~67) agregar:

```python
    equipment_type = serializers.IntegerField(
        source="equipment.equipment_type_id", read_only=True, allow_null=True
    )
    equipment_type_name = serializers.CharField(
        source="equipment.equipment_type.name", read_only=True, allow_null=True
    )
```

Y en `Meta.fields`, después de `"equipment_name",` agregar:

```python
            "equipment_type",
            "equipment_type_name",
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `docker compose exec backend pytest apps/service_orders/tests/test_api.py -k equipment_type -v`
Expected: PASS (2 tests).

Nota: DRF resuelve `source="equipment.equipment_type_id"` como `None` cuando `equipment` es null (no lanza excepción), por eso el caso sin equipo funciona.

- [ ] **Step 5: Correr la suite de órdenes completa**

Run: `docker compose exec backend pytest apps/service_orders/tests/test_api.py -v`
Expected: PASS (todos).

- [ ] **Step 6: Commit**

```bash
git add backend/apps/service_orders/serializers.py backend/apps/service_orders/tests/test_api.py
git commit -m "feat(service-orders): expone equipment_type y equipment_type_name en la orden

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Regenerar tipos OpenAPI

**Files:**
- Modify: `frontend/src/lib/api/schema.d.ts` (generado)

**Interfaces:**
- Consumes: los cambios de Task 1 y Task 2 ya mergeados en el backend en ejecución.
- Produces: `Schemas["ServiceOrder"]` incluye `equipment_type` y `equipment_type_name`; el schema queda regenerado para las Tasks 4 y 5.

- [ ] **Step 1: Asegurar que el backend esté corriendo y con el schema actualizado**

Run: `docker compose up -d backend`
Luego reiniciar para tomar los cambios de serializer (en Windows el bind-mount no siempre recarga solo):
Run: `docker compose restart backend`

- [ ] **Step 2: Regenerar los tipos**

Run: `docker compose exec frontend npx openapi-typescript http://backend:8000/api/schema/ -o src/lib/api/schema.d.ts`
Expected: escribe `src/lib/api/schema.d.ts` sin errores.

- [ ] **Step 3: Verificar que el nuevo campo aparece**

Run: `docker compose exec frontend grep -n equipment_type_name src/lib/api/schema.d.ts`
Expected: al menos una coincidencia dentro del schema de `ServiceOrder`.

- [ ] **Step 4: Typecheck del frontend (no debe romperse por la regeneración)**

Run: `docker compose exec frontend npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api/schema.d.ts
git commit -m "chore(api): regenera tipos OpenAPI con equipment_type en la orden

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Frontend — `AddPartModal` en cascada Modelo → Categoría → Pieza

**Files:**
- Modify: `frontend/src/features/inventory/api.ts` (`ProductListParams` + `useProducts`, líneas 7-34)
- Modify: `frontend/src/features/service-orders/AddPartModal.tsx` (reescritura)
- Modify: `frontend/src/features/service-orders/ServiceOrderDetailPage.tsx` (línea ~347, pasar props)
- Test: `frontend/src/features/service-orders/AddPartModal.test.tsx` (crear)

**Interfaces:**
- Consumes: `useEquipmentTypes()` → `{id:number,name:string}[]`; `useCategories()` → `{id:number,name:string}[]`; `useProducts({equipmentType?, pageSize?})` → `Paginated<Product>`; `useAddPart(orderId)` → `{mutateAsync, isPending}`; `Schemas["ServiceOrder"].equipment_type` / `.equipment_type_name`.
- Produces: `AddPartModal` acepta props `{opened, onClose, orderId, equipmentType, equipmentTypeName}`.

- [ ] **Step 1: Extender `useProducts` con el filtro de modelo**

En `frontend/src/features/inventory/api.ts`, en `ProductListParams` agregar el campo:

```typescript
export interface ProductListParams {
  search?: string;
  category?: number;
  equipmentType?: number;
  includeInactive?: boolean;
  page?: number;
  pageSize?: number;
}
```

Y dentro de `useProducts`, en el objeto `query`, agregar `equipment_type` (mismo patrón que `category`):

```typescript
        params: {
          query: {
            search: params.search || undefined,
            category: params.category,
            equipment_type: params.equipmentType,
            include_inactive: params.includeInactive ? "true" : undefined,
            page: params.page,
            page_size: params.pageSize,
          } as Record<string, unknown>,
        },
```

(El cast `as Record<string, unknown>` evita que TS rechace `equipment_type` si el schema no declara ese query param manual; sigue el espíritu del patrón `as unknown as never` ya usado en `service-orders/api.ts`.)

- [ ] **Step 2: Escribir el test que falla**

Crear `frontend/src/features/service-orders/AddPartModal.test.tsx`:

```tsx
import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AddPartModal } from "./AddPartModal";

const addMutate = vi.fn().mockResolvedValue({});

vi.mock("./api", () => ({
  useAddPart: () => ({ mutateAsync: addMutate, isPending: false }),
}));
vi.mock("../inventory/api", () => ({
  useProducts: () => ({
    data: {
      results: [
        { id: 10, sku: "IMP-1", name: "Impeller pump motor", category: 5 },
        { id: 20, sku: "MOT-1", name: "Motor brushless", category: 7 },
      ],
    },
  }),
  useCategories: () => ({
    data: [
      { id: 5, name: "Tanque de fumigación" },
      { id: 7, name: "Motor" },
    ],
  }),
}));
vi.mock("../equipment/api", () => ({
  useEquipmentTypes: () => ({
    data: [
      { id: 1, name: "Agras T50" },
      { id: 2, name: "Generador D12500" },
    ],
  }),
}));

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MantineProvider>
        <ModalsProvider>
          <Notifications />
          <AddPartModal
            opened
            onClose={vi.fn()}
            orderId={1}
            equipmentType={1}
            equipmentTypeName="Agras T50"
          />
        </ModalsProvider>
      </MantineProvider>
    </QueryClientProvider>,
  );
}

describe("AddPartModal", () => {
  it("preselecciona el modelo de la orden", () => {
    renderModal();
    expect(screen.getByDisplayValue("Agras T50")).toBeInTheDocument();
  });

  it("muestra chips de categoría derivados de las piezas del modelo", () => {
    renderModal();
    expect(
      screen.getByRole("checkbox", { name: "Tanque de fumigación" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Motor" })).toBeInTheDocument();
  });

  it("filtra las piezas al elegir una categoría", async () => {
    renderModal();
    fireEvent.click(screen.getByRole("checkbox", { name: "Tanque de fumigación" }));
    fireEvent.click(screen.getByLabelText("Pieza"));
    const options = await screen.findByRole("listbox");
    expect(within(options).getByText(/Impeller pump motor/)).toBeInTheDocument();
    expect(within(options).queryByText(/Motor brushless/)).not.toBeInTheDocument();
  });

  it("envía la pieza seleccionada", async () => {
    addMutate.mockClear();
    renderModal();
    fireEvent.click(screen.getByLabelText("Pieza"));
    const options = await screen.findByRole("listbox");
    fireEvent.click(within(options).getByText(/Impeller pump motor/));
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
    await vi.waitFor(() => expect(addMutate).toHaveBeenCalledTimes(1));
    expect(addMutate.mock.calls[0][0]).toMatchObject({ product: 10 });
  });
});
```

- [ ] **Step 3: Correr el test para verificar que falla**

Run: `docker compose exec frontend npx vitest run src/features/service-orders/AddPartModal.test.tsx`
Expected: FAIL (el componente actual no tiene chips ni prop `equipmentType`).

- [ ] **Step 4: Reescribir `AddPartModal`**

Reemplazar todo `frontend/src/features/service-orders/AddPartModal.tsx` por:

```tsx
import {
  Button,
  Chip,
  Grid,
  Group,
  Modal,
  NumberInput,
  Select,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEffect, useMemo, useState } from "react";

import { useEquipmentTypes } from "../equipment/api";
import { useCategories, useProducts } from "../inventory/api";
import { useAddPart } from "./api";

export function AddPartModal({
  opened,
  onClose,
  orderId,
  equipmentType,
  equipmentTypeName,
}: {
  opened: boolean;
  onClose: () => void;
  orderId: number;
  equipmentType?: number | null;
  equipmentTypeName?: string | null;
}) {
  const add = useAddPart(orderId);
  const types = useEquipmentTypes();
  const categories = useCategories();

  const [modelType, setModelType] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [product, setProduct] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<number | string>(1);
  const [unitPrice, setUnitPrice] = useState<number | string>("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (opened) {
      setModelType(equipmentType != null ? String(equipmentType) : null);
      setShowAll(false);
      setCategoryId(null);
      setProduct(null);
      setQuantity(1);
      setUnitPrice("");
      setNotes("");
    }
  }, [opened, equipmentType]);

  // Una sola consulta por modelo; categorías y piezas se filtran en memoria.
  const filterType = showAll || !modelType ? undefined : Number(modelType);
  const products = useProducts({ equipmentType: filterType, pageSize: 200 });
  const productList = products.data?.results ?? [];

  const categoryName = useMemo(() => {
    const map = new Map<number, string>();
    for (const c of categories.data ?? []) map.set(c.id, c.name);
    return map;
  }, [categories.data]);

  const categoryChips = useMemo(() => {
    const ids = new Set<number>();
    for (const p of productList) {
      if (p.category != null) ids.add(p.category as number);
    }
    return [...ids]
      .map((id) => ({ id, name: categoryName.get(id) ?? `#${id}` }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [productList, categoryName]);

  const filteredProducts = categoryId
    ? productList.filter((p) => String(p.category) === categoryId)
    : productList;

  const submit = async () => {
    if (!product) {
      notifications.show({ color: "red", message: "Selecciona una pieza." });
      return;
    }
    try {
      await add.mutateAsync({
        product: Number(product),
        quantity: String(quantity || 0),
        unit_price: unitPrice !== "" ? String(unitPrice) : undefined,
        notes,
      });
      notifications.show({ color: "green", message: "Pieza agregada." });
      onClose();
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Agregar pieza" size="lg">
      <Grid>
        <Grid.Col span={{ base: 12, sm: 8 }}>
          <Select
            label="Modelo"
            placeholder="Elige un modelo"
            data={(types.data ?? []).map((t) => ({
              value: String(t.id),
              label: t.name,
            }))}
            searchable
            clearable
            value={modelType}
            disabled={showAll}
            onChange={(v) => {
              setModelType(v);
              setCategoryId(null);
              setProduct(null);
            }}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 4 }} style={{ display: "flex", alignItems: "flex-end" }}>
          <Switch
            label="Ver todas las piezas"
            checked={showAll}
            onChange={(e) => {
              setShowAll(e.currentTarget.checked);
              setCategoryId(null);
              setProduct(null);
            }}
          />
        </Grid.Col>

        <Grid.Col span={12}>
          <Text size="sm" fw={500} mb={4}>
            Categoría
          </Text>
          {categoryChips.length === 0 ? (
            <Text size="sm" c="dimmed">
              {productList.length === 0
                ? equipmentTypeName
                  ? `No hay piezas etiquetadas para ${equipmentTypeName}. Activa “Ver todas las piezas”.`
                  : "Elige un modelo o activa “Ver todas las piezas”."
                : "Sin categorías."}
            </Text>
          ) : (
            <Chip.Group
              multiple={false}
              value={categoryId ?? ""}
              onChange={(v) => {
                setCategoryId((v as string) || null);
                setProduct(null);
              }}
            >
              <Group gap="xs">
                {categoryChips.map((c) => (
                  <Chip key={c.id} value={String(c.id)}>
                    {c.name}
                  </Chip>
                ))}
              </Group>
            </Chip.Group>
          )}
        </Grid.Col>

        <Grid.Col span={12}>
          <Select
            label="Pieza"
            withAsterisk
            placeholder="Busca la pieza"
            data={filteredProducts.map((p) => ({
              value: String(p.id),
              label: `${p.sku} · ${p.name}`,
            }))}
            searchable
            value={product}
            onChange={(v) => setProduct(v)}
          />
        </Grid.Col>

        <Grid.Col span={6}>
          <NumberInput
            label="Cantidad"
            min={0}
            decimalScale={2}
            value={quantity}
            onChange={(v) => setQuantity(v as number | string)}
          />
        </Grid.Col>
        <Grid.Col span={6}>
          <NumberInput
            label="Precio unitario (opcional)"
            min={0}
            decimalScale={2}
            value={unitPrice}
            onChange={(v) => setUnitPrice(v as number | string)}
          />
        </Grid.Col>
        <Grid.Col span={12}>
          <TextInput
            label="Notas"
            value={notes}
            onChange={(e) => setNotes(e.currentTarget.value)}
          />
        </Grid.Col>
      </Grid>
      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={submit} loading={add.isPending}>
          Agregar
        </Button>
      </Group>
    </Modal>
  );
}
```

- [ ] **Step 5: Pasar las props desde `ServiceOrderDetailPage`**

En `frontend/src/features/service-orders/ServiceOrderDetailPage.tsx`, línea ~347, reemplazar:

```tsx
        <AddPartModal opened={addOpen} onClose={closeAdd} orderId={orderId} />
```

por:

```tsx
        <AddPartModal
          opened={addOpen}
          onClose={closeAdd}
          orderId={orderId}
          equipmentType={order.equipment_type ?? null}
          equipmentTypeName={order.equipment_type_name ?? null}
        />
```

(`order` ya está disponible en ese punto — la misma variable se usa en `order.equipment_name` línea ~257.)

- [ ] **Step 6: Correr el test para verificar que pasa**

Run: `docker compose exec frontend npx vitest run src/features/service-orders/AddPartModal.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 7: Typecheck y lint**

Run: `docker compose exec frontend npm run typecheck`
Expected: PASS.
Run: `docker compose exec frontend npm run lint`
Expected: sin errores nuevos.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/inventory/api.ts frontend/src/features/service-orders/AddPartModal.tsx frontend/src/features/service-orders/ServiceOrderDetailPage.tsx frontend/src/features/service-orders/AddPartModal.test.tsx
git commit -m "feat(service-orders): menú de piezas en cascada Modelo→Categoría→Pieza

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Frontend — pulir la ficha de producto

**Files:**
- Modify: `frontend/src/features/inventory/ProductFormModal.tsx`
- Modify: `frontend/src/features/inventory/ProductFormModal.test.tsx`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: la ficha renombra "Equipos compatibles" → "Modelos compatibles" y elimina el textarea de texto libre `compatible_models` de la UI. El campo del modelo/BD se conserva (sin migración, para no perder datos).

- [ ] **Step 1: Escribir/ajustar el test que falla**

Reemplazar el cuerpo de `frontend/src/features/inventory/ProductFormModal.test.tsx` agregando un test que fija el comportamiento nuevo (mantener el test existente de "guardar sin SKU"):

```tsx
  it("etiqueta el multiselect como 'Modelos compatibles' y no muestra textarea de texto libre", () => {
    renderModal();
    expect(screen.getByLabelText("Modelos compatibles")).toBeInTheDocument();
    // El textarea redundante de texto libre ya no existe.
    expect(screen.queryByLabelText("Modelos compatibles (texto)")).toBeNull();
  });

  it("no envía compatible_models en el payload", async () => {
    saveMutate.mockClear();
    renderModal();
    fireEvent.change(screen.getByLabelText(/Nombre/), {
      target: { value: "P" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(saveMutate).toHaveBeenCalledTimes(1));
    expect(saveMutate.mock.calls[0][0]).not.toHaveProperty("compatible_models");
  });
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `docker compose exec frontend npx vitest run src/features/inventory/ProductFormModal.test.tsx`
Expected: FAIL (hoy el label es "Equipos compatibles" y el payload incluye `compatible_models`).

- [ ] **Step 3: Aplicar los cambios en `ProductFormModal.tsx`**

1. En `interface FormValues` (líneas 20-36) eliminar la línea `compatible_models: string;`.
2. En `EMPTY` (líneas 38-54) eliminar `compatible_models: "",`.
3. En `handleSubmit` (líneas 100-110) el spread `...values` ya no incluirá `compatible_models`, así que no hay que tocar el payload; **verificar** que ninguna línea referencia `compatible_models` explícitamente (no la hay).
4. En el `MultiSelect` (líneas 205-215) cambiar `label="Equipos compatibles"` por `label="Modelos compatibles"`.
5. Eliminar por completo el bloque del `Textarea` de "Modelos compatibles" (líneas 216-223):

```tsx
          <Grid.Col span={12}>
            <Textarea
              label="Modelos compatibles"
              autosize
              minRows={2}
              {...form.getInputProps("compatible_models")}
            />
          </Grid.Col>
```

6. Si tras quitar ese `Textarea` el import `Textarea` sólo se usa por el de "Descripción" (líneas 224-231), **mantener** el import (Descripción sigue usándolo). No quitar el import.

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `docker compose exec frontend npx vitest run src/features/inventory/ProductFormModal.test.tsx`
Expected: PASS (todos, incl. el de "guardar sin SKU").

- [ ] **Step 5: Typecheck y lint**

Run: `docker compose exec frontend npm run typecheck`
Expected: PASS.
Run: `docker compose exec frontend npm run lint`
Expected: sin errores nuevos.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/inventory/ProductFormModal.tsx frontend/src/features/inventory/ProductFormModal.test.tsx
git commit -m "refactor(inventory): renombra a 'Modelos compatibles' y quita textarea redundante

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Verificación final (end-to-end manual)

Tras las 5 tasks, con `docker compose up` corriendo:

1. En **Inventario**, editar un producto (ej. "Impeller pump motor"): asignar categoría "Tanque de fumigación" y en "Modelos compatibles" marcar "Agras T50". Guardar.
2. En **Órdenes de servicio**, abrir una orden cuyo equipo sea un Agras T50 → "Agregar pieza".
3. Verificar: el **Modelo** viene preseleccionado en "Agras T50"; aparece el chip **"Tanque de fumigación"**; al clickearlo, el selector **Pieza** muestra el impeller.
4. Activar **"Ver todas las piezas"** y confirmar que aparecen piezas de otros modelos.
5. Agregar la pieza y confirmar que se suma a la orden.

## Notas / decisiones

- **`compatible_models` (TextField en BD):** se conserva la columna; sólo se retira de la UI para evitar pérdida de datos y una migración. Si más adelante se confirma que nadie la usa, se puede eliminar en una migración de limpieza (fuera de alcance).
- **Trabajos de campo:** no se tocan; usan consumibles agroquímicos de texto libre, no repuestos por modelo.
