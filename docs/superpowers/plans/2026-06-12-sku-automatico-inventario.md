# SKU automático en inventario — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el SKU de un producto de inventario se genere automáticamente (`SKU-000042`) cuando el usuario lo deja vacío, manteniéndolo editable cuando quiera escribir uno manual.

**Architecture:** El formato del SKU vive en una sola función `generate_product_sku(pk)` en `inventory/services.py`. El `ProductSerializer` hace el campo `sku` opcional y, si llega vacío, inserta un valor temporal único, guarda, y reemplaza por el SKU correlativo basado en el `pk`. El módulo de compras se refactoriza para reutilizar esa misma función. El formulario del frontend deja de exigir el SKU.

**Tech Stack:** Django + Django REST Framework (backend, pytest), React + Mantine + Vitest/Testing Library (frontend).

---

## Contexto de patrones existentes

- Modelo: `backend/apps/inventory/models.py:22` → `sku = models.CharField(max_length=50, unique=True)`.
- Serializer actual: `backend/apps/inventory/serializers.py:23-44` (`ProductSerializer`, `Meta.fields = "__all__"`, `create()` ya llama a `apply_margin`).
- Generación duplicada hoy en compras: `backend/apps/purchasing/serializers.py:23-35`.
- Tests backend API inventario: `backend/apps/inventory/tests/test_api.py` (usa `inv_client` fixture y `/api/inventory/products/`).
- Tests serializer inventario: `backend/apps/inventory/tests/test_serializers.py`.
- Tests compras nuevo producto: `backend/apps/purchasing/tests/test_new_product.py`.
- Formulario: `frontend/src/features/inventory/ProductFormModal.tsx`.
- Test frontend inventario: `frontend/src/features/inventory/inventory.test.tsx`.

Comando de tests backend (desde la raíz del repo, el backend corre en Docker):
`docker compose exec backend pytest <ruta>::<test> -v`
Comando de tests frontend (en `frontend/`): `npm run test -- <archivo>`

---

## Task 1: Función `generate_product_sku` en inventory/services.py

**Files:**
- Modify: `backend/apps/inventory/services.py` (añadir función al final, antes o después de las existentes)
- Test: `backend/apps/inventory/tests/test_services.py`

- [ ] **Step 1: Escribir el test que falla**

Añadir al final de `backend/apps/inventory/tests/test_services.py`:

```python
def test_generate_product_sku_formats_pk_with_prefix_and_padding():
    from apps.inventory.services import generate_product_sku

    assert generate_product_sku(42) == "SKU-000042"
    assert generate_product_sku(1) == "SKU-000001"
    assert generate_product_sku(1234567) == "SKU-1234567"
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `docker compose exec backend pytest apps/inventory/tests/test_services.py::test_generate_product_sku_formats_pk_with_prefix_and_padding -v`
Expected: FAIL con `ImportError: cannot import name 'generate_product_sku'`.

- [ ] **Step 3: Implementar la función**

Añadir en `backend/apps/inventory/services.py` (p. ej. justo después del bloque de imports/constantes, antes de `effective_margin`):

```python
def generate_product_sku(pk):
    """SKU autogenerado: prefijo fijo + pk con relleno de ceros a 6 dígitos."""
    return f"SKU-{pk:06d}"
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `docker compose exec backend pytest apps/inventory/tests/test_services.py::test_generate_product_sku_formats_pk_with_prefix_and_padding -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/inventory/services.py backend/apps/inventory/tests/test_services.py
git commit -m "feat(inventory): generate_product_sku como fuente unica del formato de SKU"
```

---

## Task 2: ProductSerializer autogenera el SKU si viene vacío

**Files:**
- Modify: `backend/apps/inventory/serializers.py` (`ProductSerializer`, líneas 23-44)
- Test: `backend/apps/inventory/tests/test_api.py`

- [ ] **Step 1: Escribir los tests que fallan**

Añadir al final de `backend/apps/inventory/tests/test_api.py`:

```python
@pytest.mark.django_db
def test_create_product_without_sku_autogenerates(inv_client):
    resp = inv_client.post(
        "/api/inventory/products/", {"name": "Sin SKU"}, format="json"
    )
    assert resp.status_code == 201, resp.content
    product = Product.objects.get(name="Sin SKU")
    assert resp.data["sku"] == f"SKU-{product.pk:06d}"


@pytest.mark.django_db
def test_create_product_with_manual_sku_is_respected(inv_client):
    resp = inv_client.post(
        "/api/inventory/products/",
        {"sku": "MANUAL-9", "name": "Con SKU"},
        format="json",
    )
    assert resp.status_code == 201, resp.content
    assert resp.data["sku"] == "MANUAL-9"


@pytest.mark.django_db
def test_create_two_products_without_sku_get_distinct_skus(inv_client):
    r1 = inv_client.post(
        "/api/inventory/products/", {"name": "Uno sin SKU"}, format="json"
    )
    r2 = inv_client.post(
        "/api/inventory/products/", {"name": "Dos sin SKU"}, format="json"
    )
    assert r1.status_code == 201 and r2.status_code == 201
    assert r1.data["sku"] != r2.data["sku"]
    assert r1.data["sku"].startswith("SKU-")
    assert r2.data["sku"].startswith("SKU-")


@pytest.mark.django_db
def test_create_product_with_duplicate_sku_returns_400(inv_client):
    Product.objects.create(sku="DUP-1", name="Existente")
    resp = inv_client.post(
        "/api/inventory/products/",
        {"sku": "DUP-1", "name": "Repetido"},
        format="json",
    )
    assert resp.status_code == 400
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `docker compose exec backend pytest apps/inventory/tests/test_api.py -k "without_sku or manual_sku or distinct_skus or duplicate_sku" -v`
Expected: FAIL. `test_create_product_without_sku_autogenerates` y los `distinct` fallan con 400 (`sku: This field is required.`); los demás pueden variar.

- [ ] **Step 3: Implementar el cambio en el serializer**

En `backend/apps/inventory/serializers.py`, reemplazar el bloque de imports superior y la clase `ProductSerializer` (líneas 1-44) por:

```python
import uuid

from rest_framework import serializers
from rest_framework.validators import UniqueValidator

from .models import InventoryMovement, Product, ProductCategory
from .services import apply_adjustment, generate_product_sku


class ProductCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductCategory
        fields = ("id", "name", "is_active", "default_margin_percentage")
        read_only_fields = ("id",)

    def update(self, instance, validated_data):
        old = instance.default_margin_percentage
        category = super().update(instance, validated_data)
        if category.default_margin_percentage != old:
            from .services import apply_category_margin

            apply_category_margin(category)
        return category


class ProductSerializer(serializers.ModelSerializer):
    available_quantity = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True
    )
    # Opcional: si llega vacío se autogenera en create(). El UniqueValidator
    # preserva el rechazo (400) de SKUs manuales duplicados que daba __all__.
    sku = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=50,
        validators=[UniqueValidator(queryset=Product.objects.all())],
    )

    class Meta:
        model = Product
        fields = "__all__"
        read_only_fields = (
            "id",
            "created_at",
            "updated_at",
            "stock_quantity",
            "reserved_quantity",
        )

    def create(self, validated_data):
        provided_sku = (validated_data.get("sku") or "").strip()
        if not provided_sku:
            # Valor temporal único para no violar unique en la inserción;
            # se reemplaza por el correlativo una vez conocido el pk.
            validated_data["sku"] = f"TMP-{uuid.uuid4().hex[:12]}"
        product = super().create(validated_data)
        if not provided_sku:
            product.sku = generate_product_sku(product.pk)
            product.save(update_fields=["sku"])
        from .services import apply_margin

        apply_margin(product)
        return product

    def update(self, instance, validated_data):
        old_margin = instance.default_margin_percentage
        old_category = instance.category_id
        product = super().update(instance, validated_data)
        # El precio depende del margen efectivo: cambia con el margen del producto
        # o con su categoría. Recalcular si cambió cualquiera de los dos.
        if (
            product.default_margin_percentage != old_margin
            or product.category_id != old_category
        ):
            from .services import apply_margin

            apply_margin(product)
        return product
```

(El resto del archivo —`InventoryMovementSerializer`, `AdjustmentSerializer`— queda igual.)

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `docker compose exec backend pytest apps/inventory/tests/test_api.py apps/inventory/tests/test_serializers.py -v`
Expected: PASS (incluidos los 4 nuevos y los existentes como `test_create_product` y `test_product_serializer_stock_is_read_only`).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/inventory/serializers.py backend/apps/inventory/tests/test_api.py
git commit -m "feat(inventory): autogenerar SKU cuando el campo viene vacio"
```

---

## Task 3: Compras reutiliza generate_product_sku (refactor sin cambio de comportamiento)

**Files:**
- Modify: `backend/apps/purchasing/serializers.py:23-35` (`create_product_from_payload`)
- Test: `backend/apps/purchasing/tests/test_new_product.py` (ya existe `test_create_po_with_new_product`)

- [ ] **Step 1: Fortalecer el test existente para fijar el formato**

En `backend/apps/purchasing/tests/test_new_product.py`, dentro de `test_create_po_with_new_product`, reemplazar la línea:

```python
    assert product.sku  # autogenerado
```

por:

```python
    assert product.sku == f"SKU-{product.pk:06d}"  # autogenerado, formato compartido
```

- [ ] **Step 2: Correr el test y verificar que pasa (aún con el literal viejo)**

Run: `docker compose exec backend pytest apps/purchasing/tests/test_new_product.py::test_create_po_with_new_product -v`
Expected: PASS (el formato ya coincide; este paso fija la expectativa antes del refactor).

- [ ] **Step 3: Refactorizar para usar la función compartida**

En `backend/apps/purchasing/serializers.py`, cambiar el import y la función:

Import (línea 6), añadir `generate_product_sku`:

```python
from apps.inventory.models import Product, ProductCategory
from apps.inventory.services import generate_product_sku
```

Función `create_product_from_payload` (líneas 23-35), reemplazar el cuerpo por:

```python
def create_product_from_payload(data):
    """Crea un Product mínimo desde {name, category?, sku?, unit_of_measure?}."""
    sku = (data.get("sku") or "").strip()
    product = Product.objects.create(
        name=data["name"],
        category=data.get("category"),
        sku=sku or f"TMP-{uuid.uuid4().hex[:12]}",
        unit_of_measure=data.get("unit_of_measure", "") or "",
    )
    if not sku:
        product.sku = generate_product_sku(product.pk)
        product.save(update_fields=["sku"])
    return product
```

(El `import uuid` de la línea 1 se conserva: se sigue usando para el valor temporal.)

- [ ] **Step 4: Correr los tests de compras y verificar que pasan**

Run: `docker compose exec backend pytest apps/purchasing/tests/test_new_product.py -v`
Expected: PASS (los 5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/purchasing/serializers.py backend/apps/purchasing/tests/test_new_product.py
git commit -m "refactor(purchasing): reutilizar generate_product_sku del inventario"
```

---

## Task 4: Formulario de inventario deja de exigir el SKU

**Files:**
- Modify: `frontend/src/features/inventory/ProductFormModal.tsx` (líneas 71-77 y 134)
- Test: `frontend/src/features/inventory/ProductFormModal.test.tsx` (nuevo)

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/features/inventory/ProductFormModal.test.tsx`:

```tsx
import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProductFormModal } from "./ProductFormModal";

const saveMutate = vi.fn().mockResolvedValue({});
vi.mock("./api", () => ({
  useSaveProduct: () => ({ mutateAsync: saveMutate, isPending: false }),
  useCategories: () => ({ data: [] }),
  useSupplierOptions: () => ({ data: [] }),
}));
vi.mock("../equipment/api", () => ({
  useEquipmentTypes: () => ({ data: [] }),
}));

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MantineProvider>
        <ModalsProvider>
          <Notifications />
          <ProductFormModal opened onClose={vi.fn()} product={null} />
        </ModalsProvider>
      </MantineProvider>
    </QueryClientProvider>,
  );
}

describe("ProductFormModal", () => {
  it("permite guardar sin SKU (se autogenera en el backend)", async () => {
    saveMutate.mockClear();
    renderModal();
    fireEvent.change(screen.getByLabelText("Nombre"), {
      target: { value: "Producto sin SKU" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(saveMutate).toHaveBeenCalledTimes(1));
    expect(saveMutate.mock.calls[0][0]).toMatchObject({
      name: "Producto sin SKU",
      sku: "",
    });
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run (en `frontend/`): `npm run test -- src/features/inventory/ProductFormModal.test.tsx`
Expected: FAIL — `saveMutate` no se llama porque la validación actual bloquea el submit con "El SKU es obligatorio.".

- [ ] **Step 3: Implementar el cambio en el formulario**

En `frontend/src/features/inventory/ProductFormModal.tsx`:

a) En `useForm` (líneas 71-77), quitar la regla de `sku`. Reemplazar:

```tsx
  const form = useForm<FormValues>({
    initialValues: EMPTY,
    validate: {
      sku: (v) => (v.trim() ? null : "El SKU es obligatorio."),
      name: (v) => (v.trim() ? null : "El nombre es obligatorio."),
    },
  });
```

por:

```tsx
  const form = useForm<FormValues>({
    initialValues: EMPTY,
    validate: {
      name: (v) => (v.trim() ? null : "El nombre es obligatorio."),
    },
  });
```

b) En el `TextInput` del SKU (línea 134), quitar `withAsterisk` y añadir placeholder. Reemplazar:

```tsx
            <TextInput label="SKU" withAsterisk {...form.getInputProps("sku")} />
```

por:

```tsx
            <TextInput
              label="SKU"
              placeholder="Déjalo vacío para generar automáticamente"
              {...form.getInputProps("sku")}
            />
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run (en `frontend/`): `npm run test -- src/features/inventory/ProductFormModal.test.tsx`
Expected: PASS.

- [ ] **Step 5: Verificar typecheck y test suite de inventario**

Run (en `frontend/`): `npm run test -- src/features/inventory` y luego el typecheck del proyecto (p. ej. `npm run build` o `npx tsc --noEmit`, según el script disponible en `package.json`).
Expected: sin errores; `inventory.test.tsx` sigue verde.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/inventory/ProductFormModal.tsx frontend/src/features/inventory/ProductFormModal.test.tsx
git commit -m "feat(inventory): SKU opcional en el formulario de producto"
```

---

## Task 5: Verificación final de la suite completa

- [ ] **Step 1: Correr toda la suite de backend de inventario y compras**

Run: `docker compose exec backend pytest apps/inventory apps/purchasing -v`
Expected: PASS (sin regresiones).

- [ ] **Step 2: Correr toda la suite de frontend de inventario**

Run (en `frontend/`): `npm run test -- src/features/inventory`
Expected: PASS.

- [ ] **Step 3: Verificación manual rápida (opcional pero recomendada)**

Levantar el frontend, abrir "Nuevo producto", dejar el SKU vacío, completar Nombre y guardar. Confirmar que el producto aparece en la lista con un SKU `SKU-NNNNNN`. Crear otro escribiendo un SKU manual y confirmar que se respeta.

---

## Self-Review (cobertura del spec)

- "SKU opcional, autogenera si vacío" → Task 2.
- "Formato `SKU-000042` como fuente única" → Task 1 (función) + Task 2/3 (uso).
- "SKU manual se respeta" → Task 2 (`test_create_product_with_manual_sku_is_respected`).
- "Unicidad / duplicado rechazado 400" → Task 2 (`UniqueValidator` + `test_create_product_with_duplicate_sku_returns_400`).
- "Refactor de compras a la función compartida" → Task 3.
- "Frontend: sin obligatorio + placeholder" → Task 4.
- "Sin migración / modelo intacto" → ninguna tarea toca `models.py`. Correcto.
- Fuera de alcance (regenerar al vaciar en edición, prefijos por categoría, import/export) → no hay tareas. Correcto.
