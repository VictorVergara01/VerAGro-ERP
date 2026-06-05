# Rediseño compras → inventario — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mover el margen de ganancia de la orden de compra a Inventario (producto/categoría), permitir dar de alta productos nuevos desde la OC, y registrar la relación proveedor↔producto al recibir.

**Architecture:** Backend Django: nuevo campo de margen en `ProductCategory`; helpers `effective_margin`/`apply_margin`/`apply_category_margin` en `inventory.services`; `recalculate_costs` deja de calcular precio; `receive_lines` deriva `sale_price` del margen de inventario y hace `update_or_create` de `SupplierProduct` (+ `main_supplier`); el serializer de la OC acepta producto existente **o** `new_product`. Web y móvil ajustan los formularios de OC y la config de margen por categoría.

**Tech Stack:** Django+DRF+pytest (en contenedor `backend`); React/Mantine (web, vitest); RN/Expo (móvil, typecheck). Commits en español, trailer `Co-Authored-By: Claude Opus 4.8`.

**Spec:** `docs/superpowers/specs/2026-06-05-rediseno-compras-inventario-design.md`

Comandos backend desde la raíz del repo; web desde `frontend/`; móvil desde `mobile/`.

---

## FASE 1 — Backend

### Task 1: Inventario — margen por categoría + helpers de margen

**Files:**
- Modify: `backend/apps/inventory/models.py` (ProductCategory)
- Create migration: `backend/apps/inventory/migrations/000X_category_margin.py` (via makemigrations)
- Modify: `backend/apps/inventory/services.py`
- Modify: `backend/apps/inventory/serializers.py`
- Test: `backend/apps/inventory/tests/test_margin.py` (nuevo)

- [ ] **Step 1: Test de los helpers (falla: no existen)**

Crear `backend/apps/inventory/tests/test_margin.py`:

```python
from decimal import Decimal

import pytest

from apps.inventory.models import Product, ProductCategory
from apps.inventory.services import apply_category_margin, apply_margin, effective_margin


@pytest.mark.django_db
def test_effective_margin_product_over_category():
    cat = ProductCategory.objects.create(name="Filtros", default_margin_percentage=Decimal("10"))
    p = Product.objects.create(sku="A1", name="Filtro", category=cat, default_margin_percentage=Decimal("25"))
    assert effective_margin(p) == Decimal("25")


@pytest.mark.django_db
def test_effective_margin_falls_back_to_category():
    cat = ProductCategory.objects.create(name="Filtros", default_margin_percentage=Decimal("10"))
    p = Product.objects.create(sku="A2", name="Filtro", category=cat)  # margin 0
    assert effective_margin(p) == Decimal("10")


@pytest.mark.django_db
def test_effective_margin_zero_when_none():
    p = Product.objects.create(sku="A3", name="Pieza")
    assert effective_margin(p) == Decimal("0")


@pytest.mark.django_db
def test_apply_margin_uses_average_cost():
    p = Product.objects.create(
        sku="A4", name="Pieza", average_cost=Decimal("100"), default_margin_percentage=Decimal("30")
    )
    apply_margin(p)
    p.refresh_from_db()
    assert p.sale_price == Decimal("130.00")


@pytest.mark.django_db
def test_apply_category_margin_only_products_without_own_margin():
    cat = ProductCategory.objects.create(name="X", default_margin_percentage=Decimal("20"))
    a = Product.objects.create(sku="B1", name="A", category=cat, average_cost=Decimal("50"))
    b = Product.objects.create(
        sku="B2", name="B", category=cat, average_cost=Decimal("50"),
        default_margin_percentage=Decimal("100"),
    )
    apply_category_margin(cat)
    a.refresh_from_db(); b.refresh_from_db()
    assert a.sale_price == Decimal("60.00")   # 50 * 1.20 (margen de categoría)
    assert b.sale_price == Decimal("0.00")    # tiene margen propio → no lo toca aquí
```

- [ ] **Step 2: Añadir el campo al modelo**

En `ProductCategory` (`inventory/models.py`), tras `is_active`:
```python
    default_margin_percentage = models.DecimalField(
        max_digits=12, decimal_places=2, default=0
    )
```

- [ ] **Step 3: Migración**

Run: `docker compose exec -T backend python manage.py makemigrations inventory`
Expected: crea la migración con `default_margin_percentage`.

- [ ] **Step 4: Helpers en `inventory/services.py`**

Añadir al inicio (tras los imports y `ADJUSTMENT_TYPES`):
```python
from decimal import ROUND_HALF_UP

_CENT = Decimal("0.01")


def _q(value):
    return Decimal(value).quantize(_CENT, rounding=ROUND_HALF_UP)


def effective_margin(product):
    """Margen efectivo: el del producto si > 0; si no, el de su categoría; si ninguno, 0."""
    if product.default_margin_percentage and product.default_margin_percentage > 0:
        return product.default_margin_percentage
    category = product.category
    if category and category.default_margin_percentage and category.default_margin_percentage > 0:
        return category.default_margin_percentage
    return Decimal("0")


def apply_margin(product):
    """Recalcula sale_price = average_cost * (1 + margen efectivo / 100) y guarda."""
    margin = effective_margin(product)
    product.sale_price = _q(product.average_cost * (Decimal("1") + margin / Decimal("100")))
    product.save(update_fields=["sale_price", "updated_at"])
    return product


def apply_category_margin(category):
    """Recalcula el precio de los productos de la categoría que NO tienen margen propio."""
    for product in category.products.filter(default_margin_percentage=0):
        apply_margin(product)
```

(`from decimal import Decimal` ya está importado; añadir `ROUND_HALF_UP` al import existente o usar la línea de arriba.)

- [ ] **Step 5: Exponer el margen de categoría + hooks de recálculo en serializers**

En `inventory/serializers.py`:

`ProductCategorySerializer`: añadir el campo y un `update` que recalcula al cambiar el margen:
```python
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
```

`ProductSerializer`: añadir un `update` que recalcula al cambiar el margen del producto:
```python
    def update(self, instance, validated_data):
        old = instance.default_margin_percentage
        product = super().update(instance, validated_data)
        if product.default_margin_percentage != old:
            from .services import apply_margin
            apply_margin(product)
        return product
```
(Nota: si el margen cambia, `apply_margin` sobrescribe `sale_price` con `average_cost × margen`; si no cambia, el `sale_price` manual del payload se respeta.)

- [ ] **Step 6: Correr tests**

Run: `docker compose exec -T backend pytest apps/inventory/tests/test_margin.py -q`
Expected: PASS (5 tests).

- [ ] **Step 7: Commit**

```bash
git add backend/apps/inventory/models.py backend/apps/inventory/migrations/ backend/apps/inventory/services.py backend/apps/inventory/serializers.py backend/apps/inventory/tests/test_margin.py
git commit -m "feat(inventory): margen por categoria + recalculo de precio (effective_margin/apply_margin)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Compras — quitar margen de la línea + recalcular sin margen

**Files:**
- Modify: `backend/apps/purchasing/models.py` (PurchaseOrderLine)
- Create migration: `backend/apps/purchasing/migrations/000X_drop_line_margin.py`
- Modify: `backend/apps/purchasing/services.py` (recalculate_costs)
- Modify: `backend/apps/purchasing/serializers.py` (PurchaseOrderLineSerializer)
- Modify: tests existentes en `backend/apps/purchasing/tests/` que referencian los campos quitados

- [ ] **Step 1: Quitar los 3 campos del modelo**

En `PurchaseOrderLine` (`purchasing/models.py`), **eliminar** las líneas:
```python
    margin_percentage = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    calculated_sale_price = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    final_sale_price = models.DecimalField(max_digits=14, decimal_places=2, default=0)
```
Dejar `landed_unit_cost`, `line_subtotal`, `allocated_extra_cost`, etc.

- [ ] **Step 2: Migración**

Run: `docker compose exec -T backend python manage.py makemigrations purchasing`
Expected: migración que elimina los 3 campos (`RemoveField` x3).

- [ ] **Step 3: `recalculate_costs` sin margen**

En `purchasing/services.py`, dentro del loop de líneas, **eliminar**:
```python
        margin_factor = Decimal("1") + (line.margin_percentage / Decimal("100"))
        line.calculated_sale_price = _q(line.landed_unit_cost * margin_factor)
        if line.final_sale_price == 0:
            line.final_sale_price = line.calculated_sale_price
```
y en `line.save(update_fields=[...])` quitar `"calculated_sale_price"` y `"final_sale_price"`, dejando:
```python
        line.save(
            update_fields=[
                "line_subtotal",
                "allocated_extra_cost",
                "landed_unit_cost",
                "updated_at",
            ]
        )
```

- [ ] **Step 4: Serializer de línea sin esos campos**

En `PurchaseOrderLineSerializer` (`purchasing/serializers.py`):
- Quitar de `fields`: `"margin_percentage"`, `"calculated_sale_price"`, `"final_sale_price"`.
- Quitar de `read_only_fields`: `"calculated_sale_price"`.
- Eliminar el método `validate` (que ponía `margin_percentage` desde el producto).
- Hacer `product` opcional (preparado para Task 4): en `extra_kwargs` añadir
  `"product": {"required": False, "allow_null": True}`.

- [ ] **Step 5: Arreglar tests existentes que usan los campos quitados**

Run para localizarlos: `docker compose exec -T backend grep -rln "margin_percentage\|calculated_sale_price\|final_sale_price" apps/purchasing/tests`
En cada test: quitar las aserciones/inputs de `margin_percentage`/`calculated_sale_price`/`final_sale_price`
de las líneas de OC. (El costeo del ejemplo doc §5.6 se mantiene para `landed_unit_cost`; el precio de
venta ya no se valida en compras — eso se prueba en `receive_lines`, Task 3.)

- [ ] **Step 6: Correr la suite de compras**

Run: `docker compose exec -T backend pytest apps/purchasing -q`
Expected: PASS (tras ajustar los tests).

- [ ] **Step 7: Commit**

```bash
git add backend/apps/purchasing/models.py backend/apps/purchasing/migrations/ backend/apps/purchasing/services.py backend/apps/purchasing/serializers.py backend/apps/purchasing/tests/
git commit -m "feat(purchasing): quitar margen/precio de la linea de OC (margen pasa a inventario)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Recepción — precio desde inventario + proveedor↔producto

**Files:**
- Modify: `backend/apps/purchasing/services.py` (receive_lines)
- Test: `backend/apps/purchasing/tests/test_receive_redesign.py` (nuevo)

- [ ] **Step 1: Test (falla)**

Crear `backend/apps/purchasing/tests/test_receive_redesign.py`:

```python
from decimal import Decimal

import pytest

from apps.inventory.models import Product, ProductCategory
from apps.purchasing.models import PurchaseOrder, PurchaseOrderLine
from apps.purchasing.services import receive_lines
from apps.suppliers.models import Supplier, SupplierProduct


@pytest.fixture
def order(db):
    cat = ProductCategory.objects.create(name="Cat", default_margin_percentage=Decimal("20"))
    supplier = Supplier.objects.create(name="Prov")
    product = Product.objects.create(sku="P1", name="Pieza", category=cat)  # sin margen propio
    po = PurchaseOrder.objects.create(supplier=supplier, status=PurchaseOrder.Status.SENT)
    line = PurchaseOrderLine.objects.create(
        purchase_order=po, product=product,
        quantity_ordered=Decimal("10"), unit_purchase_cost=Decimal("5"),
    )
    return po, line, product, supplier


@pytest.mark.django_db
def test_receive_sets_sale_price_from_inventory_margin(order):
    po, line, product, supplier = order
    receive_lines(purchase_order=po, receipts=[{"line": line.id, "quantity": Decimal("10")}])
    product.refresh_from_db()
    assert product.stock_quantity == Decimal("10.00")
    # landed = 5 (sin costos extra); margen de categoría 20% → 6.00
    assert product.sale_price == Decimal("6.00")


@pytest.mark.django_db
def test_receive_creates_supplier_product_and_main_supplier(order):
    po, line, product, supplier = order
    receive_lines(purchase_order=po, receipts=[{"line": line.id, "quantity": Decimal("10")}])
    sp = SupplierProduct.objects.get(supplier=supplier, product=product)
    assert sp.last_cost == Decimal("5.00")
    product.refresh_from_db()
    assert product.main_supplier_id == supplier.id


@pytest.mark.django_db
def test_receive_does_not_override_existing_main_supplier(order):
    po, line, product, supplier = order
    other = Supplier.objects.create(name="Otro")
    product.main_supplier = other
    product.save(update_fields=["main_supplier"])
    receive_lines(purchase_order=po, receipts=[{"line": line.id, "quantity": Decimal("10")}])
    product.refresh_from_db()
    assert product.main_supplier_id == other.id  # no se pisa
```

- [ ] **Step 2: Run (falla)**

Run: `docker compose exec -T backend pytest apps/purchasing/tests/test_receive_redesign.py -q`
Expected: FAIL (sale_price viejo / SupplierProduct no existe / main_supplier None).

- [ ] **Step 3: Implementar en `receive_lines`**

En `purchasing/services.py`, importar el helper:
```python
from apps.inventory.services import effective_margin
```
Dentro del loop `for line, quantity in parsed:`, **reemplazar**:
```python
        product.last_purchase_cost = _q(cost)
        product.sale_price = line.final_sale_price
        product.save(
            update_fields=[
                "stock_quantity",
                "average_cost",
                "last_purchase_cost",
                "sale_price",
                "updated_at",
            ]
        )
```
por:
```python
        product.last_purchase_cost = _q(cost)
        margin = effective_margin(product)
        product.sale_price = _q(cost * (Decimal("1") + margin / Decimal("100")))
        if product.main_supplier_id is None:
            product.main_supplier_id = purchase_order.supplier_id
        product.save(
            update_fields=[
                "stock_quantity",
                "average_cost",
                "last_purchase_cost",
                "sale_price",
                "main_supplier",
                "updated_at",
            ]
        )
```
y **reemplazar** el bloque de SupplierProduct:
```python
        SupplierProduct.objects.filter(
            supplier=purchase_order.supplier_id, product=line.product_id
        ).update(last_cost=line.unit_purchase_cost)
```
por:
```python
        SupplierProduct.objects.update_or_create(
            supplier_id=purchase_order.supplier_id,
            product_id=line.product_id,
            defaults={"last_cost": line.unit_purchase_cost},
        )
```

- [ ] **Step 4: Run (pasa)**

Run: `docker compose exec -T backend pytest apps/purchasing/tests/test_receive_redesign.py -q`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/purchasing/services.py backend/apps/purchasing/tests/test_receive_redesign.py
git commit -m "feat(purchasing): al recibir, precio desde margen de inventario + registra proveedor-producto

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Alta de producto nuevo desde la OC

**Files:**
- Modify: `backend/apps/purchasing/serializers.py`
- Test: `backend/apps/purchasing/tests/test_new_product.py` (nuevo)

- [ ] **Step 1: Test (falla)**

Crear `backend/apps/purchasing/tests/test_new_product.py`:

```python
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.inventory.models import Product, ProductCategory
from apps.suppliers.models import Supplier

User = get_user_model()


def _client():
    user = User.objects.create_user(email="inv@veragro.com", password="x", full_name="i", role="inventory")
    c = APIClient(); c.force_authenticate(user=user); return c


@pytest.mark.django_db
def test_create_po_with_new_product():
    supplier = Supplier.objects.create(name="Prov")
    cat = ProductCategory.objects.create(name="Cat")
    payload = {
        "supplier": supplier.id,
        "lines": [
            {"new_product": {"name": "Filtro nuevo", "category": cat.id},
             "quantity_ordered": "4", "unit_purchase_cost": "12"},
        ],
    }
    resp = _client().post("/api/purchase-orders/", payload, format="json")
    assert resp.status_code == 201, resp.content
    assert Product.objects.filter(name="Filtro nuevo").exists()
    product = Product.objects.get(name="Filtro nuevo")
    assert product.stock_quantity == 0
    assert product.sku  # autogenerado
    line = resp.data["lines"][0]
    assert line["product"] == product.id


@pytest.mark.django_db
def test_create_po_line_requires_product_or_new_product():
    supplier = Supplier.objects.create(name="Prov")
    payload = {"supplier": supplier.id, "lines": [{"quantity_ordered": "1", "unit_purchase_cost": "1"}]}
    resp = _client().post("/api/purchase-orders/", payload, format="json")
    assert resp.status_code == 400
```

- [ ] **Step 2: Run (falla)**

Run: `docker compose exec -T backend pytest apps/purchasing/tests/test_new_product.py -q`
Expected: FAIL.

- [ ] **Step 3: Implementar `new_product` en el serializer**

En `purchasing/serializers.py`, añadir un serializer de producto nuevo y la lógica:

```python
from apps.inventory.models import Product, ProductCategory


class NewProductSerializer(serializers.Serializer):
    name = serializers.CharField()
    category = serializers.PrimaryKeyRelatedField(
        queryset=ProductCategory.objects.all(), required=False, allow_null=True
    )
    sku = serializers.CharField(required=False, allow_blank=True)
    unit_of_measure = serializers.CharField(required=False, allow_blank=True)


def create_product_from_payload(data):
    """Crea un Product mínimo desde {name, category?, sku?, unit_of_measure?}."""
    product = Product.objects.create(
        name=data["name"],
        category=data.get("category"),
        sku=(data.get("sku") or "").strip() or f"TMP-{Product.objects.count() + 1}",
        unit_of_measure=data.get("unit_of_measure", "") or "",
    )
    if not (data.get("sku") or "").strip():
        product.sku = f"SKU-{product.pk:06d}"
        product.save(update_fields=["sku"])
    return product
```

En `PurchaseOrderLineSerializer`, añadir el campo write-only:
```python
    new_product = NewProductSerializer(write_only=True, required=False)
```
(añadir `"new_product"` a `fields`), y validar XOR:
```python
    def validate(self, attrs):
        if attrs.get("product") is None and not attrs.get("new_product"):
            raise serializers.ValidationError(
                "Cada línea requiere un producto existente o uno nuevo (new_product)."
            )
        return attrs
```

En `PurchaseOrderSerializer.create`, dentro del loop de líneas, resolver el producto nuevo:
```python
        for line in lines_data:
            line.pop("purchase_order", None)
            new_product = line.pop("new_product", None)
            if line.get("product") is None and new_product:
                line["product"] = create_product_from_payload(new_product)
            PurchaseOrderLine.objects.create(purchase_order=order, **line)
```

- [ ] **Step 4: Run (pasa)**

Run: `docker compose exec -T backend pytest apps/purchasing/tests/test_new_product.py -q`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/purchasing/serializers.py backend/apps/purchasing/tests/test_new_product.py
git commit -m "feat(purchasing): alta de producto nuevo desde una linea de OC

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Suite backend completa (regresión)

- [ ] **Step 1: Toda la suite**

Run: `docker compose exec -T backend pytest -q`
Expected: PASS. Si algún test de billing/service_orders/inventory referenciaba `final_sale_price`/
`margin_percentage` de líneas de OC o el `sale_price` derivado de la línea, ajustarlo (precio ahora
viene del margen de inventario). Arreglar y re-correr hasta verde.

- [ ] **Step 2: Commit (si hubo ajustes)**

```bash
git add backend/
git commit -m "test(backend): ajustes de regresion del rediseno compras->inventario

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## FASE 2 — Web (`frontend/`)

### Task 6: Regenerar schema + tipos de OC

- [ ] **Step 1:** Con el backend corriendo, `cd frontend && npm run gen:api` (regenera `schema.d.ts`).
- [ ] **Step 2:** En `features/purchasing/api.ts`/`types.ts`: quitar `margin_percentage` del tipo de línea
  de entrada; añadir el opcional `new_product?: { name: string; category?: number | null; sku?: string }`.
- [ ] **Step 3:** `npm run build` → exit 0. Commit `chore(web): regen schema OC + tipos de linea`.

### Task 7: Modal de OC — sin margen, con producto nuevo

**Files:** `frontend/src/features/purchasing/PurchaseOrderCreateModal.tsx`

- [ ] **Step 1:** Quitar la columna **"Margen %"** de la tabla de líneas y del `LineRow`/payload.
- [ ] **Step 2:** Por línea, añadir un toggle (SegmentedControl o Switch) **"Existente / Nuevo"**:
  - Existente: el `Select` de productos actual (manda `product`).
  - Nuevo: `TextInput` nombre + `Select` de categoría (`useCategories`) + `TextInput` SKU opcional
    (manda `new_product: { name, category, sku }`, sin `product`).
- [ ] **Step 3:** En `handleSubmit`, construir cada línea con `product` **o** `new_product`. Validar que
  cada línea tenga uno de los dos.
- [ ] **Step 4:** `npm run build` + vitest → verde. Commit `feat(web): OC con producto nuevo, sin margen`.

### Task 8: Detalle de OC + margen por categoría

**Files:** `frontend/src/features/purchasing/PurchaseOrderDetailPage.tsx`, `frontend/src/features/settings/*` (gestor de categorías)

- [ ] **Step 1:** En `PurchaseOrderDetailPage`, quitar la columna **"Precio venta"** de la tabla de líneas
  (se mantienen costo unit., subtotal, costo asignado, landed).
- [ ] **Step 2:** En Configuración → Categorías (`LookupManager` o el componente de categorías), exponer
  **"Margen %"** (`default_margin_percentage`) en agregar/editar categoría (el serializer ya lo acepta).
- [ ] **Step 3:** `npm run build` + vitest → verde. Commit `feat(web): detalle OC sin precio venta + margen por categoria`.

---

## FASE 3 — Móvil (`mobile/`)

### Task 9: Regenerar schema + OC móvil sin margen, con producto nuevo

**Files:** `mobile/src/lib/api/schema.d.ts`, `mobile/src/features/purchasing/{api.ts,PurchaseOrderFormModal.tsx}`

- [ ] **Step 1:** Regenerar el `schema.d.ts` del móvil (mismo método que la web; con el backend corriendo).
- [ ] **Step 2:** En `purchasing/api.ts`: quitar `margin_percentage` de `POLineInput`; añadir
  `new_product?: { name: string; category: number | null; sku?: string }` y permitir `product: number | null`.
- [ ] **Step 3:** En `PurchaseOrderFormModal.tsx`: quitar el campo **"Margen %"**; por línea añadir un
  `Segmented` "Existente/Nuevo": existente = `Picker` de productos; nuevo = `LabeledInput` nombre +
  `Picker` de categoría (`useCategories`) + `LabeledInput` SKU opcional. El submit manda `product` o
  `new_product` por línea (validar que cada línea tenga uno).
- [ ] **Step 4:** `npm run typecheck` + `npx expo export --platform android` → OK.
- [ ] **Step 5:** Commit `feat(movil): OC con producto nuevo, sin margen`.

---

## Self-review (cobertura del spec)
- A (margen en inventario): Task 1 (categoría + helpers + hooks), Task 2 (quitar de OC). ✓
- B (precio derivado): Task 1 (apply_margin), Task 3 (recepción). ✓
- C (producto nuevo): Task 4. ✓
- D (proveedor↔producto + main_supplier): Task 3. ✓
- E (frontends): Tasks 6-9. ✓
- Migraciones: Tasks 1 y 2. Tests: Tasks 1,3,4,5. ✓

## Notas
- Orden obligatorio: Fase 1 antes que 2 y 3 (web/móvil dependen del schema regenerado).
- `apply_margin` usa `average_cost`; un producto recién creado (average 0) tendrá `sale_price` 0 hasta
  la primera recepción, que lo fija con el costo landed.
- El `sku` autogenerado usa `SKU-{pk:06d}` (patrón como `order_number`); colisión improbable.
