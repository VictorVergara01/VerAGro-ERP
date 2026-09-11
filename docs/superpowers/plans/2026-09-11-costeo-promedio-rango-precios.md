# Costeo promedio, rango de precios e historial de costos — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el precio de venta se derive siempre del costo promedio ponderado, con un rango (piso/sugerido/techo) por producto, historial de costos por compra, y aviso al vender bajo el piso.

**Architecture:** El promedio ponderado pasa a vivir en una única función de `inventory.services` que llaman tanto compras como ajustes. El precio deja de calcularse en `purchasing` y se deriva siempre de `apply_margin()`, que ahora produce tres precios a partir de tres márgenes con cascada producto → categoría. `InventoryMovement` gana el promedio resultante y un FK a la línea de compra, con lo que se convierte en el historial de costos sin tabla nueva.

**Tech Stack:** Django 5.1 + DRF 3.15 + drf-spectacular, PostgreSQL 16, pytest + pytest-django. Frontend React 19 + Mantine 9 + TanStack Query 5 + Vite, vitest + Testing Library. Todo corre en Docker Compose.

**Spec:** `docs/superpowers/specs/2026-09-11-costeo-promedio-rango-precios-design.md`

## Global Constraints

- Rama de trabajo: **V3.0**. No se toca `master` ni `V2.0`.
- Método de costeo: **promedio móvil ponderado**. No FIFO, no LIFO, no lotes.
- Toda mutación de stock conserva `transaction.atomic` + `select_for_update()` sobre el producto. No se relaja.
- Cuantización monetaria: `Decimal.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)` para precios y promedios; `Decimal("0.0001")` para costos landed.
- Un margen en **0 significa "no configurado"** y hereda de la categoría. Es la convención que ya usa `effective_margin()`.
- `apply_margin()` **no toca el precio si `average_cost <= 0`**. Esta guarda existe hoy y se conserva: es lo que protege a los 337 productos `T50-*` sin costo.
- Las **cotizaciones quedan fuera** del reporte de ventas bajo el piso (son propuestas, no ventas). El aviso en pantalla sí aparece al cotizar.
- No se toca `last_purchase_cost`, ni la app móvil, ni el módulo de equipos.
- Mensajes de error de API en español (es la convención del repo).
- En Windows, tras editar código del backend hay que reiniciar el contenedor: `docker compose restart backend`. El bind-mount no dispara el autoreload.
- **Bug conocido, fuera del alcance de este plan:** `frontend/src/utils/format.ts:17` (`formatDate`) muestra las fechas de sólo-día un día antes en zonas con offset negativo, Panamá incluida. Las tablas nuevas de este plan lo usan y heredarán el desfase. No arreglarlo aquí: es un cambio independiente que toca 38 llamadores.

**Comandos de verificación:**
- Backend: `docker compose exec -T backend python -m pytest -q`
- Frontend: `cd frontend && npx vitest run`
- Tipos: `cd frontend && npx tsc -b --noEmit`
- Migraciones: `docker compose exec -T backend python manage.py makemigrations inventory`

---

### Task 1: Márgenes mínimo y máximo en producto y categoría

**Files:**
- Create: `backend/apps/inventory/validators.py`
- Create: `backend/apps/inventory/tests/test_margin_validation.py`
- Modify: `backend/apps/inventory/models.py` (`ProductCategory` ~línea 7, `Product` ~línea 23)
- Modify: `backend/apps/inventory/serializers.py:10` (`ProductCategorySerializer`), `:26` (`ProductSerializer`)

**Interfaces:**
- Consumes: nada (primera tarea).
- Produces:
  - `apps.inventory.validators.margin_triplet_errors(minimum, target, maximum) -> dict[str, str]` — devuelve `{}` si el trío es válido.
  - Campos `Product.min_margin_percentage`, `Product.max_margin_percentage`, `Product.min_sale_price`, `Product.max_sale_price`.
  - Campos `ProductCategory.min_margin_percentage`, `ProductCategory.max_margin_percentage`.

- [ ] **Step 1: Escribir el test del validador**

Crear `backend/apps/inventory/tests/test_margin_validation.py`:

```python
from decimal import Decimal

from apps.inventory.validators import margin_triplet_errors


def test_trio_valido_no_reporta_errores():
    assert margin_triplet_errors(Decimal("25"), Decimal("30"), Decimal("45")) == {}


def test_minimo_mayor_que_maximo():
    errors = margin_triplet_errors(Decimal("50"), Decimal("30"), Decimal("40"))
    assert "min_margin_percentage" in errors


def test_objetivo_fuera_del_rango_por_abajo():
    errors = margin_triplet_errors(Decimal("30"), Decimal("20"), Decimal("45"))
    assert "min_margin_percentage" in errors


def test_objetivo_fuera_del_rango_por_arriba():
    errors = margin_triplet_errors(Decimal("10"), Decimal("50"), Decimal("40"))
    assert "max_margin_percentage" in errors


def test_cero_significa_no_configurado_y_no_participa():
    # Sólo objetivo configurado: no hay nada contra qué comparar.
    assert margin_triplet_errors(Decimal("0"), Decimal("30"), Decimal("0")) == {}
    # Mínimo y objetivo, sin techo.
    assert margin_triplet_errors(Decimal("20"), Decimal("30"), Decimal("0")) == {}
    # Objetivo sin configurar, rango sí: válido mientras min <= max.
    assert margin_triplet_errors(Decimal("20"), Decimal("0"), Decimal("40")) == {}


def test_none_se_trata_como_cero():
    assert margin_triplet_errors(None, Decimal("30"), None) == {}
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `docker compose exec -T backend python -m pytest apps/inventory/tests/test_margin_validation.py -q`
Expected: FAIL con `ModuleNotFoundError: No module named 'apps.inventory.validators'`

- [ ] **Step 3: Escribir el validador**

Crear `backend/apps/inventory/validators.py`:

```python
from decimal import Decimal

MSG_MIN_OVER_MAX = "El margen mínimo no puede superar al máximo."
MSG_MIN_OVER_TARGET = "El margen mínimo no puede superar al objetivo."
MSG_TARGET_OVER_MAX = "El margen objetivo no puede superar al máximo."


def _value(raw):
    """Normaliza a Decimal. None o 0 significan 'no configurado'."""
    if raw is None:
        return Decimal("0")
    return Decimal(str(raw))


def margin_triplet_errors(minimum, target, maximum):
    """Valida el trío de márgenes y devuelve {campo: mensaje}; {} si es válido.

    Un margen en 0 (o None) significa "no configurado": hereda de la categoría y
    no participa en las comparaciones. Por eso sólo se comparan los pares en que
    ambos valores están configurados.
    """
    minimum, target, maximum = _value(minimum), _value(target), _value(maximum)
    errors = {}
    if minimum > 0 and maximum > 0 and minimum > maximum:
        errors["min_margin_percentage"] = MSG_MIN_OVER_MAX
    if minimum > 0 and target > 0 and minimum > target:
        errors["min_margin_percentage"] = MSG_MIN_OVER_TARGET
    if maximum > 0 and target > 0 and target > maximum:
        errors["max_margin_percentage"] = MSG_TARGET_OVER_MAX
    return errors
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `docker compose exec -T backend python -m pytest apps/inventory/tests/test_margin_validation.py -q`
Expected: PASS (6 tests)

- [ ] **Step 5: Añadir los campos a los modelos**

En `backend/apps/inventory/models.py`, dentro de `ProductCategory`, justo después de `default_margin_percentage`:

```python
    min_margin_percentage = models.DecimalField(
        max_digits=12, decimal_places=2, default=0
    )
    max_margin_percentage = models.DecimalField(
        max_digits=12, decimal_places=2, default=0
    )
```

En `Product`, justo después de `default_margin_percentage`:

```python
    min_margin_percentage = models.DecimalField(
        max_digits=12, decimal_places=2, default=0
    )
    max_margin_percentage = models.DecimalField(
        max_digits=12, decimal_places=2, default=0
    )
    # Rango de venta derivado de average_cost. Se denormaliza (en vez de
    # calcularse al vuelo) para poder filtrar en SQL el reporte de ventas
    # bajo el piso sin recorrer producto por producto.
    min_sale_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    max_sale_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
```

- [ ] **Step 6: Generar y aplicar la migración**

```bash
docker compose exec -T backend python manage.py makemigrations inventory
docker compose exec -T backend python manage.py migrate
```

Expected: una migración nueva con 6 `AddField`, todos con `default=0`. Sin `RunPython`.

- [ ] **Step 7: Exponer y validar los campos en los serializers**

En `backend/apps/inventory/serializers.py`, `ProductCategorySerializer.Meta.fields` pasa a:

```python
        fields = (
            "id",
            "name",
            "description",
            "is_active",
            "default_margin_percentage",
            "min_margin_percentage",
            "max_margin_percentage",
        )
```

Y se le añade validación (método nuevo en la clase, antes de `update`):

```python
    def validate(self, attrs):
        instance = self.instance
        errors = margin_triplet_errors(
            attrs.get(
                "min_margin_percentage",
                getattr(instance, "min_margin_percentage", 0) if instance else 0,
            ),
            attrs.get(
                "default_margin_percentage",
                getattr(instance, "default_margin_percentage", 0) if instance else 0,
            ),
            attrs.get(
                "max_margin_percentage",
                getattr(instance, "max_margin_percentage", 0) if instance else 0,
            ),
        )
        if errors:
            raise serializers.ValidationError(errors)
        return attrs
```

`ProductSerializer` usa `fields = "__all__"`, así que los campos nuevos ya salen solos. Hay que
marcar los dos precios del rango como calculados y añadir la misma validación:

```python
        read_only_fields = (
            "id",
            "created_at",
            "updated_at",
            "stock_quantity",
            "reserved_quantity",
            "min_sale_price",
            "max_sale_price",
        )
```

```python
    def validate(self, attrs):
        instance = self.instance
        errors = margin_triplet_errors(
            attrs.get(
                "min_margin_percentage",
                getattr(instance, "min_margin_percentage", 0) if instance else 0,
            ),
            attrs.get(
                "default_margin_percentage",
                getattr(instance, "default_margin_percentage", 0) if instance else 0,
            ),
            attrs.get(
                "max_margin_percentage",
                getattr(instance, "max_margin_percentage", 0) if instance else 0,
            ),
        )
        if errors:
            raise serializers.ValidationError(errors)
        return attrs
```

Y arriba del archivo, junto a los otros imports locales:

```python
from .validators import margin_triplet_errors
```

- [ ] **Step 8: Test de la validación vía API**

Añadir a `backend/apps/inventory/tests/test_margin_validation.py`:

```python
import pytest

from apps.inventory.models import Product
from apps.inventory.serializers import ProductSerializer


@pytest.mark.django_db
def test_serializer_rechaza_minimo_sobre_maximo():
    s = ProductSerializer(
        data={
            "name": "Pieza",
            "min_margin_percentage": "50",
            "default_margin_percentage": "30",
            "max_margin_percentage": "40",
        }
    )
    assert not s.is_valid()
    assert "min_margin_percentage" in s.errors


@pytest.mark.django_db
def test_serializer_acepta_trio_valido():
    s = ProductSerializer(
        data={
            "name": "Pieza",
            "min_margin_percentage": "25",
            "default_margin_percentage": "30",
            "max_margin_percentage": "45",
        }
    )
    assert s.is_valid(), s.errors
    product = s.save()
    assert Product.objects.filter(pk=product.pk).exists()
```

- [ ] **Step 9: Correr toda la suite**

Run: `docker compose restart backend && docker compose exec -T backend python -m pytest -q`
Expected: PASS. 435 tests previos + 8 nuevos.

- [ ] **Step 10: Commit**

```bash
git add backend/apps/inventory/validators.py backend/apps/inventory/models.py \
        backend/apps/inventory/serializers.py backend/apps/inventory/migrations/ \
        backend/apps/inventory/tests/test_margin_validation.py
git commit -m "feat(inventory): margenes minimo y maximo en producto y categoria"
```

---

### Task 2: El rango de precios sale del costo promedio

**Files:**
- Modify: `backend/apps/inventory/services.py:34` (`effective_margin`), `:49` (`apply_margin`), `:63` (`apply_category_margin`)
- Modify: `backend/apps/inventory/serializers.py` (`ProductSerializer.update`, `ProductCategorySerializer.update`)
- Modify: `backend/apps/inventory/tests/test_margin.py` (un test existente cambia de expectativa)

**Interfaces:**
- Consumes: campos de Task 1.
- Produces:
  - `apps.inventory.services.effective_margins(product) -> tuple[Decimal, Decimal, Decimal]` — `(mínimo, objetivo, máximo)`.
  - `apps.inventory.services.apply_margin(product)` — ahora escribe `sale_price`, `min_sale_price` y `max_sale_price`.
  - `effective_margin(product) -> Decimal` se conserva (devuelve el objetivo).

- [ ] **Step 1: Escribir los tests del rango**

Añadir a `backend/apps/inventory/tests/test_margin.py`:

```python
from apps.inventory.services import effective_margins


@pytest.mark.django_db
def test_effective_margins_cascada_campo_por_campo():
    cat = ProductCategory.objects.create(
        name="Mixta",
        min_margin_percentage=Decimal("15"),
        default_margin_percentage=Decimal("20"),
        max_margin_percentage=Decimal("35"),
    )
    # El producto sólo define el mínimo: hereda objetivo y máximo de la categoría.
    p = Product.objects.create(
        sku="R1", name="P", category=cat, min_margin_percentage=Decimal("25")
    )
    assert effective_margins(p) == (Decimal("25"), Decimal("20"), Decimal("35"))


@pytest.mark.django_db
def test_effective_margins_sin_categoria_ni_margenes():
    p = Product.objects.create(sku="R2", name="P")
    assert effective_margins(p) == (Decimal("0"), Decimal("0"), Decimal("0"))


@pytest.mark.django_db
def test_apply_margin_calcula_el_rango_sobre_average_cost():
    p = Product.objects.create(
        sku="R3",
        name="Helice",
        average_cost=Decimal("27.50"),
        min_margin_percentage=Decimal("25"),
        default_margin_percentage=Decimal("30"),
        max_margin_percentage=Decimal("45"),
    )
    apply_margin(p)
    p.refresh_from_db()
    assert p.min_sale_price == Decimal("34.38")   # 27.50 * 1.25
    assert p.sale_price == Decimal("35.75")       # 27.50 * 1.30
    assert p.max_sale_price == Decimal("39.88")   # 27.50 * 1.45


@pytest.mark.django_db
def test_rango_colapsa_al_precio_sugerido_si_no_hay_min_max():
    p = Product.objects.create(
        sku="R4",
        name="P",
        average_cost=Decimal("100"),
        default_margin_percentage=Decimal("30"),
    )
    apply_margin(p)
    p.refresh_from_db()
    assert p.min_sale_price == p.sale_price == p.max_sale_price == Decimal("130.00")


@pytest.mark.django_db
def test_sin_costo_base_no_se_toca_ni_el_rango():
    p = Product.objects.create(
        sku="R5",
        name="P",
        average_cost=Decimal("0"),
        sale_price=Decimal("99"),
        min_margin_percentage=Decimal("25"),
        max_margin_percentage=Decimal("45"),
    )
    apply_margin(p)
    p.refresh_from_db()
    assert p.sale_price == Decimal("99.00")
    assert p.min_sale_price == Decimal("0.00")
    assert p.max_sale_price == Decimal("0.00")
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `docker compose exec -T backend python -m pytest apps/inventory/tests/test_margin.py -q`
Expected: FAIL con `ImportError: cannot import name 'effective_margins'`

- [ ] **Step 3: Implementar `effective_margins` y el `apply_margin` extendido**

En `backend/apps/inventory/services.py`, reemplazar `effective_margin` y `apply_margin` por:

```python
def effective_margins(product):
    """(mínimo, objetivo, máximo) con cascada producto → categoría → 0.

    La cascada se resuelve campo por campo: un producto puede definir su mínimo
    y heredar el máximo de su categoría. Un margen en 0 significa "no configurado".
    """
    category = product.category

    def pick(own_value, category_attr):
        if own_value and own_value > 0:
            return own_value
        if category is not None:
            inherited = getattr(category, category_attr, None)
            if inherited and inherited > 0:
                return inherited
        return Decimal("0")

    return (
        pick(product.min_margin_percentage, "min_margin_percentage"),
        pick(product.default_margin_percentage, "default_margin_percentage"),
        pick(product.max_margin_percentage, "max_margin_percentage"),
    )


def effective_margin(product):
    """Margen objetivo efectivo. Envoltorio de effective_margins() para llamadores previos."""
    return effective_margins(product)[1]


def _price_at(base_cost, margin):
    return _q(base_cost * (Decimal("1") + margin / Decimal("100")))


def apply_margin(product):
    """Recalcula el trío de precios sobre average_cost y guarda.

    Sin costo base (average_cost <= 0) no se puede derivar el precio: se respeta el
    precio manual y no se toca nada (el precio se fijará al recibir la primera compra).
    Si un margen del rango está sin configurar, su precio iguala al sugerido: el
    rango colapsa a un punto y el comportamiento es el previo a esta función.
    """
    if not product.average_cost or product.average_cost <= 0:
        return product
    minimum, target, maximum = effective_margins(product)
    base = product.average_cost
    product.sale_price = _price_at(base, target)
    product.min_sale_price = _price_at(base, minimum) if minimum > 0 else product.sale_price
    product.max_sale_price = _price_at(base, maximum) if maximum > 0 else product.sale_price
    product.save(
        update_fields=["sale_price", "min_sale_price", "max_sale_price", "updated_at"]
    )
    return product
```

- [ ] **Step 4: Correr y verificar que pasan los nuevos**

Run: `docker compose restart backend && docker compose exec -T backend python -m pytest apps/inventory/tests/test_margin.py -q`
Expected: los 5 nuevos PASAN. `test_apply_category_margin_only_products_without_own_margin` FALLA — se corrige en el paso siguiente.

- [ ] **Step 5: Corregir `apply_category_margin` y su test**

Con tres márgenes, el filtro `default_margin_percentage=0` quedó incorrecto: un producto puede
tener margen objetivo propio y heredar el mínimo de su categoría, así que también le afecta un
cambio en la categoría. `apply_margin()` ya respeta los márgenes propios vía `effective_margins()`,
así que recalcular todos los productos de la categoría es correcto y más simple.

En `backend/apps/inventory/services.py`:

```python
def apply_category_margin(category):
    """Recalcula el rango de precios de todos los productos de la categoría.

    No se filtra por "sin margen propio": con tres márgenes un producto puede
    heredar unos y definir otros. apply_margin() respeta los propios vía
    effective_margins(), así que recalcular todos da el resultado correcto.
    """
    for product in category.products.all():
        apply_margin(product)
```

Y en `backend/apps/inventory/tests/test_margin.py`, reemplazar el test existente
`test_apply_category_margin_only_products_without_own_margin` por:

```python
@pytest.mark.django_db
def test_apply_category_margin_respeta_el_margen_propio_de_cada_producto():
    cat = ProductCategory.objects.create(name="X", default_margin_percentage=Decimal("20"))
    a = Product.objects.create(sku="B1", name="A", category=cat, average_cost=Decimal("50"))
    b = Product.objects.create(
        sku="B2", name="B", category=cat, average_cost=Decimal("50"),
        default_margin_percentage=Decimal("100"),
    )
    apply_category_margin(cat)
    a.refresh_from_db()
    b.refresh_from_db()
    assert a.sale_price == Decimal("60.00")    # 50 * 1.20 (margen heredado de la categoría)
    assert b.sale_price == Decimal("100.00")   # 50 * 2.00 (su propio margen, respetado)
```

- [ ] **Step 6: Recalcular también cuando cambian los márgenes nuevos**

En `backend/apps/inventory/serializers.py`, `ProductSerializer.update()` sólo mira
`default_margin_percentage` y `category`. Reemplazarlo por:

```python
    def update(self, instance, validated_data):
        watched = (
            "default_margin_percentage",
            "min_margin_percentage",
            "max_margin_percentage",
        )
        before = {field: getattr(instance, field) for field in watched}
        before_category = instance.category_id
        product = super().update(instance, validated_data)
        # El rango depende de los tres márgenes efectivos, que cambian con los del
        # producto o con los de su categoría. Recalcular si cambió cualquiera.
        changed = any(getattr(product, field) != before[field] for field in watched)
        if changed or product.category_id != before_category:
            from .services import apply_margin

            apply_margin(product)
        return product
```

Y `ProductCategorySerializer.update()`:

```python
    def update(self, instance, validated_data):
        watched = (
            "default_margin_percentage",
            "min_margin_percentage",
            "max_margin_percentage",
        )
        before = {field: getattr(instance, field) for field in watched}
        category = super().update(instance, validated_data)
        if any(getattr(category, field) != before[field] for field in watched):
            from .services import apply_category_margin

            apply_category_margin(category)
        return category
```

- [ ] **Step 7: Test de recálculo al editar el rango**

Añadir a `backend/apps/inventory/tests/test_margin.py`:

```python
@pytest.mark.django_db
def test_editar_margen_minimo_recalcula_el_piso():
    p = Product.objects.create(
        sku="R6", name="P", average_cost=Decimal("100"),
        default_margin_percentage=Decimal("30"),
    )
    apply_margin(p)
    s = ProductSerializer(instance=p, data={"min_margin_percentage": "10"}, partial=True)
    s.is_valid(raise_exception=True)
    s.save()
    p.refresh_from_db()
    assert p.min_sale_price == Decimal("110.00")
    assert p.sale_price == Decimal("130.00")
```

- [ ] **Step 8: Correr toda la suite**

Run: `docker compose restart backend && docker compose exec -T backend python -m pytest -q`
Expected: PASS, sin regresiones.

- [ ] **Step 9: Commit**

```bash
git add backend/apps/inventory/services.py backend/apps/inventory/serializers.py \
        backend/apps/inventory/tests/test_margin.py
git commit -m "feat(inventory): rango de precio de venta derivado del costo promedio"
```

---

### Task 3: El movimiento de inventario guarda el promedio resultante

**Files:**
- Modify: `backend/apps/inventory/models.py` (`InventoryMovement`, ~línea 74)
- Modify: `backend/apps/inventory/serializers.py:80` (`InventoryMovementSerializer`)
- Create: `backend/apps/inventory/tests/test_movement_fields.py`

**Interfaces:**
- Consumes: nada de tareas previas.
- Produces:
  - `InventoryMovement.average_cost_after` — `Decimal`, promedio del producto después del movimiento.
  - `InventoryMovement.purchase_order_line` — FK nullable a `purchasing.PurchaseOrderLine`, `related_name="movements"`.
  - `InventoryMovement.unit_cost` pasa a `max_digits=14, decimal_places=4`.

- [ ] **Step 1: Escribir el test de los campos**

Crear `backend/apps/inventory/tests/test_movement_fields.py`:

```python
from decimal import Decimal

import pytest

from apps.inventory.models import InventoryMovement, Product


@pytest.mark.django_db
def test_movimiento_guarda_promedio_resultante():
    p = Product.objects.create(sku="M1", name="P")
    m = InventoryMovement.objects.create(
        product=p,
        movement_type=InventoryMovement.MovementType.PURCHASE_IN,
        quantity=Decimal("10"),
        unit_cost=Decimal("25.1234"),
        average_cost_after=Decimal("27.50"),
    )
    m.refresh_from_db()
    assert m.average_cost_after == Decimal("27.50")


@pytest.mark.django_db
def test_unit_cost_conserva_cuatro_decimales():
    p = Product.objects.create(sku="M2", name="P")
    m = InventoryMovement.objects.create(
        product=p,
        movement_type=InventoryMovement.MovementType.PURCHASE_IN,
        quantity=Decimal("3"),
        unit_cost=Decimal("25.1234"),
    )
    m.refresh_from_db()
    assert m.unit_cost == Decimal("25.1234")


@pytest.mark.django_db
def test_purchase_order_line_es_opcional():
    p = Product.objects.create(sku="M3", name="P")
    m = InventoryMovement.objects.create(
        product=p,
        movement_type=InventoryMovement.MovementType.ADJUSTMENT_IN,
        quantity=Decimal("1"),
    )
    assert m.purchase_order_line is None
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `docker compose exec -T backend python -m pytest apps/inventory/tests/test_movement_fields.py -q`
Expected: FAIL con `TypeError: ... unexpected keyword argument 'average_cost_after'`

- [ ] **Step 3: Modificar el modelo**

En `backend/apps/inventory/models.py`, dentro de `InventoryMovement`, reemplazar la línea de
`unit_cost` y añadir los dos campos nuevos:

```python
    # 4 decimales para no perder el costo landed, que se calcula con esa precisión
    # en PurchaseOrderLine.landed_unit_cost.
    unit_cost = models.DecimalField(max_digits=14, decimal_places=4, default=0)
    # Promedio ponderado del producto DESPUÉS de aplicar este movimiento. Es lo que
    # permite reconstruir la evolución del costo en el historial.
    average_cost_after = models.DecimalField(
        max_digits=12, decimal_places=2, default=0
    )
    purchase_order_line = models.ForeignKey(
        "purchasing.PurchaseOrderLine",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="movements",
    )
```

- [ ] **Step 4: Generar y aplicar la migración**

```bash
docker compose exec -T backend python manage.py makemigrations inventory
docker compose exec -T backend python manage.py migrate
```

Expected: un `AlterField` sobre `unit_cost` (ensanchar precisión, no pierde datos) y dos `AddField`.

- [ ] **Step 5: Exponer los campos en el serializer**

En `backend/apps/inventory/serializers.py`, `InventoryMovementSerializer.Meta.fields`, añadir
`"average_cost_after"` justo después de `"unit_cost"`.

- [ ] **Step 6: Correr y verificar que pasa**

Run: `docker compose restart backend && docker compose exec -T backend python -m pytest apps/inventory/tests/test_movement_fields.py -q`
Expected: PASS (3 tests)

- [ ] **Step 7: Correr toda la suite**

Run: `docker compose exec -T backend python -m pytest -q`
Expected: PASS, sin regresiones.

- [ ] **Step 8: Commit**

```bash
git add backend/apps/inventory/models.py backend/apps/inventory/serializers.py \
        backend/apps/inventory/migrations/ backend/apps/inventory/tests/test_movement_fields.py
git commit -m "feat(inventory): el movimiento guarda el promedio resultante y su linea de compra"
```

---

### Task 4: Una sola implementación del promedio ponderado — el fix del bug

Esta es la tarea central: elimina el cálculo de precio duplicado en `purchasing` que hace que
el precio de venta salte con el flete de la última compra.

**Files:**
- Modify: `backend/apps/inventory/services.py` (añadir `apply_weighted_average`)
- Modify: `backend/apps/purchasing/services.py:120-165` (dentro de `receive_lines`)
- Create: `backend/apps/purchasing/tests/test_costeo_promedio.py`

**Interfaces:**
- Consumes: `apply_margin` (Task 2), campos del movimiento (Task 3).
- Produces:
  - `apps.inventory.services.apply_weighted_average(locked_product, quantity_in, unit_cost) -> Decimal` — muta `locked_product.average_cost` en memoria (no guarda) y devuelve el nuevo promedio.

- [ ] **Step 1: Escribir el test del escenario real**

Crear `backend/apps/purchasing/tests/test_costeo_promedio.py`:

```python
from decimal import Decimal

import pytest

from apps.inventory.models import InventoryMovement, Product, ProductCategory
from apps.purchasing.models import PurchaseOrder, PurchaseOrderLine
from apps.purchasing.services import receive_lines
from apps.suppliers.models import Supplier


@pytest.fixture
def supplier(db):
    return Supplier.objects.create(name="DJI Panamá")


@pytest.fixture
def categoria(db):
    return ProductCategory.objects.create(
        name="Repuestos", default_margin_percentage=Decimal("30")
    )


def _comprar(supplier, product, quantity, unit_cost, shipping):
    """Crea una orden de una línea, la envía y la recibe completa."""
    po = PurchaseOrder.objects.create(
        supplier=supplier, status=PurchaseOrder.Status.SENT, shipping_cost=Decimal(shipping)
    )
    line = PurchaseOrderLine.objects.create(
        purchase_order=po,
        product=product,
        quantity_ordered=Decimal(quantity),
        unit_purchase_cost=Decimal(unit_cost),
    )
    receive_lines(
        purchase_order=po, receipts=[{"line": line.id, "quantity": Decimal(quantity)}]
    )
    return po, line


@pytest.mark.django_db
def test_dos_compras_con_flete_distinto_promedian_el_costo(supplier, categoria):
    """10 @ $20 con $100 de flete, luego 10 @ $20 con $200 de flete."""
    helice = Product.objects.create(sku="HEL", name="Hélice", category=categoria)

    _comprar(supplier, helice, "10", "20", "100")
    helice.refresh_from_db()
    assert helice.average_cost == Decimal("25.00")   # (200 + 100) / 10

    _comprar(supplier, helice, "10", "20", "200")
    helice.refresh_from_db()
    assert helice.average_cost == Decimal("27.50")   # (10*25 + 10*30) / 20


@pytest.mark.django_db
def test_el_precio_sale_del_promedio_no_del_ultimo_landed(supplier, categoria):
    """El bug original: el precio usaba el landed de la última compra (39.00)."""
    helice = Product.objects.create(sku="HEL2", name="Hélice", category=categoria)

    _comprar(supplier, helice, "10", "20", "100")
    _comprar(supplier, helice, "10", "20", "200")
    helice.refresh_from_db()

    assert helice.average_cost == Decimal("27.50")
    assert helice.last_purchase_cost == Decimal("30.00")   # último landed, correcto
    assert helice.sale_price == Decimal("35.75")           # 27.50 * 1.30, NO 39.00


@pytest.mark.django_db
def test_el_movimiento_registra_el_promedio_resultante(supplier, categoria):
    helice = Product.objects.create(sku="HEL3", name="Hélice", category=categoria)

    _comprar(supplier, helice, "10", "20", "100")
    _comprar(supplier, helice, "10", "20", "200")

    movimientos = list(
        InventoryMovement.objects.filter(
            product=helice, movement_type=InventoryMovement.MovementType.PURCHASE_IN
        ).order_by("id")
    )
    assert [m.average_cost_after for m in movimientos] == [
        Decimal("25.00"),
        Decimal("27.50"),
    ]


@pytest.mark.django_db
def test_el_movimiento_apunta_a_su_linea_de_compra(supplier, categoria):
    helice = Product.objects.create(sku="HEL4", name="Hélice", category=categoria)
    _, line = _comprar(supplier, helice, "10", "20", "100")

    movimiento = InventoryMovement.objects.get(
        product=helice, movement_type=InventoryMovement.MovementType.PURCHASE_IN
    )
    assert movimiento.purchase_order_line_id == line.id
    assert movimiento.unit_cost == Decimal("25.0000")


@pytest.mark.django_db
def test_stock_en_cero_reinicia_el_promedio(supplier, categoria):
    """Sin existencias, la nueva compra fija el promedio sin arrastrar el anterior."""
    p = Product.objects.create(sku="HEL5", name="P", category=categoria)
    _comprar(supplier, p, "10", "20", "100")
    p.refresh_from_db()
    p.stock_quantity = Decimal("0")
    p.save(update_fields=["stock_quantity"])

    _comprar(supplier, p, "5", "40", "0")
    p.refresh_from_db()
    assert p.average_cost == Decimal("40.00")


@pytest.mark.django_db
def test_recepcion_parcial_solo_promedia_lo_recibido(supplier, categoria):
    p = Product.objects.create(sku="HEL6", name="P", category=categoria)
    po = PurchaseOrder.objects.create(
        supplier=supplier, status=PurchaseOrder.Status.SENT, shipping_cost=Decimal("0")
    )
    line = PurchaseOrderLine.objects.create(
        purchase_order=po,
        product=p,
        quantity_ordered=Decimal("10"),
        unit_purchase_cost=Decimal("50"),
    )
    receive_lines(purchase_order=po, receipts=[{"line": line.id, "quantity": Decimal("4")}])
    p.refresh_from_db()
    assert p.stock_quantity == Decimal("4.00")
    assert p.average_cost == Decimal("50.00")
    po.refresh_from_db()
    assert po.status == PurchaseOrder.Status.PARTIALLY_RECEIVED
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `docker compose exec -T backend python -m pytest apps/purchasing/tests/test_costeo_promedio.py -q`
Expected: FAIL. En particular `test_el_precio_sale_del_promedio_no_del_ultimo_landed` falla con
`assert Decimal('39.00') == Decimal('35.75')` — ese es exactamente el bug.

- [ ] **Step 3: Extraer `apply_weighted_average`**

En `backend/apps/inventory/services.py`, añadir después de `_q`:

```python
def apply_weighted_average(locked_product, quantity_in, unit_cost):
    """Promedio móvil ponderado. ÚNICO lugar del sistema donde average_cost cambia.

    Recibe el producto YA bloqueado con select_for_update(): no abre transacción ni
    bloquea por su cuenta, eso es responsabilidad del llamador.

    Debe llamarse ANTES de actualizar stock_quantity: usa el stock previo como peso
    del costo acumulado. Muta el objeto en memoria y devuelve el nuevo promedio; no
    guarda (el llamador ya hace un save() con su propio update_fields).
    """
    quantity_in = Decimal(str(quantity_in))
    unit_cost = Decimal(str(unit_cost))
    new_stock = locked_product.stock_quantity + quantity_in
    if new_stock > 0:
        locked_product.average_cost = _q(
            (locked_product.stock_quantity * locked_product.average_cost
             + quantity_in * unit_cost)
            / new_stock
        )
    return locked_product.average_cost
```

- [ ] **Step 4: Refactorizar `receive_lines`**

En `backend/apps/purchasing/services.py`, reemplazar el bloque que va desde
`for line, quantity in parsed:` hasta el `line.save(...)` de `quantity_received` por:

```python
    for line, quantity in parsed:
        cost = line.landed_unit_cost
        product = Product.objects.select_for_update().get(pk=line.product_id)

        # El promedio se calcula ANTES de mover el stock: usa el stock previo como peso.
        average_after = apply_weighted_average(product, quantity, cost)
        product.stock_quantity = product.stock_quantity + quantity
        product.last_purchase_cost = _q(cost)
        # Primera compra del producto: el proveedor de la orden queda como principal.
        if product.main_supplier_id is None:
            product.main_supplier_id = purchase_order.supplier_id
        product.save(
            update_fields=[
                "stock_quantity",
                "average_cost",
                "last_purchase_cost",
                "main_supplier",
                "updated_at",
            ]
        )
        # El precio (y su rango) se derivan del promedio, nunca del landed de esta
        # compra. Una sola fuente de verdad: apply_margin() en inventory.
        apply_margin(product)

        InventoryMovement.objects.create(
            product=product,
            movement_type=InventoryMovement.MovementType.PURCHASE_IN,
            quantity=quantity,
            unit_cost=cost,
            average_cost_after=average_after,
            purchase_order_line=line,
            reference_type="purchase_order",
            reference_id=purchase_order.id,
            notes=f"Recepción orden {purchase_order.order_number}",
            created_by=user,
        )

        # Cierra el lazo con Proveedores: crea o actualiza la relación con su costo.
        SupplierProduct.objects.update_or_create(
            supplier_id=purchase_order.supplier_id,
            product_id=line.product_id,
            defaults={"last_cost": line.unit_purchase_cost},
        )

        line.quantity_received += quantity
        line.save(update_fields=["quantity_received", "updated_at"])
```

Y cambiar el import de la cabecera del archivo:

```python
from apps.inventory.services import apply_margin, apply_weighted_average
```

(se elimina `effective_margin`, que ya no se usa aquí)

- [ ] **Step 5: Correr los tests nuevos**

Run: `docker compose restart backend && docker compose exec -T backend python -m pytest apps/purchasing/tests/test_costeo_promedio.py -q`
Expected: PASS (6 tests)

- [ ] **Step 6: Correr toda la suite y revisar regresiones**

Run: `docker compose exec -T backend python -m pytest -q`
Expected: PASS. Si algún test de `apps/purchasing/tests/test_api.py` esperaba el precio derivado
del landed, actualizar la expectativa al valor derivado del promedio y **dejar un comentario
explicando por qué cambió** — no relajar el assert.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/inventory/services.py backend/apps/purchasing/services.py \
        backend/apps/purchasing/tests/test_costeo_promedio.py
git commit -m "fix(purchasing): el precio de venta se deriva del promedio, no del ultimo landed"
```

---

### Task 5: El ajuste positivo alimenta el promedio

**Files:**
- Modify: `backend/apps/inventory/services.py:69` (`apply_adjustment`)
- Modify: `backend/apps/inventory/serializers.py` (`AdjustmentSerializer`)
- Create: `backend/apps/inventory/tests/test_adjustment_cost.py`

**Interfaces:**
- Consumes: `apply_weighted_average` (Task 4), `apply_margin` (Task 2), campos del movimiento (Task 3).
- Produces: `apply_adjustment` exige `unit_cost > 0` para `adjustment_in`.

- [ ] **Step 1: Escribir los tests**

Crear `backend/apps/inventory/tests/test_adjustment_cost.py`:

```python
from decimal import Decimal

import pytest
from rest_framework.exceptions import ValidationError

from apps.inventory.models import InventoryMovement, Product, ProductCategory
from apps.inventory.services import apply_adjustment


@pytest.fixture
def categoria(db):
    return ProductCategory.objects.create(
        name="Repuestos", default_margin_percentage=Decimal("30")
    )


@pytest.mark.django_db
def test_entrada_sin_costo_es_rechazada(categoria):
    p = Product.objects.create(sku="AJ1", name="P", category=categoria)
    with pytest.raises(ValidationError) as exc:
        apply_adjustment(
            product=p, movement_type="adjustment_in", quantity=Decimal("5")
        )
    assert "unit_cost" in exc.value.detail


@pytest.mark.django_db
def test_entrada_con_costo_mueve_el_promedio(categoria):
    p = Product.objects.create(
        sku="AJ2", name="P", category=categoria,
        stock_quantity=Decimal("10"), average_cost=Decimal("20"),
    )
    apply_adjustment(
        product=p, movement_type="adjustment_in",
        quantity=Decimal("10"), unit_cost=Decimal("30"),
    )
    p.refresh_from_db()
    assert p.stock_quantity == Decimal("20.00")
    assert p.average_cost == Decimal("25.00")   # (10*20 + 10*30) / 20
    assert p.sale_price == Decimal("32.50")     # 25 * 1.30, recalculado


@pytest.mark.django_db
def test_entrada_registra_el_promedio_resultante(categoria):
    p = Product.objects.create(sku="AJ3", name="P", category=categoria)
    movimiento = apply_adjustment(
        product=p, movement_type="adjustment_in",
        quantity=Decimal("4"), unit_cost=Decimal("15"),
    )
    assert movimiento.average_cost_after == Decimal("15.00")


@pytest.mark.django_db
def test_salida_no_altera_el_promedio(categoria):
    p = Product.objects.create(
        sku="AJ4", name="P", category=categoria,
        stock_quantity=Decimal("10"), average_cost=Decimal("20"),
    )
    movimiento = apply_adjustment(
        product=p, movement_type="adjustment_out", quantity=Decimal("3")
    )
    p.refresh_from_db()
    assert p.stock_quantity == Decimal("7.00")
    assert p.average_cost == Decimal("20.00")
    # La salida se valoriza al promedio vigente.
    assert movimiento.unit_cost == Decimal("20.0000")
    assert movimiento.average_cost_after == Decimal("20.00")


@pytest.mark.django_db
def test_salida_sigue_bloqueando_stock_negativo(categoria):
    p = Product.objects.create(
        sku="AJ5", name="P", category=categoria, stock_quantity=Decimal("2")
    )
    with pytest.raises(ValidationError):
        apply_adjustment(
            product=p, movement_type="adjustment_out", quantity=Decimal("5")
        )
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `docker compose exec -T backend python -m pytest apps/inventory/tests/test_adjustment_cost.py -q`
Expected: FAIL — la entrada sin costo hoy se acepta.

- [ ] **Step 3: Reescribir `apply_adjustment`**

En `backend/apps/inventory/services.py`, reemplazar el cuerpo de `apply_adjustment` por:

```python
@transaction.atomic
def apply_adjustment(*, product, movement_type, quantity, unit_cost=0, notes="", user=None):
    """Aplica un ajuste manual de stock de forma atómica.

    Solo admite adjustment_in / adjustment_out. quantity debe ser > 0.

    La entrada exige unit_cost > 0 y alimenta el costo promedio ponderado igual
    que una recepción de compra: si no, cargar mercancía por ajuste dejaría el
    promedio desactualizado y el precio de venta mal derivado.

    La salida no altera el promedio; se valoriza al promedio vigente.
    adjustment_out no puede dejar el stock disponible en negativo.
    """
    if movement_type not in ADJUSTMENT_TYPES:
        raise ValidationError(
            {"movement_type": "Solo se permiten ajustes (adjustment_in/adjustment_out)."}
        )
    quantity = Decimal(str(quantity))
    if quantity <= 0:
        raise ValidationError({"quantity": "La cantidad debe ser mayor que cero."})

    is_entry = movement_type == InventoryMovement.MovementType.ADJUSTMENT_IN
    unit_cost = Decimal(str(unit_cost or 0))
    if is_entry and unit_cost <= 0:
        raise ValidationError(
            {"unit_cost": "La entrada por ajuste requiere el costo unitario: alimenta el costo promedio."}
        )

    locked = Product.objects.select_for_update().get(pk=product.pk)
    before_available = locked.available_quantity

    if is_entry:
        # El promedio se calcula ANTES de mover el stock: usa el stock previo como peso.
        average_after = apply_weighted_average(locked, quantity, unit_cost)
        locked.stock_quantity = locked.stock_quantity + quantity
        movement_cost = unit_cost
    else:
        if quantity > locked.available_quantity:
            raise ValidationError(
                {"quantity": "El ajuste dejaría el stock disponible en negativo."}
            )
        locked.stock_quantity = locked.stock_quantity - quantity
        # La salida se valoriza al promedio vigente y no lo altera.
        movement_cost = locked.average_cost
        average_after = locked.average_cost

    # updated_at es auto_now pero NO se actualiza si se omite de update_fields.
    locked.save(update_fields=["stock_quantity", "average_cost", "updated_at"])
    if is_entry:
        apply_margin(locked)
    _notify_if_crossed(locked, before_available)

    return InventoryMovement.objects.create(
        product=locked,
        movement_type=movement_type,
        quantity=quantity,
        unit_cost=movement_cost,
        average_cost_after=average_after,
        notes=notes or "",
        created_by=user,
    )
```

- [ ] **Step 4: Hacer obligatorio el costo en el serializer**

En `backend/apps/inventory/serializers.py`, `AdjustmentSerializer`: el campo `unit_cost` sigue
siendo opcional a nivel de campo (la salida no lo necesita), y la obligatoriedad la impone
`apply_adjustment`. Añadir un `validate` para que el 400 llegue con el campo correcto sin
tener que entrar al servicio:

```python
    def validate(self, attrs):
        if attrs.get("movement_type") == "adjustment_in" and not attrs.get("unit_cost"):
            raise serializers.ValidationError(
                {"unit_cost": "La entrada por ajuste requiere el costo unitario."}
            )
        return attrs
```

- [ ] **Step 5: Correr los tests nuevos**

Run: `docker compose restart backend && docker compose exec -T backend python -m pytest apps/inventory/tests/test_adjustment_cost.py -q`
Expected: PASS (5 tests)

- [ ] **Step 6: Correr toda la suite**

Run: `docker compose exec -T backend python -m pytest -q`
Expected: PASS. Los tests existentes en `apps/inventory/tests/test_services.py` que hagan
`adjustment_in` sin `unit_cost` van a fallar: **añadirles un `unit_cost` explícito**, no relajar
la validación.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/inventory/services.py backend/apps/inventory/serializers.py \
        backend/apps/inventory/tests/
git commit -m "feat(inventory): la entrada por ajuste exige costo y alimenta el promedio"
```

---

### Task 6: Endpoint de historial de costos

**Files:**
- Create: `backend/apps/inventory/tests/test_cost_history.py`
- Modify: `backend/apps/inventory/serializers.py` (nuevo `CostHistoryEntrySerializer`)
- Modify: `backend/apps/inventory/views.py:95` (nueva acción junto a `movements`)

**Interfaces:**
- Consumes: campos del movimiento (Task 3), datos escritos por Tasks 4 y 5.
- Produces: `GET /api/inventory/products/{id}/cost-history/`, nombre de ruta `product-cost-history`.

- [ ] **Step 1: Escribir el test del endpoint**

Crear `backend/apps/inventory/tests/test_cost_history.py`:

```python
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from apps.inventory.models import Product, ProductCategory
from apps.inventory.services import apply_adjustment
from apps.purchasing.models import PurchaseOrder, PurchaseOrderLine
from apps.purchasing.services import receive_lines
from apps.suppliers.models import Supplier

User = get_user_model()


@pytest.fixture
def client(db):
    user = User.objects.create_user(
        email="hist@veragro.com", password="x", full_name="H", role="super_admin"
    )
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture
def producto(db):
    categoria = ProductCategory.objects.create(
        name="Repuestos", default_margin_percentage=Decimal("30")
    )
    return Product.objects.create(sku="H1", name="Hélice", category=categoria)


def _comprar(producto, quantity, unit_cost, shipping, supplier_name="DJI Panamá"):
    supplier, _ = Supplier.objects.get_or_create(name=supplier_name)
    po = PurchaseOrder.objects.create(
        supplier=supplier, status=PurchaseOrder.Status.SENT, shipping_cost=Decimal(shipping)
    )
    line = PurchaseOrderLine.objects.create(
        purchase_order=po,
        product=producto,
        quantity_ordered=Decimal(quantity),
        unit_purchase_cost=Decimal(unit_cost),
    )
    receive_lines(
        purchase_order=po, receipts=[{"line": line.id, "quantity": Decimal(quantity)}]
    )
    return po


@pytest.mark.django_db
def test_historial_desglosa_proveedor_y_flete(client, producto):
    po = _comprar(producto, "10", "20", "100")

    r = client.get(f"/api/inventory/products/{producto.id}/cost-history/")
    assert r.status_code == 200
    fila = r.json()[0]
    assert fila["movement_type"] == "purchase_in"
    assert Decimal(fila["quantity"]) == Decimal("10.00")
    assert Decimal(fila["unit_cost"]) == Decimal("25.0000")
    assert Decimal(fila["average_cost_after"]) == Decimal("25.00")
    assert fila["purchase_order_number"] == po.order_number
    assert fila["supplier_name"] == "DJI Panamá"
    assert Decimal(fila["supplier_unit_cost"]) == Decimal("20.00")
    assert Decimal(fila["allocated_extra_per_unit"]) == Decimal("10.0000")


@pytest.mark.django_db
def test_los_ajustes_no_traen_datos_de_compra(client, producto):
    apply_adjustment(
        product=producto, movement_type="adjustment_in",
        quantity=Decimal("5"), unit_cost=Decimal("12"),
    )
    fila = client.get(f"/api/inventory/products/{producto.id}/cost-history/").json()[0]
    assert fila["movement_type"] == "adjustment_in"
    assert fila["purchase_order_number"] is None
    assert fila["supplier_name"] is None
    assert fila["supplier_unit_cost"] is None
    assert fila["allocated_extra_per_unit"] is None


@pytest.mark.django_db
def test_solo_entradas_y_mas_recientes_primero(client, producto):
    _comprar(producto, "10", "20", "0")
    apply_adjustment(
        product=producto, movement_type="adjustment_out", quantity=Decimal("2")
    )
    filas = client.get(f"/api/inventory/products/{producto.id}/cost-history/").json()
    assert [f["movement_type"] for f in filas] == ["purchase_in"]


@pytest.mark.django_db
def test_misma_orden_con_el_producto_en_dos_lineas(client, producto):
    """Cada movimiento debe apuntar a SU línea, con su propio costo."""
    supplier, _ = Supplier.objects.get_or_create(name="DJI Panamá")
    po = PurchaseOrder.objects.create(
        supplier=supplier, status=PurchaseOrder.Status.SENT, shipping_cost=Decimal("0")
    )
    a = PurchaseOrderLine.objects.create(
        purchase_order=po, product=producto,
        quantity_ordered=Decimal("10"), unit_purchase_cost=Decimal("20"),
    )
    b = PurchaseOrderLine.objects.create(
        purchase_order=po, product=producto,
        quantity_ordered=Decimal("5"), unit_purchase_cost=Decimal("40"),
    )
    receive_lines(
        purchase_order=po,
        receipts=[
            {"line": a.id, "quantity": Decimal("10")},
            {"line": b.id, "quantity": Decimal("5")},
        ],
    )
    costos = {
        Decimal(f["supplier_unit_cost"])
        for f in client.get(f"/api/inventory/products/{producto.id}/cost-history/").json()
    }
    assert costos == {Decimal("20.00"), Decimal("40.00")}


@pytest.mark.django_db
def test_el_historial_no_incurre_en_n_mas_1(client, producto):
    for _ in range(5):
        _comprar(producto, "1", "10", "0")

    with CaptureQueriesContext(connection) as ctx:
        r = client.get(f"/api/inventory/products/{producto.id}/cost-history/")
    assert r.status_code == 200
    assert len(r.json()) == 5
    # producto + movimientos con sus joins; constante, no proporcional a las filas.
    assert len(ctx.captured_queries) <= 6
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `docker compose exec -T backend python -m pytest apps/inventory/tests/test_cost_history.py -q`
Expected: FAIL con 404 — la ruta no existe.

- [ ] **Step 3: Escribir el serializer**

En `backend/apps/inventory/serializers.py`, después de `InventoryMovementSerializer`:

```python
class CostHistoryEntrySerializer(serializers.ModelSerializer):
    """Una entrada del historial de costos de un producto.

    Los cuatro campos de compra van en null cuando el movimiento no viene de una
    orden (un ajuste, por ejemplo).
    """

    purchase_order_number = serializers.CharField(
        source="purchase_order_line.purchase_order.order_number",
        read_only=True,
        default=None,
    )
    supplier_name = serializers.CharField(
        source="purchase_order_line.purchase_order.supplier.name",
        read_only=True,
        default=None,
    )
    supplier_unit_cost = serializers.DecimalField(
        source="purchase_order_line.unit_purchase_cost",
        max_digits=12,
        decimal_places=2,
        read_only=True,
        default=None,
    )
    allocated_extra_per_unit = serializers.SerializerMethodField()

    class Meta:
        model = InventoryMovement
        fields = (
            "id",
            "created_at",
            "movement_type",
            "quantity",
            "unit_cost",
            "average_cost_after",
            "purchase_order_number",
            "supplier_name",
            "supplier_unit_cost",
            "allocated_extra_per_unit",
            "notes",
        )

    def get_allocated_extra_per_unit(self, obj):
        line = obj.purchase_order_line
        if line is None or not line.quantity_ordered:
            return None
        return str(
            (line.allocated_extra_cost / line.quantity_ordered).quantize(
                Decimal("0.0001"), rounding=ROUND_HALF_UP
            )
        )
```

Y en la cabecera del archivo:

```python
from decimal import ROUND_HALF_UP, Decimal
```

- [ ] **Step 4: Escribir la acción del viewset**

En `backend/apps/inventory/views.py`, justo después de la acción `movements`:

```python
    @action(detail=True, methods=["get"], url_path="cost-history")
    def cost_history(self, request, pk=None):
        """Historial de costos: sólo entradas, con el desglose de su compra."""
        product = self.get_object()
        qs = (
            product.movements.filter(movement_type__in=COST_HISTORY_TYPES)
            .select_related(
                "purchase_order_line__purchase_order__supplier",
            )
            .order_by("-created_at", "-id")
        )
        return Response(CostHistoryEntrySerializer(qs, many=True).data)
```

Arriba del archivo, junto a los otros imports:

```python
from .models import InventoryMovement, Product, ProductCategory, ProductCompatibility
from .serializers import (
    AdjustmentSerializer,
    CostHistoryEntrySerializer,
    InventoryMovementSerializer,
    ProductCategorySerializer,
    ProductCompatibilitySerializer,
    ProductSerializer,
)

COST_HISTORY_TYPES = (
    InventoryMovement.MovementType.PURCHASE_IN,
    InventoryMovement.MovementType.ADJUSTMENT_IN,
    InventoryMovement.MovementType.RETURN_IN,
)
```

- [ ] **Step 5: Correr y verificar que pasa**

Run: `docker compose restart backend && docker compose exec -T backend python -m pytest apps/inventory/tests/test_cost_history.py -q`
Expected: PASS (5 tests)

- [ ] **Step 6: Correr toda la suite y commit**

```bash
docker compose exec -T backend python -m pytest -q
git add backend/apps/inventory/serializers.py backend/apps/inventory/views.py \
        backend/apps/inventory/tests/test_cost_history.py
git commit -m "feat(inventory): endpoint de historial de costos por producto"
```

---

### Task 7: Aviso de precio bajo el piso en las líneas de venta

**Files:**
- Create: `backend/apps/inventory/price_range.py`
- Create: `backend/apps/inventory/tests/test_price_floor.py`
- Modify: `backend/apps/billing/serializers.py:8` (`QuoteLineSerializer`), `:102` (`InvoiceLineSerializer`)
- Modify: `backend/apps/service_orders/serializers.py:20` (`ServiceOrderPartSerializer`)

**Interfaces:**
- Consumes: `Product.min_sale_price` (Tasks 1-2).
- Produces:
  - `apps.inventory.price_range.floor_for(product) -> Decimal | None`
  - `apps.inventory.price_range.is_below_floor(product, unit_price) -> bool`
  - `apps.inventory.price_range.PriceFloorMixin` — aporta `price_floor` y `below_min_price` a un `ModelSerializer` cuya instancia tenga `product` y `unit_price`.

- [ ] **Step 1: Escribir los tests**

Crear `backend/apps/inventory/tests/test_price_floor.py`:

```python
from decimal import Decimal

import pytest

from apps.inventory.models import Product
from apps.inventory.price_range import floor_for, is_below_floor


@pytest.mark.django_db
def test_sin_rango_configurado_no_hay_piso():
    p = Product.objects.create(sku="F1", name="P", min_sale_price=Decimal("0"))
    assert floor_for(p) is None
    assert is_below_floor(p, Decimal("1")) is False


@pytest.mark.django_db
def test_producto_nulo_no_rompe():
    assert floor_for(None) is None
    assert is_below_floor(None, Decimal("1")) is False


@pytest.mark.django_db
def test_precio_bajo_el_piso():
    p = Product.objects.create(sku="F2", name="P", min_sale_price=Decimal("34.38"))
    assert floor_for(p) == Decimal("34.38")
    assert is_below_floor(p, Decimal("30.00")) is True
    assert is_below_floor(p, Decimal("34.38")) is False   # justo en el piso, no avisa
    assert is_below_floor(p, Decimal("40.00")) is False
```

Y el test de integración vía serializer, en el mismo archivo:

```python
from apps.billing.models import Invoice, InvoiceLine
from apps.billing.serializers import InvoiceLineSerializer
from apps.customers.models import Customer


@pytest.mark.django_db
def test_la_linea_bajo_el_piso_se_marca_pero_se_guarda():
    customer = Customer.objects.create(name="Cliente")
    invoice = Invoice.objects.create(customer=customer)
    product = Product.objects.create(
        sku="F3", name="Hélice", min_sale_price=Decimal("34.38")
    )
    s = InvoiceLineSerializer(
        data={
            "invoice": invoice.id,
            "product": product.id,
            "quantity": "1",
            "unit_price": "30.00",
        }
    )
    assert s.is_valid(), s.errors
    line = s.save()
    assert InvoiceLine.objects.filter(pk=line.pk).exists()   # se guardó igual

    data = InvoiceLineSerializer(instance=line).data
    assert data["below_min_price"] is True
    assert Decimal(data["price_floor"]) == Decimal("34.38")


@pytest.mark.django_db
def test_la_linea_dentro_del_rango_no_se_marca():
    customer = Customer.objects.create(name="Cliente")
    invoice = Invoice.objects.create(customer=customer)
    product = Product.objects.create(
        sku="F4", name="Hélice", min_sale_price=Decimal("34.38")
    )
    line = InvoiceLine.objects.create(
        invoice=invoice, product=product, quantity=Decimal("1"),
        unit_price=Decimal("36.00"),
    )
    data = InvoiceLineSerializer(instance=line).data
    assert data["below_min_price"] is False
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `docker compose exec -T backend python -m pytest apps/inventory/tests/test_price_floor.py -q`
Expected: FAIL con `ModuleNotFoundError: No module named 'apps.inventory.price_range'`

- [ ] **Step 3: Escribir el módulo**

Crear `backend/apps/inventory/price_range.py`:

```python
from decimal import Decimal

from rest_framework import serializers


def floor_for(product):
    """Piso de venta vigente del producto, o None si no tiene rango configurado."""
    if product is None:
        return None
    minimum = product.min_sale_price
    if not minimum or minimum <= 0:
        return None
    return minimum


def is_below_floor(product, unit_price):
    """True si el precio está por debajo del piso vigente.

    El juicio se hace contra el rango ACTUAL del producto, no contra el que regía
    al momento de la venta: dice qué está bajo el costo hoy. Congelarlo exigiría
    columnas nuevas en cada modelo de línea.
    """
    minimum = floor_for(product)
    if minimum is None or unit_price is None:
        return False
    return Decimal(str(unit_price)) < minimum


class PriceFloorMixin(serializers.Serializer):
    """Aporta price_floor y below_min_price a una línea con product y unit_price.

    No bloquea la venta: sólo informa, para que la UI pueda marcar la línea.
    """

    price_floor = serializers.SerializerMethodField()
    below_min_price = serializers.SerializerMethodField()

    def get_price_floor(self, obj):
        minimum = floor_for(getattr(obj, "product", None))
        return None if minimum is None else str(minimum)

    def get_below_min_price(self, obj):
        return is_below_floor(getattr(obj, "product", None), getattr(obj, "unit_price", None))
```

- [ ] **Step 4: Conectar el mixin en los tres serializers**

En `backend/apps/billing/serializers.py`, añadir el import:

```python
from apps.inventory.price_range import PriceFloorMixin
```

`QuoteLineSerializer` pasa a `class QuoteLineSerializer(PriceFloorMixin, serializers.ModelSerializer):`
y a su `Meta.fields` se añaden `"price_floor"` y `"below_min_price"` después de `"unit_price"`.

`InvoiceLineSerializer` pasa a `class InvoiceLineSerializer(PriceFloorMixin, serializers.ModelSerializer):`
con el mismo añadido a `Meta.fields`.

En `backend/apps/service_orders/serializers.py`, mismo import y
`class ServiceOrderPartSerializer(PriceFloorMixin, serializers.ModelSerializer):`, añadiendo
`"price_floor"` y `"below_min_price"` a `Meta.fields` después de `"unit_price"`.

- [ ] **Step 5: Correr y verificar que pasa**

Run: `docker compose restart backend && docker compose exec -T backend python -m pytest apps/inventory/tests/test_price_floor.py -q`
Expected: PASS (5 tests)

- [ ] **Step 6: Correr toda la suite y commit**

```bash
docker compose exec -T backend python -m pytest -q
git add backend/apps/inventory/price_range.py backend/apps/billing/serializers.py \
        backend/apps/service_orders/serializers.py \
        backend/apps/inventory/tests/test_price_floor.py
git commit -m "feat(billing): avisa (sin bloquear) cuando la linea va bajo el piso de precio"
```

---

### Task 8: Reporte de ventas bajo el piso

**Files:**
- Create: `backend/apps/reports/tests/test_below_floor.py`
- Modify: `backend/apps/reports/views.py` (nueva `BelowFloorSalesReport` al final)
- Modify: `backend/apps/reports/urls.py`

**Interfaces:**
- Consumes: `Product.min_sale_price` (Tasks 1-2).
- Produces: `GET /api/reports/below-floor-sales/?from=&to=`, nombre de ruta `reports-below-floor-sales`.

- [ ] **Step 1: Escribir el test**

Crear `backend/apps/reports/tests/test_below_floor.py`:

```python
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.billing.models import Invoice, InvoiceLine
from apps.customers.models import Customer
from apps.inventory.models import Product

User = get_user_model()


def _client(role="super_admin"):
    user = User.objects.create_user(
        email=f"{role}@veragro.com", password="x", full_name=role, role=role
    )
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.mark.django_db
def test_lista_solo_las_lineas_bajo_el_piso():
    client = _client()
    customer = Customer.objects.create(name="Cliente")
    invoice = Invoice.objects.create(customer=customer)
    barata = Product.objects.create(
        sku="P1", name="Hélice", min_sale_price=Decimal("34.38")
    )
    sana = Product.objects.create(
        sku="P2", name="Motor", min_sale_price=Decimal("50.00")
    )
    InvoiceLine.objects.create(
        invoice=invoice, product=barata, quantity=Decimal("1"),
        unit_price=Decimal("30.00"),
    )
    InvoiceLine.objects.create(
        invoice=invoice, product=sana, quantity=Decimal("1"),
        unit_price=Decimal("60.00"),
    )

    r = client.get("/api/reports/below-floor-sales/")
    assert r.status_code == 200
    filas = r.json()["items"]
    assert len(filas) == 1
    fila = filas[0]
    assert fila["product_sku"] == "P1"
    assert Decimal(fila["unit_price"]) == Decimal("30.00")
    assert Decimal(fila["price_floor"]) == Decimal("34.38")
    assert Decimal(fila["difference"]) == Decimal("4.38")


@pytest.mark.django_db
def test_productos_sin_rango_no_aparecen():
    client = _client()
    customer = Customer.objects.create(name="Cliente")
    invoice = Invoice.objects.create(customer=customer)
    producto = Product.objects.create(sku="P3", name="P", min_sale_price=Decimal("0"))
    InvoiceLine.objects.create(
        invoice=invoice, product=producto, quantity=Decimal("1"),
        unit_price=Decimal("1.00"),
    )
    assert client.get("/api/reports/below-floor-sales/").json()["items"] == []
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `docker compose exec -T backend python -m pytest apps/reports/tests/test_below_floor.py -q`
Expected: FAIL con 404.

- [ ] **Step 3: Escribir la vista**

Al final de `backend/apps/reports/views.py`:

```python
class BelowFloorSalesReport(APIView):
    """Líneas vendidas por debajo del piso de precio vigente del producto.

    Las cotizaciones quedan fuera: son propuestas, no ventas, y meterían
    negociaciones que nunca se cerraron en la cifra.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        date_from, date_to = _date_range(request)

        lines = _apply_range(
            InvoiceLine.objects.filter(
                product__isnull=False,
                product__min_sale_price__gt=0,
                unit_price__lt=F("product__min_sale_price"),
            ).select_related("product", "invoice", "invoice__created_by"),
            "invoice__issue_date",
            date_from,
            date_to,
        )

        parts = _apply_range(
            ServiceOrderPart.objects.filter(
                product__min_sale_price__gt=0,
                unit_price__lt=F("product__min_sale_price"),
            ).select_related(
                "product", "service_order", "service_order__created_by"
            ),
            "service_order__received_date",
            date_from,
            date_to,
        )

        items = [
            _below_floor_row(
                document=line.invoice.invoice_number,
                document_type="invoice",
                date=line.invoice.issue_date,
                created_by=line.invoice.created_by,
                product=line.product,
                unit_price=line.unit_price,
                quantity=line.quantity,
            )
            for line in lines
        ] + [
            _below_floor_row(
                document=part.service_order.service_order_number,
                document_type="service_order",
                date=part.service_order.received_date,
                created_by=part.service_order.created_by,
                product=part.product,
                unit_price=part.unit_price,
                quantity=part.quantity,
            )
            for part in parts
        ]
        items.sort(key=lambda row: (row["date"] or ""), reverse=True)
        return Response({"items": items, "count": len(items)})


def _below_floor_row(*, document, document_type, date, created_by, product, unit_price, quantity):
    floor = product.min_sale_price
    difference = floor - unit_price
    percentage = (difference / floor * 100) if floor else Decimal("0")
    return {
        "document": document,
        "document_type": document_type,
        "date": date.isoformat() if date else None,
        "created_by": getattr(created_by, "full_name", None),
        "product_id": product.id,
        "product_sku": product.sku,
        "product_name": product.name,
        "quantity": str(quantity),
        "unit_price": str(unit_price),
        "price_floor": str(floor),
        "difference": str(difference.quantize(Decimal("0.01"))),
        "difference_percentage": str(percentage.quantize(Decimal("0.01"))),
    }
```

Verificar que la cabecera de `backend/apps/reports/views.py` tenga estos imports (añadir los
que falten): `from decimal import Decimal`, `from django.db.models import F`,
`from apps.billing.models import InvoiceLine`, `from apps.service_orders.models import ServiceOrderPart`.

- [ ] **Step 4: Registrar la ruta**

En `backend/apps/reports/urls.py`, añadir a `urlpatterns`:

```python
    path(
        "reports/below-floor-sales/",
        BelowFloorSalesReport.as_view(),
        name="reports-below-floor-sales",
    ),
```

y `BelowFloorSalesReport` al import de `.views`.

- [ ] **Step 5: Correr y verificar que pasa**

Run: `docker compose restart backend && docker compose exec -T backend python -m pytest apps/reports/tests/test_below_floor.py -q`
Expected: PASS (2 tests)

- [ ] **Step 6: Correr toda la suite y commit**

```bash
docker compose exec -T backend python -m pytest -q
git add backend/apps/reports/views.py backend/apps/reports/urls.py \
        backend/apps/reports/tests/test_below_floor.py
git commit -m "feat(reports): reporte de ventas por debajo del piso de precio"
```

---

### Task 9: Comando de limpieza de datos de prueba

**Files:**
- Create: `backend/apps/inventory/management/__init__.py`, `backend/apps/inventory/management/commands/__init__.py` (si no existen)
- Create: `backend/apps/inventory/management/commands/purge_demo_products.py`
- Create: `backend/apps/inventory/tests/test_purge_demo_products.py`

**Interfaces:**
- Consumes: nada.
- Produces: `python manage.py purge_demo_products [--prefix SKU-] [--confirm] [--allow-orphans]`

- [ ] **Step 1: Escribir los tests**

Crear `backend/apps/inventory/tests/test_purge_demo_products.py`:

```python
from decimal import Decimal
from io import StringIO

import pytest
from django.core.management import CommandError, call_command

from apps.billing.models import Invoice, InvoiceLine
from apps.customers.models import Customer
from apps.inventory.models import InventoryMovement, Product


@pytest.fixture
def datos_de_prueba(db):
    demo = Product.objects.create(sku="SKU-000001", name="Demo")
    real = Product.objects.create(sku="T50-001", name="Real")
    InventoryMovement.objects.create(
        product=demo,
        movement_type=InventoryMovement.MovementType.ADJUSTMENT_IN,
        quantity=Decimal("1"),
        unit_cost=Decimal("1"),
    )
    return demo, real


@pytest.mark.django_db
def test_dry_run_es_el_comportamiento_por_defecto(datos_de_prueba):
    demo, real = datos_de_prueba
    out = StringIO()
    call_command("purge_demo_products", stdout=out)
    assert Product.objects.filter(pk=demo.pk).exists()
    assert Product.objects.filter(pk=real.pk).exists()
    texto = out.getvalue()
    assert "SKU-000001" in texto
    assert "T50-001" not in texto


@pytest.mark.django_db
def test_confirm_borra_productos_y_movimientos(datos_de_prueba):
    demo, real = datos_de_prueba
    call_command("purge_demo_products", "--confirm", stdout=StringIO())
    assert not Product.objects.filter(pk=demo.pk).exists()
    assert Product.objects.filter(pk=real.pk).exists()
    assert InventoryMovement.objects.count() == 0


@pytest.mark.django_db
def test_aborta_si_hay_facturas_afectadas_sin_allow_orphans(datos_de_prueba):
    demo, _ = datos_de_prueba
    customer = Customer.objects.create(name="Cliente")
    invoice = Invoice.objects.create(customer=customer)
    InvoiceLine.objects.create(
        invoice=invoice, product=demo, quantity=Decimal("1"), unit_price=Decimal("5")
    )
    with pytest.raises(CommandError):
        call_command("purge_demo_products", "--confirm", stdout=StringIO())
    assert Product.objects.filter(pk=demo.pk).exists()   # no borró nada


@pytest.mark.django_db
def test_allow_orphans_permite_borrar_y_deja_la_linea_huerfana(datos_de_prueba):
    demo, _ = datos_de_prueba
    customer = Customer.objects.create(name="Cliente")
    invoice = Invoice.objects.create(customer=customer)
    line = InvoiceLine.objects.create(
        invoice=invoice, product=demo, quantity=Decimal("1"), unit_price=Decimal("5")
    )
    call_command(
        "purge_demo_products", "--confirm", "--allow-orphans", stdout=StringIO()
    )
    line.refresh_from_db()
    assert line.product_id is None              # SET_NULL
    assert not Product.objects.filter(pk=demo.pk).exists()
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `docker compose exec -T backend python -m pytest apps/inventory/tests/test_purge_demo_products.py -q`
Expected: FAIL con `CommandError: Unknown command: 'purge_demo_products'`

- [ ] **Step 3: Escribir el comando**

Crear los `__init__.py` que falten y `backend/apps/inventory/management/commands/purge_demo_products.py`:

```python
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.billing.models import InvoiceLine
from apps.inventory.models import InventoryMovement, Product
from apps.service_orders.models import ServiceOrderPart


class Command(BaseCommand):
    help = (
        "Elimina los productos de prueba (por prefijo de SKU) con sus movimientos. "
        "Por defecto sólo informa: hay que pasar --confirm para que borre."
    )

    def add_arguments(self, parser):
        parser.add_argument("--prefix", default="SKU-", help="Prefijo de SKU a purgar.")
        parser.add_argument(
            "--confirm", action="store_true", help="Ejecuta el borrado de verdad."
        )
        parser.add_argument(
            "--allow-orphans",
            action="store_true",
            help="Permite borrar aunque deje líneas de factura sin producto.",
        )

    def handle(self, *args, **options):
        prefix = options["prefix"]
        products = Product.objects.filter(sku__startswith=prefix)
        product_ids = list(products.values_list("id", flat=True))

        movements = InventoryMovement.objects.filter(product_id__in=product_ids)
        invoice_lines = InvoiceLine.objects.filter(
            product_id__in=product_ids
        ).select_related("invoice")
        parts = ServiceOrderPart.objects.filter(product_id__in=product_ids)

        self.stdout.write(f"Prefijo: {prefix}")
        self.stdout.write(f"Productos a borrar: {len(product_ids)}")
        for sku in products.values_list("sku", flat=True)[:20]:
            self.stdout.write(f"  - {sku}")
        if len(product_ids) > 20:
            self.stdout.write(f"  … y {len(product_ids) - 20} más")
        self.stdout.write(f"Movimientos de inventario a borrar: {movements.count()}")

        # ServiceOrderPart.product es PROTECT: bloquea el borrado, no hay forma de
        # continuar sin tocar órdenes de servicio reales.
        if parts.exists():
            raise CommandError(
                f"{parts.count()} piezas de órdenes de servicio apuntan a estos productos "
                "(PROTECT). Resuélvelas antes de purgar."
            )

        # InvoiceLine.product es SET_NULL: NO bloquea, pero dejaría la factura con una
        # línea huérfana en silencio. Por eso se exige autorización explícita.
        orphan_count = invoice_lines.count()
        if orphan_count:
            self.stdout.write(
                self.style.WARNING(
                    f"{orphan_count} líneas de factura quedarían sin producto (SET_NULL):"
                )
            )
            for line in invoice_lines[:20]:
                self.stdout.write(
                    f"  - factura {line.invoice.invoice_number}: {line.description or line.product_id}"
                )

        if not options["confirm"]:
            self.stdout.write(
                self.style.NOTICE("Simulación (--dry-run implícito). Nada fue borrado.")
            )
            return

        if orphan_count and not options["allow_orphans"]:
            raise CommandError(
                f"Hay {orphan_count} líneas de factura afectadas. Repite con "
                "--allow-orphans si de verdad quieres dejarlas sin producto."
            )

        with transaction.atomic():
            deleted_movements = movements.delete()[0]
            deleted_products = products.delete()[0]

        self.stdout.write(
            self.style.SUCCESS(
                f"Borrados: {deleted_products} registros de producto, "
                f"{deleted_movements} movimientos."
            )
        )
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `docker compose restart backend && docker compose exec -T backend python -m pytest apps/inventory/tests/test_purge_demo_products.py -q`
Expected: PASS (4 tests)

- [ ] **Step 5: Correr toda la suite y commit**

```bash
docker compose exec -T backend python -m pytest -q
git add backend/apps/inventory/management/ backend/apps/inventory/tests/test_purge_demo_products.py
git commit -m "feat(inventory): comando purge_demo_products con dry-run por defecto"
```

**NO ejecutar el comando con `--confirm` contra la base de desarrollo.** Eso lo decide el usuario.

---

### Task 10: Frontend — tipos y márgenes en producto y categoría

**Files:**
- Modify: `frontend/src/lib/api/schema.d.ts` (regenerado)
- Modify: `frontend/src/features/inventory/types.ts`
- Modify: `frontend/src/features/inventory/ProductFormModal.tsx`
- Modify: `frontend/src/features/settings/LookupManager.tsx`
- Create: `frontend/src/features/inventory/priceRange.ts`
- Create: `frontend/src/features/inventory/priceRange.test.ts`

**Interfaces:**
- Consumes: campos de API de Tasks 1-2.
- Produces: `computeRange(averageCost, min, target, max) -> { floor: number; suggested: number; ceiling: number }` en `priceRange.ts`.

- [ ] **Step 1: Regenerar los tipos de la API**

Con el backend corriendo:

```bash
cd frontend && npm run gen:api
```

Expected: `src/lib/api/schema.d.ts` gana `min_margin_percentage`, `max_margin_percentage`,
`min_sale_price`, `max_sale_price`, `price_floor`, `below_min_price`.

- [ ] **Step 2: Escribir el test del cálculo del rango**

Crear `frontend/src/features/inventory/priceRange.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { computeRange } from "./priceRange";

describe("computeRange", () => {
  it("calcula piso, sugerido y techo sobre el costo promedio", () => {
    expect(computeRange(27.5, 25, 30, 45)).toEqual({
      floor: 34.38,
      suggested: 35.75,
      ceiling: 39.88,
    });
  });

  it("colapsa el rango al sugerido cuando no hay min ni max", () => {
    expect(computeRange(100, 0, 30, 0)).toEqual({
      floor: 130,
      suggested: 130,
      ceiling: 130,
    });
  });

  it("devuelve ceros sin costo promedio", () => {
    expect(computeRange(0, 25, 30, 45)).toEqual({
      floor: 0,
      suggested: 0,
      ceiling: 0,
    });
  });
});
```

- [ ] **Step 3: Correr y verificar que falla**

Run: `cd frontend && npx vitest run src/features/inventory/priceRange.test.ts`
Expected: FAIL — el módulo no existe.

- [ ] **Step 4: Escribir el módulo**

Crear `frontend/src/features/inventory/priceRange.ts`:

```ts
/** Espejo en cliente de apply_margin() del backend, para la vista previa en vivo. */

function priceAt(base: number, margin: number): number {
  return Math.round(base * (1 + margin / 100) * 100) / 100;
}

export function computeRange(
  averageCost: number,
  minMargin: number,
  targetMargin: number,
  maxMargin: number,
): { floor: number; suggested: number; ceiling: number } {
  if (!averageCost || averageCost <= 0) {
    return { floor: 0, suggested: 0, ceiling: 0 };
  }
  const suggested = priceAt(averageCost, targetMargin || 0);
  return {
    floor: minMargin > 0 ? priceAt(averageCost, minMargin) : suggested,
    suggested,
    ceiling: maxMargin > 0 ? priceAt(averageCost, maxMargin) : suggested,
  };
}
```

- [ ] **Step 5: Correr y verificar que pasa**

Run: `cd frontend && npx vitest run src/features/inventory/priceRange.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Añadir los campos al formulario de producto**

En `frontend/src/features/inventory/ProductFormModal.tsx`:

En el tipo del formulario (junto a `default_margin_percentage: number | string;` en la línea 31):

```tsx
  min_margin_percentage: number | string;
  max_margin_percentage: number | string;
```

En los valores iniciales (junto a `default_margin_percentage: 0,` en la línea 48):

```tsx
  min_margin_percentage: 0,
  max_margin_percentage: 0,
```

En el payload que se envía (junto a la línea 107):

```tsx
      min_margin_percentage: String(values.min_margin_percentage || 0),
      max_margin_percentage: String(values.max_margin_percentage || 0),
```

Y justo después del `Grid.Col` de "Margen % por defecto" (línea ~195), dos columnas más con
el mismo formato:

```tsx
          <Grid.Col span={{ base: 6, sm: 4 }}>
            <NumberInput
              label="Margen mínimo %"
              min={0}
              decimalScale={2}
              {...form.getInputProps("min_margin_percentage")}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 4 }}>
            <NumberInput
              label="Margen máximo %"
              min={0}
              decimalScale={2}
              {...form.getInputProps("max_margin_percentage")}
            />
          </Grid.Col>
```

Y debajo, en un `Grid.Col span={12}`, la vista previa del rango:

```tsx
{(() => {
  const range = computeRange(
    Number(form.values.average_cost ?? 0),
    Number(form.values.min_margin_percentage ?? 0),
    Number(form.values.default_margin_percentage ?? 0),
    Number(form.values.max_margin_percentage ?? 0),
  );
  if (!range.suggested) return null;
  return (
    <Text size="xs" c="dimmed">
      Rango sobre el costo promedio: piso {formatCurrency(range.floor)} · sugerido{" "}
      {formatCurrency(range.suggested)} · techo {formatCurrency(range.ceiling)}
    </Text>
  );
})()}
```

Añadir también la validación en cliente, en el objeto `validate` del `useForm`:

```tsx
    min_margin_percentage: (value, values) =>
      Number(value) > 0 && Number(values.max_margin_percentage) > 0
        && Number(value) > Number(values.max_margin_percentage)
        ? "El margen mínimo no puede superar al máximo."
        : null,
```

- [ ] **Step 7: Añadir los márgenes a las categorías**

`LookupManager.tsx` es un componente genérico que sirve a varios lookups y sólo muestra el
margen cuando recibe `withMargin`. Hoy maneja **un** margen mediante `marginOf` (línea 24),
`newMargin` / `editMargin` y el payload de `save` (línea 68). Hay que generalizarlo a tres.

Reemplazar `marginOf` por un lector parametrizado:

```tsx
const MARGIN_FIELDS = [
  { key: "default_margin_percentage", label: "Margen % por defecto" },
  { key: "min_margin_percentage", label: "Margen mínimo %" },
  { key: "max_margin_percentage", label: "Margen máximo %" },
] as const;

type MarginKey = (typeof MARGIN_FIELDS)[number]["key"];

const marginOf = (item: LookupItem | null, key: MarginKey) => {
  const value = (item as Record<string, string | number | undefined> | null)?.[key];
  return value != null ? String(value) : "0";
};
```

Sustituir los estados `newMargin` / `editMargin` (string) por un registro por campo:

```tsx
const emptyMargins = () =>
  Object.fromEntries(MARGIN_FIELDS.map((f) => [f.key, "0"])) as Record<MarginKey, string>;

const [newMargins, setNewMargins] = useState<Record<MarginKey, string>>(emptyMargins);
const [editMargins, setEditMargins] = useState<Record<MarginKey, string>>(emptyMargins);
```

En `add` y en el guardado de la edición, el payload del margen pasa a ser:

```tsx
        ...(withMargin
          ? Object.fromEntries(
              MARGIN_FIELDS.map((f) => [f.key, newMargins[f.key] || "0"]),
            )
          : {}),
```

Renderizar un `NumberInput` por cada entrada de `MARGIN_FIELDS` donde hoy hay uno solo, y en
la columna "Margen %" de la tabla mostrar el trío:
`` `${marginOf(i, "min_margin_percentage")}% – ${marginOf(i, "max_margin_percentage")}%` ``.

Al tocar este archivo se corrige de paso el error de ESLint preexistente
`react-hooks/set-state-in-effect` de la línea 58: en vez del `useEffect` que sincroniza el
estado desde `editing`, pasar `key={editing?.id ?? "new"}` al formulario de edición para que
React lo remonte con los valores correctos.

- [ ] **Step 8: Verificar tipos, tests y commit**

```bash
cd frontend && npx tsc -b --noEmit && npx vitest run
git add frontend/src/lib/api/schema.d.ts frontend/src/features/inventory/ \
        frontend/src/features/settings/LookupManager.tsx
git commit -m "feat(frontend): margenes minimo y maximo con vista previa del rango"
```

---

### Task 11: Frontend — rango e historial en el detalle del producto

**Files:**
- Modify: `frontend/src/features/inventory/api.ts` (hook `useProductCostHistory`)
- Modify: `frontend/src/features/inventory/types.ts` (tipo `CostHistoryEntry`)
- Modify: `frontend/src/features/inventory/ProductDetailPage.tsx`
- Modify: `frontend/src/features/inventory/inventory.test.tsx`

**Interfaces:**
- Consumes: `GET /api/inventory/products/{id}/cost-history/` (Task 6), campos del rango (Task 1).
- Produces: hook `useProductCostHistory(productId)`.

- [ ] **Step 1: Escribir el test de la pestaña**

Añadir a `frontend/src/features/inventory/inventory.test.tsx` un caso que renderice
`ProductDetailPage` con un producto que tenga `min_sale_price: "34.38"`,
`sale_price: "35.75"`, `max_sale_price: "39.88"` y una entrada de historial mockeada, y
verifique que el rango y la fila del historial aparecen:

```tsx
it("muestra el rango de precio y el historial de costos", async () => {
  renderProductDetail({
    product: {
      id: 1, sku: "HEL", name: "Hélice",
      average_cost: "27.50", sale_price: "35.75",
      min_sale_price: "34.38", max_sale_price: "39.88",
    },
    costHistory: [
      {
        id: 9, created_at: "2026-09-03T10:00:00-05:00", movement_type: "purchase_in",
        quantity: "10", unit_cost: "30.0000", average_cost_after: "27.50",
        purchase_order_number: "OC-000019", supplier_name: "DJI Panamá",
        supplier_unit_cost: "20.00", allocated_extra_per_unit: "10.0000",
      },
    ],
  });
  expect(await screen.findByText(/34\.38/)).toBeInTheDocument();
  expect(await screen.findByText("OC-000019")).toBeInTheDocument();
});
```

Ajustar el helper de render a los patrones que ya usa ese archivo para mockear los hooks.

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd frontend && npx vitest run src/features/inventory/inventory.test.tsx`
Expected: FAIL — no existe el hook ni la pestaña.

- [ ] **Step 3: Añadir el tipo y el hook**

En `frontend/src/features/inventory/types.ts`:

```ts
export type CostHistoryEntry = {
  id: number;
  created_at: string;
  movement_type: string;
  quantity: string;
  unit_cost: string;
  average_cost_after: string;
  purchase_order_number: string | null;
  supplier_name: string | null;
  supplier_unit_cost: string | null;
  allocated_extra_per_unit: string | null;
  notes: string;
};
```

En `frontend/src/features/inventory/api.ts`, siguiendo el patrón de `useProductMovements`:

```ts
export function useProductCostHistory(productId?: number) {
  return useQuery({
    queryKey: ["product-cost-history", productId],
    enabled: productId != null,
    queryFn: async () => {
      const { data, error } = await client.GET(
        "/api/inventory/products/{id}/cost-history/",
        { params: { path: { id: productId as number } } },
      );
      if (error) throw new Error("No se pudo cargar el historial de costos.");
      return data as CostHistoryEntry[];
    },
  });
}
```

- [ ] **Step 4: Mostrar el rango y la pestaña**

En `frontend/src/features/inventory/ProductDetailPage.tsx`, junto a los `Field` de costo,
añadir tres más:

```tsx
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Field label="Precio mínimo" value={formatCurrency(product.min_sale_price)} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Field label="Precio máximo" value={formatCurrency(product.max_sale_price)} />
          </Grid.Col>
```

Y envolver la sección inferior en `Tabs` de Mantine con dos pestañas: "Movimientos" (la tabla
que ya existe) e "Historial de costos", con estas columnas:

```tsx
const costHistoryColumns: Column<CostHistoryEntry>[] = [
  { header: "Fecha", render: (e) => formatDate(e.created_at) },
  { header: "Orden", render: (e) => e.purchase_order_number ?? "—" },
  { header: "Proveedor", render: (e) => e.supplier_name ?? "—" },
  { header: "Cant.", align: "right", render: (e) => e.quantity },
  {
    header: "Costo prov.",
    align: "right",
    render: (e) => (e.supplier_unit_cost ? formatCurrency(e.supplier_unit_cost) : "—"),
  },
  {
    header: "Flete/u",
    align: "right",
    render: (e) =>
      e.allocated_extra_per_unit ? formatCurrency(e.allocated_extra_per_unit) : "—",
  },
  { header: "Landed", align: "right", render: (e) => formatCurrency(e.unit_cost) },
  {
    header: "Promedio después",
    align: "right",
    render: (e) => formatCurrency(e.average_cost_after),
  },
];
```

- [ ] **Step 5: Verificar tipos, tests y commit**

```bash
cd frontend && npx tsc -b --noEmit && npx vitest run
git add frontend/src/features/inventory/
git commit -m "feat(frontend): rango de precio e historial de costos en el detalle del producto"
```

---

### Task 12: Frontend — costo obligatorio en el ajuste de entrada

**Files:**
- Modify: `frontend/src/features/inventory/AdjustStockModal.tsx`
- Create: `frontend/src/features/inventory/AdjustStockModal.test.tsx`

**Interfaces:**
- Consumes: la validación del backend de Task 5.
- Produces: nada que consuman otras tareas.

- [ ] **Step 1: Escribir el test**

Crear `frontend/src/features/inventory/AdjustStockModal.test.tsx` siguiendo el patrón de los
demás tests de modal del repo. Dos casos:

```tsx
it("bloquea la entrada sin costo unitario", async () => {
  const adjust = vi.fn();
  renderModal({ adjust });
  await userEvent.type(screen.getByLabelText("Cantidad"), "5");
  await userEvent.click(screen.getByRole("button", { name: "Aplicar" }));
  expect(adjust).not.toHaveBeenCalled();
});

it("permite la salida sin costo unitario", async () => {
  const adjust = vi.fn().mockResolvedValue({});
  renderModal({ adjust });
  await userEvent.click(screen.getByRole("radio", { name: /Salida/ }));
  await userEvent.type(screen.getByLabelText("Cantidad"), "5");
  await userEvent.click(screen.getByRole("button", { name: "Aplicar" }));
  expect(adjust).toHaveBeenCalled();
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd frontend && npx vitest run src/features/inventory/AdjustStockModal.test.tsx`
Expected: FAIL — hoy la entrada sin costo se envía.

- [ ] **Step 3: Implementar**

En `frontend/src/features/inventory/AdjustStockModal.tsx`, la etiqueta del campo pasa a
depender del tipo y se valida antes de enviar. Dentro de `submit`, después de la validación
de cantidad:

```tsx
    const isEntry = type === "adjustment_in";
    if (isEntry && (!unitCost || Number(unitCost) <= 0)) {
      notifications.show({
        color: "red",
        message: "La entrada requiere el costo unitario: alimenta el costo promedio.",
      });
      return;
    }
```

Y el `NumberInput` del costo:

```tsx
          <NumberInput
            label={
              type === "adjustment_in" ? "Costo unitario" : "Costo unitario (opcional)"
            }
            description={
              type === "adjustment_in"
                ? "Entra al costo promedio del producto, igual que una compra."
                : undefined
            }
            withAsterisk={type === "adjustment_in"}
            min={0}
            value={unitCost}
            onChange={(v) => setUnitCost(v as number | string)}
            decimalScale={2}
          />
```

- [ ] **Step 4: Verificar y commit**

```bash
cd frontend && npx tsc -b --noEmit && npx vitest run
git add frontend/src/features/inventory/AdjustStockModal.tsx \
        frontend/src/features/inventory/AdjustStockModal.test.tsx
git commit -m "feat(frontend): el ajuste de entrada exige costo unitario"
```

---

### Task 13: Frontend — aviso en líneas de venta y reporte

**Files:**
- Modify: `frontend/src/features/billing/InvoiceDetailPage.tsx`, `frontend/src/features/billing/QuoteDetailPage.tsx`
- Modify: `frontend/src/features/service-orders/ServiceOrderDetailPage.tsx`
- Modify: `frontend/src/features/reports/ReportsPage.tsx`
- Modify: `frontend/src/features/reports/api.ts`

**Interfaces:**
- Consumes: `price_floor` / `below_min_price` (Task 7), `/api/reports/below-floor-sales/` (Task 8).
- Produces: nada.

- [ ] **Step 1: Escribir el test del aviso**

Añadir a los tests de facturación un caso que renderice una línea con
`below_min_price: true, price_floor: "34.38"` y verifique que aparece el aviso:

```tsx
it("marca la línea vendida bajo el piso", async () => {
  renderInvoiceDetail({
    lines: [
      {
        id: 1, product: 5, product_sku: "HEL", description: "Hélice",
        quantity: "1", unit_price: "30.00",
        below_min_price: true, price_floor: "34.38",
      },
    ],
  });
  expect(await screen.findByText(/bajo el mínimo/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd frontend && npx vitest run src/features/billing`
Expected: FAIL — el aviso no se renderiza.

- [ ] **Step 3: Renderizar el aviso**

En la columna de precio de las tablas de líneas de los tres detalles, envolver el valor:

```tsx
{
  header: "Precio unit.",
  align: "right",
  render: (line) =>
    line.below_min_price ? (
      <Tooltip label={`Bajo el mínimo: piso ${formatCurrency(line.price_floor)}`}>
        <Text c="red" fw={600} component="span">
          {formatCurrency(line.unit_price)}
        </Text>
      </Tooltip>
    ) : (
      formatCurrency(line.unit_price)
    ),
}
```

- [ ] **Step 4: Añadir la pestaña del reporte**

En `frontend/src/features/reports/types.ts`:

```ts
export type BelowFloorRow = {
  document: string;
  document_type: "invoice" | "service_order";
  date: string | null;
  created_by: string | null;
  product_id: number;
  product_sku: string;
  product_name: string;
  quantity: string;
  unit_price: string;
  price_floor: string;
  difference: string;
  difference_percentage: string;
};

export type BelowFloorReport = { items: BelowFloorRow[]; count: number };
```

En `frontend/src/features/reports/api.ts`, siguiendo el patrón de `useServiceOrdersReport`
(que ya resuelve el tipado de `?from=&to=` con `rangeQuery`):

```ts
export function useBelowFloorSalesReport(range: DateRange) {
  return useQuery({
    queryKey: ["report", "below-floor-sales", range],
    queryFn: async () => {
      const { data, error, response } = await api.GET(
        "/api/reports/below-floor-sales/",
        { params: { query: rangeQuery(range) } },
      );
      if (error || !data) throw reportError(response?.status);
      return data as unknown as BelowFloorReport;
    },
  });
}
```

En `ReportsPage.tsx`, una pestaña "Ventas bajo el piso" con estas columnas:

```tsx
const belowFloorColumns: Column<BelowFloorRow>[] = [
  { header: "Documento", render: (r) => r.document },
  { header: "Fecha", render: (r) => formatDate(r.date) },
  { header: "Producto", render: (r) => `${r.product_sku} — ${r.product_name}` },
  { header: "Cant.", align: "right", render: (r) => r.quantity },
  {
    header: "Precio vendido",
    align: "right",
    render: (r) => (
      <Text c="red" fw={600} component="span">
        {formatCurrency(r.unit_price)}
      </Text>
    ),
  },
  { header: "Piso", align: "right", render: (r) => formatCurrency(r.price_floor) },
  {
    header: "Diferencia",
    align: "right",
    render: (r) => `${formatCurrency(r.difference)} (${r.difference_percentage}%)`,
  },
  { header: "Creado por", render: (r) => r.created_by ?? "—" },
];
```

- [ ] **Step 5: Verificar y commit**

```bash
cd frontend && npx tsc -b --noEmit && npx vitest run
git add frontend/src/features/billing/ frontend/src/features/service-orders/ \
        frontend/src/features/reports/
git commit -m "feat(frontend): aviso de venta bajo el piso y reporte"
```

---

### Task 14: Verificación de extremo a extremo

**Files:** ninguno (sólo verificación).

- [ ] **Step 1: Suite completa de backend**

Run: `docker compose restart backend && docker compose exec -T backend python -m pytest -q`
Expected: PASS, sin fallos ni errores.

- [ ] **Step 2: Suite completa de frontend y tipos**

```bash
cd frontend && npx tsc -b --noEmit && npx vitest run && npx eslint .
```

Expected: tipos limpios, tests en verde. ESLint no debe traer errores **nuevos** respecto a los
14 preexistentes (11 `react-hooks/set-state-in-effect`, 3 en `inventory/api.ts` e `InventoryPage.tsx`).

- [ ] **Step 3: Prueba manual del flujo completo**

Con la aplicación levantada (`docker compose up -d`), en `http://localhost:5173`:

1. Configurar en una categoría margen mínimo 25, objetivo 30, máximo 45.
2. Crear un producto en esa categoría.
3. Crear una orden de compra: 10 unidades a $20, flete $100. Enviarla y recibirla completa.
4. Verificar en el detalle del producto: costo promedio `25.00`, piso `31.25`, sugerido `32.50`,
   techo `36.25`.
5. Crear una segunda orden idéntica pero con flete $200. Recibirla.
6. Verificar: costo promedio `27.50`, piso `34.38`, sugerido `35.75`, techo `39.88`.
   **El precio sugerido NO debe ser 39.00** — ese era el bug.
7. Abrir la pestaña "Historial de costos": dos filas, con promedios `25.00` y `27.50`.
8. Facturar ese producto a $30 y confirmar que la línea aparece en rojo y la factura se guarda.
9. Abrir Reportes → "Ventas bajo el piso" y confirmar que la línea aparece.

- [ ] **Step 4: Confirmar que el dry-run de limpieza informa correctamente**

Run: `docker compose exec -T backend python manage.py purge_demo_products`
Expected: lista los productos `SKU-*`, sus movimientos y las líneas de factura afectadas, y
termina con "Simulación (--dry-run implícito). Nada fue borrado."

**No ejecutarlo con `--confirm`.** Esa decisión es del usuario.
