# Catálogo técnico — Etapa 1: Modelos + Admin + Migraciones + Seed

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear la capa de datos del catálogo técnico (EquipmentModel, EquipmentComponent, ProductCompatibility), enlazarla a Equipment y ServiceOrderPart con campos opcionales, registrarla en el admin, y sembrar los árboles de DJI Agras T50 y DJI D12500iE con un comando idempotente — sin romper nada existente y sin API nueva todavía.

**Architecture:** Modelos aditivos que heredan de `apps.core.models.TimeStampedModel`. El catálogo vive en la app `equipment`; la tabla puente `ProductCompatibility` en `inventory`; el enlace de la pieza en `service_orders`. Todos los campos nuevos son `null/blank` (no rompen filas históricas). Validaciones de árbol/compatibilidad en `clean()` (probadas con `full_clean()`), unicidad a nivel BD con `UniqueConstraint`. Seed vía management command re-ejecutable con `get_or_create`.

**Tech Stack:** Django 5.1, DRF, PostgreSQL, pytest, Docker Compose.

## Global Constraints

- Backend en Docker; tests: `docker compose exec backend pytest <ruta>` desde la raíz del repo `C:\Users\victo\Proyectos\VerAgro-ERP`. Si el backend no está arriba: `docker compose up -d db backend`.
- `pytest.ini` ya fija `DJANGO_SETTINGS_MODULE=config.settings.development`; `python_files=test_*.py`.
- Migraciones aditivas y seguras: **nada obligatorio**, no borrar ni alterar datos existentes. Generar con `makemigrations` (nombres autogenerados).
- No eliminar campos heredados (`brand`, `model`, `compatible_models`, `compatible_equipment_types`).
- Rama de trabajo: `V3.0`. Commits en español, imperativo, footer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Reutilizar `EquipmentType` existentes en el seed: T50 → "Drone agrícola"; D12500iE → "Planta eléctrica" (get_or_create, sin crear tipos duplicados).
- Spec de referencia: `docs/superpowers/specs/equipment-parts-catalog.md`.

---

### Task 1: `EquipmentModel` + `Equipment.catalog_model`

**Files:**
- Modify: `backend/apps/equipment/models.py`
- Modify: `backend/apps/equipment/admin.py`
- Create: `backend/apps/equipment/tests/test_catalog.py`
- Migration: `backend/apps/equipment/migrations/` (autogenerada)

**Interfaces:**
- Produces: `EquipmentModel(equipment_type, brand, name, model_code, revision, description, diagram_type, diagram_file, is_active)`, único por `(brand, model_code, revision)`, `__str__ = "{brand} {name}"`, related_name `equipment_models` en type y `equipment_units` en `Equipment.catalog_model`.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `backend/apps/equipment/tests/test_catalog.py`:

```python
import pytest
from django.db import IntegrityError

from apps.equipment.models import EquipmentModel, EquipmentType, Equipment


@pytest.fixture
def eqtype(db):
    t, _ = EquipmentType.objects.get_or_create(name="Drone agrícola")
    return t


@pytest.mark.django_db
def test_equipment_model_str_and_defaults(eqtype):
    m = EquipmentModel.objects.create(
        equipment_type=eqtype, brand="DJI", name="DJI Agras T50", model_code="T50"
    )
    assert str(m) == "DJI DJI Agras T50"
    assert m.is_active is True
    assert m.diagram_type == "svg"
    assert m.revision == ""


@pytest.mark.django_db
def test_equipment_model_unique_brand_code_revision(eqtype):
    EquipmentModel.objects.create(
        equipment_type=eqtype, brand="DJI", name="T50", model_code="T50"
    )
    with pytest.raises(IntegrityError):
        EquipmentModel.objects.create(
            equipment_type=eqtype, brand="DJI", name="T50 dup", model_code="T50"
        )


@pytest.mark.django_db
def test_equipment_catalog_model_link_optional(eqtype):
    m = EquipmentModel.objects.create(
        equipment_type=eqtype, brand="DJI", name="T50", model_code="T50"
    )
    e_sin = Equipment.objects.create(name="Viejo", equipment_type=eqtype)
    assert e_sin.catalog_model is None  # heredado sigue funcionando
    e_con = Equipment.objects.create(
        name="Nuevo", equipment_type=eqtype, catalog_model=m
    )
    assert list(m.equipment_units.all()) == [e_con]
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `docker compose exec backend pytest apps/equipment/tests/test_catalog.py -v`
Expected: FAIL (ImportError: cannot import name 'EquipmentModel').

- [ ] **Step 3: Implementar el modelo**

En `backend/apps/equipment/models.py`, tras la definición de `EquipmentType` (antes de `Equipment`), agregar:

```python
class EquipmentModel(TimeStampedModel):
    class DiagramType(models.TextChoices):
        SVG = "svg", "SVG"
        IMAGE = "image", "Imagen"

    equipment_type = models.ForeignKey(
        EquipmentType,
        on_delete=models.PROTECT,
        related_name="equipment_models",
    )
    brand = models.CharField(max_length=100)
    name = models.CharField(max_length=150)
    model_code = models.CharField(max_length=100)
    revision = models.CharField(max_length=50, blank=True, default="")
    description = models.TextField(blank=True, default="")
    diagram_type = models.CharField(
        max_length=20, choices=DiagramType.choices, default=DiagramType.SVG
    )
    diagram_file = models.FileField(
        upload_to="equipment_models/diagrams/", null=True, blank=True
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("brand", "name")
        constraints = [
            models.UniqueConstraint(
                fields=["brand", "model_code", "revision"],
                name="uniq_equipment_model_brand_code_rev",
            )
        ]

    def __str__(self):
        return f"{self.brand} {self.name}"
```

En la clase `Equipment`, tras el campo `equipment_type`, agregar:

```python
    catalog_model = models.ForeignKey(
        EquipmentModel,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="equipment_units",
    )
```

- [ ] **Step 4: Registrar en el admin**

En `backend/apps/equipment/admin.py`, agregar el import de `EquipmentModel` y:

```python
@admin.register(EquipmentModel)
class EquipmentModelAdmin(admin.ModelAdmin):
    list_display = ("brand", "name", "model_code", "revision", "equipment_type", "is_active")
    list_filter = ("brand", "equipment_type", "is_active")
    search_fields = ("brand", "name", "model_code")
```

En `EquipmentAdmin.list_display` agregar `"catalog_model"` y en `list_filter` agregar `"catalog_model"`.

- [ ] **Step 5: Generar y aplicar la migración**

Run: `docker compose exec backend python manage.py makemigrations equipment`
Expected: crea una migración con `EquipmentModel` y `Equipment.catalog_model`.
Run: `docker compose exec backend python manage.py migrate`
Expected: aplica sin errores.

- [ ] **Step 6: Correr los tests para verificar que pasan**

Run: `docker compose exec backend pytest apps/equipment/tests/test_catalog.py -v`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add backend/apps/equipment/models.py backend/apps/equipment/admin.py backend/apps/equipment/migrations/ backend/apps/equipment/tests/test_catalog.py
git commit -m "feat(equipment): agrega EquipmentModel y Equipment.catalog_model

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `EquipmentComponent` (árbol jerárquico)

**Files:**
- Modify: `backend/apps/equipment/models.py`
- Modify: `backend/apps/equipment/admin.py`
- Modify: `backend/apps/equipment/tests/test_catalog.py`
- Migration: autogenerada

**Interfaces:**
- Consumes: `EquipmentModel` (Task 1).
- Produces: `EquipmentComponent(equipment_model, parent, code, name, component_type, diagram_key, position, description, sort_order, is_active)`; `code` único por modelo; propiedad `path` ("A > B > C"); `clean()` valida padre-mismo-modelo y no-ciclos; related_name `components` (en model) y `children` (en parent).

- [ ] **Step 1: Escribir los tests que fallan**

Agregar a `backend/apps/equipment/tests/test_catalog.py`:

```python
from django.core.exceptions import ValidationError as DjangoValidationError
from apps.equipment.models import EquipmentComponent


def _model(eqtype, code="T50"):
    return EquipmentModel.objects.create(
        equipment_type=eqtype, brand="DJI", name=code, model_code=code
    )


@pytest.mark.django_db
def test_component_path(eqtype):
    m = _model(eqtype)
    prop = EquipmentComponent.objects.create(
        equipment_model=m, code="propulsion", name="Sistema de propulsión",
        component_type="assembly",
    )
    arm = EquipmentComponent.objects.create(
        equipment_model=m, parent=prop, code="arm_m1", name="Brazo M1",
        component_type="assembly",
    )
    motor = EquipmentComponent.objects.create(
        equipment_model=m, parent=arm, code="motor_m1", name="Motor",
    )
    assert motor.path == "Sistema de propulsión > Brazo M1 > Motor"


@pytest.mark.django_db
def test_component_code_unique_per_model(eqtype):
    m = _model(eqtype)
    EquipmentComponent.objects.create(equipment_model=m, code="motor", name="Motor")
    from django.db import IntegrityError
    with pytest.raises(IntegrityError):
        EquipmentComponent.objects.create(equipment_model=m, code="motor", name="Otro")


@pytest.mark.django_db
def test_component_parent_must_be_same_model(eqtype):
    m1 = _model(eqtype, "T50")
    m2 = _model(eqtype, "D125")
    p = EquipmentComponent.objects.create(equipment_model=m1, code="a", name="A")
    child = EquipmentComponent(equipment_model=m2, parent=p, code="b", name="B")
    with pytest.raises(DjangoValidationError):
        child.full_clean()


@pytest.mark.django_db
def test_component_rejects_cycle(eqtype):
    m = _model(eqtype)
    a = EquipmentComponent.objects.create(equipment_model=m, code="a", name="A")
    b = EquipmentComponent.objects.create(equipment_model=m, parent=a, code="b", name="B")
    a.parent = b  # crea ciclo a->b->a
    with pytest.raises(DjangoValidationError):
        a.full_clean()
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `docker compose exec backend pytest apps/equipment/tests/test_catalog.py -k component -v`
Expected: FAIL (ImportError: EquipmentComponent).

- [ ] **Step 3: Implementar el modelo**

En `backend/apps/equipment/models.py`, tras `EquipmentModel`, agregar (importar `ValidationError` de django arriba: `from django.core.exceptions import ValidationError`):

```python
class EquipmentComponent(TimeStampedModel):
    class ComponentType(models.TextChoices):
        ASSEMBLY = "assembly", "Conjunto"
        POSITION = "position", "Posición reemplazable"

    equipment_model = models.ForeignKey(
        EquipmentModel, on_delete=models.CASCADE, related_name="components"
    )
    parent = models.ForeignKey(
        "self", on_delete=models.CASCADE, null=True, blank=True, related_name="children"
    )
    code = models.CharField(max_length=100)
    name = models.CharField(max_length=150)
    component_type = models.CharField(
        max_length=20, choices=ComponentType.choices, default=ComponentType.POSITION
    )
    diagram_key = models.CharField(max_length=100, blank=True, default="")
    position = models.CharField(max_length=100, blank=True, default="")
    description = models.TextField(blank=True, default="")
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("sort_order", "name")
        indexes = [
            models.Index(fields=["equipment_model"]),
            models.Index(fields=["parent"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["equipment_model", "code"], name="uniq_component_model_code"
            )
        ]

    def __str__(self):
        return self.name

    @property
    def path(self):
        names, node, seen = [], self, set()
        while node is not None and node.pk not in seen:
            seen.add(node.pk)
            names.append(node.name)
            node = node.parent
        return " > ".join(reversed(names))

    def clean(self):
        if self.parent_id:
            if self.parent.equipment_model_id != self.equipment_model_id:
                raise ValidationError(
                    {"parent": "El padre debe pertenecer al mismo modelo técnico."}
                )
            ancestor, seen = self.parent, set()
            while ancestor is not None:
                if ancestor.pk == self.pk:
                    raise ValidationError({"parent": "Relación cíclica no permitida."})
                if ancestor.pk in seen:
                    break
                seen.add(ancestor.pk)
                ancestor = ancestor.parent
```

- [ ] **Step 4: Registrar en el admin**

En `backend/apps/equipment/admin.py`, agregar:

```python
class EquipmentComponentInline(admin.TabularInline):
    model = EquipmentComponent
    fields = ("code", "name", "component_type", "parent", "diagram_key", "sort_order", "is_active")
    extra = 0


@admin.register(EquipmentComponent)
class EquipmentComponentAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "component_type", "equipment_model", "parent", "sort_order", "is_active")
    list_filter = ("equipment_model", "component_type", "is_active")
    search_fields = ("name", "code")
```

Y añadir `inlines = [EquipmentComponentInline]` a `EquipmentModelAdmin` (importar `EquipmentComponent`).

- [ ] **Step 5: Generar y aplicar la migración**

Run: `docker compose exec backend python manage.py makemigrations equipment`
Run: `docker compose exec backend python manage.py migrate`
Expected: aplica sin errores.

- [ ] **Step 6: Correr los tests**

Run: `docker compose exec backend pytest apps/equipment/tests/test_catalog.py -v`
Expected: PASS (todos, incl. los 4 nuevos de componentes).

- [ ] **Step 7: Commit**

```bash
git add backend/apps/equipment/models.py backend/apps/equipment/admin.py backend/apps/equipment/migrations/ backend/apps/equipment/tests/test_catalog.py
git commit -m "feat(equipment): agrega árbol EquipmentComponent con path y validaciones

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `ProductCompatibility` (puente inventario↔modelo↔componente)

**Files:**
- Modify: `backend/apps/inventory/models.py`
- Modify: `backend/apps/inventory/admin.py`
- Create: `backend/apps/inventory/tests/test_compatibility.py`
- Migration: autogenerada

**Interfaces:**
- Consumes: `equipment.EquipmentModel`, `equipment.EquipmentComponent`, `inventory.Product`.
- Produces: `ProductCompatibility(product, equipment_model, component, is_primary, notes)`; único por `(product, equipment_model, component)`; `clean()` valida `component.equipment_model == equipment_model`; related_name `compatibilities` (en Product) y `product_compatibilities` (en model y component).

- [ ] **Step 1: Escribir los tests que fallan**

Crear `backend/apps/inventory/tests/test_compatibility.py`:

```python
import pytest
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError

from apps.equipment.models import EquipmentModel, EquipmentType, EquipmentComponent
from apps.inventory.models import Product, ProductCompatibility


@pytest.fixture
def setup(db):
    t, _ = EquipmentType.objects.get_or_create(name="Drone agrícola")
    m = EquipmentModel.objects.create(equipment_type=t, brand="DJI", name="T50", model_code="T50")
    comp = EquipmentComponent.objects.create(equipment_model=m, code="motor_m1", name="Motor")
    prod = Product.objects.create(sku="MOT-1", name="Motor CW")
    return m, comp, prod


@pytest.mark.django_db
def test_create_valid_compatibility(setup):
    m, comp, prod = setup
    c = ProductCompatibility.objects.create(product=prod, equipment_model=m, component=comp, is_primary=True)
    c.full_clean()  # no debe lanzar
    assert list(prod.compatibilities.all()) == [c]
    assert list(comp.product_compatibilities.all()) == [c]


@pytest.mark.django_db
def test_compatibility_unique_triple(setup):
    m, comp, prod = setup
    ProductCompatibility.objects.create(product=prod, equipment_model=m, component=comp)
    with pytest.raises(IntegrityError):
        ProductCompatibility.objects.create(product=prod, equipment_model=m, component=comp)


@pytest.mark.django_db
def test_compatibility_component_must_belong_to_model(setup):
    m, comp, prod = setup
    other = EquipmentModel.objects.create(
        equipment_type=m.equipment_type, brand="DJI", name="D125", model_code="D125"
    )
    c = ProductCompatibility(product=prod, equipment_model=other, component=comp)
    with pytest.raises(DjangoValidationError):
        c.full_clean()
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `docker compose exec backend pytest apps/inventory/tests/test_compatibility.py -v`
Expected: FAIL (ImportError: ProductCompatibility).

- [ ] **Step 3: Implementar el modelo**

En `backend/apps/inventory/models.py`, al final del archivo, agregar (con `from django.core.exceptions import ValidationError` arriba):

```python
class ProductCompatibility(TimeStampedModel):
    product = models.ForeignKey(
        Product, on_delete=models.CASCADE, related_name="compatibilities"
    )
    equipment_model = models.ForeignKey(
        "equipment.EquipmentModel",
        on_delete=models.CASCADE,
        related_name="product_compatibilities",
    )
    component = models.ForeignKey(
        "equipment.EquipmentComponent",
        on_delete=models.CASCADE,
        related_name="product_compatibilities",
    )
    is_primary = models.BooleanField(default=False)
    notes = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        ordering = ("id",)
        indexes = [
            models.Index(fields=["product"]),
            models.Index(fields=["equipment_model"]),
            models.Index(fields=["component"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["product", "equipment_model", "component"],
                name="uniq_product_model_component",
            )
        ]
        verbose_name_plural = "Product compatibilities"

    def __str__(self):
        return f"{self.product} → {self.component}"

    def clean(self):
        if (
            self.component_id
            and self.equipment_model_id
            and self.component.equipment_model_id != self.equipment_model_id
        ):
            raise ValidationError(
                {"component": "El componente no pertenece al modelo indicado."}
            )
```

Agregar `from django.core.exceptions import ValidationError` al inicio de `inventory/models.py` si no está.

- [ ] **Step 4: Registrar en el admin**

En `backend/apps/inventory/admin.py` (leer el archivo primero para conocer el `ProductAdmin` existente), agregar:

```python
class ProductCompatibilityInline(admin.TabularInline):
    model = ProductCompatibility
    fields = ("equipment_model", "component", "is_primary", "notes")
    extra = 0


@admin.register(ProductCompatibility)
class ProductCompatibilityAdmin(admin.ModelAdmin):
    list_display = ("product", "equipment_model", "component", "is_primary")
    list_filter = ("equipment_model", "is_primary")
    search_fields = ("product__sku", "product__name")
```

Importar `ProductCompatibility` y añadir `inlines = [ProductCompatibilityInline]` al `ProductAdmin` existente (si no hay `ProductAdmin` registrado, registrarlo con ese inline).

- [ ] **Step 5: Generar y aplicar la migración**

Run: `docker compose exec backend python manage.py makemigrations inventory`
Run: `docker compose exec backend python manage.py migrate`

- [ ] **Step 6: Correr los tests**

Run: `docker compose exec backend pytest apps/inventory/tests/test_compatibility.py -v`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add backend/apps/inventory/models.py backend/apps/inventory/admin.py backend/apps/inventory/migrations/ backend/apps/inventory/tests/test_compatibility.py
git commit -m "feat(inventory): agrega ProductCompatibility (pieza↔modelo↔componente)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `ServiceOrderPart.component`

**Files:**
- Modify: `backend/apps/service_orders/models.py`
- Create: `backend/apps/service_orders/tests/test_part_component.py`
- Migration: autogenerada

**Interfaces:**
- Consumes: `equipment.EquipmentComponent`.
- Produces: `ServiceOrderPart.component` (FK PROTECT, null/blank, related_name `service_order_parts`). Opcional: órdenes/piezas antiguas siguen igual.

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/apps/service_orders/tests/test_part_component.py`:

```python
import pytest
from decimal import Decimal

from apps.customers.models import Customer
from apps.equipment.models import EquipmentType, EquipmentModel, EquipmentComponent
from apps.inventory.models import Product
from apps.service_orders.models import ServiceOrder, ServiceOrderPart


@pytest.mark.django_db
def test_part_component_optional_and_linked():
    cli = Customer.objects.create(name="C")
    prod = Product.objects.create(sku="P1", name="P1")
    order = ServiceOrder.objects.create(customer=cli)

    # Sin componente (modo heredado)
    p1 = ServiceOrderPart.objects.create(service_order=order, product=prod, quantity=Decimal("1"))
    assert p1.component is None

    # Con componente (modo estructurado)
    t, _ = EquipmentType.objects.get_or_create(name="Drone agrícola")
    m = EquipmentModel.objects.create(equipment_type=t, brand="DJI", name="T50", model_code="T50")
    comp = EquipmentComponent.objects.create(equipment_model=m, code="motor_m1", name="Motor")
    p2 = ServiceOrderPart.objects.create(
        service_order=order, product=prod, quantity=Decimal("1"), component=comp
    )
    assert p2.component == comp
    assert list(comp.service_order_parts.all()) == [p2]
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `docker compose exec backend pytest apps/service_orders/tests/test_part_component.py -v`
Expected: FAIL (TypeError/FieldError: 'component').

- [ ] **Step 3: Implementar el campo**

En `backend/apps/service_orders/models.py`, en la clase `ServiceOrderPart`, tras el campo `product`, agregar:

```python
    component = models.ForeignKey(
        "equipment.EquipmentComponent",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="service_order_parts",
    )
```

- [ ] **Step 4: Generar y aplicar la migración**

Run: `docker compose exec backend python manage.py makemigrations service_orders`
Run: `docker compose exec backend python manage.py migrate`

- [ ] **Step 5: Correr el test**

Run: `docker compose exec backend pytest apps/service_orders/tests/test_part_component.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/service_orders/models.py backend/apps/service_orders/migrations/ backend/apps/service_orders/tests/test_part_component.py
git commit -m "feat(service-orders): agrega ServiceOrderPart.component opcional

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Comando de seed `seed_equipment_catalog` (T50 + D12500iE)

**Files:**
- Create: `backend/apps/equipment/management/__init__.py`
- Create: `backend/apps/equipment/management/commands/__init__.py`
- Create: `backend/apps/equipment/management/commands/seed_equipment_catalog.py`
- Create: `backend/apps/equipment/tests/test_seed_catalog.py`

**Interfaces:**
- Consumes: `EquipmentType`, `EquipmentModel`, `EquipmentComponent`.
- Produces: comando `manage.py seed_equipment_catalog` idempotente que crea los dos modelos y sus árboles con `get_or_create`. Reejecutable sin duplicar. NO crea `ProductCompatibility`.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `backend/apps/equipment/tests/test_seed_catalog.py`:

```python
import pytest
from django.core.management import call_command

from apps.equipment.models import EquipmentModel, EquipmentComponent


@pytest.mark.django_db
def test_seed_creates_both_models_and_trees():
    call_command("seed_equipment_catalog")
    t50 = EquipmentModel.objects.get(model_code="T50")
    d125 = EquipmentModel.objects.get(model_code="D12500IE")
    assert t50.name == "DJI Agras T50"
    assert d125.name == "DJI D12500iE"
    # Conjuntos raíz del T50
    roots = set(
        EquipmentComponent.objects.filter(
            equipment_model=t50, parent__isnull=True
        ).values_list("code", flat=True)
    )
    assert {"propulsion", "spray", "electrical", "navigation", "structure", "spreading"} <= roots
    # Un nodo hoja profundo del T50
    assert EquipmentComponent.objects.filter(equipment_model=t50, code="motor_m1").exists()
    # D12500iE tiene su árbol
    assert EquipmentComponent.objects.filter(equipment_model=d125, code="engine").exists()


@pytest.mark.django_db
def test_seed_is_idempotent():
    call_command("seed_equipment_catalog")
    n_models = EquipmentModel.objects.count()
    n_components = EquipmentComponent.objects.count()
    call_command("seed_equipment_catalog")  # segunda vez
    assert EquipmentModel.objects.count() == n_models
    assert EquipmentComponent.objects.count() == n_components
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `docker compose exec backend pytest apps/equipment/tests/test_seed_catalog.py -v`
Expected: FAIL (CommandError: Unknown command 'seed_equipment_catalog').

- [ ] **Step 3: Crear el paquete de management commands y el comando**

Crear `backend/apps/equipment/management/__init__.py` (vacío) y `backend/apps/equipment/management/commands/__init__.py` (vacío).

Crear `backend/apps/equipment/management/commands/seed_equipment_catalog.py`:

```python
"""Seed idempotente del catálogo técnico: DJI Agras T50 y DJI D12500iE.

Reejecutable sin duplicar (get_or_create por claves naturales). NO crea
compatibilidades de productos (se registran manualmente).
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.equipment.models import EquipmentType, EquipmentModel, EquipmentComponent

# Árbol como lista de (code, name, type, [hijos...]). type: "assembly"|"position".
A, P = "assembly", "position"

T50_TREE = [
    ("propulsion", "Sistema de propulsión", A, [
        ("arm_m1", "Brazo M1", A, [
            ("motor_m1", "Motor M1", P, []),
            ("esc_m1", "ESC M1", P, []),
            ("cable_esc_m1", "Cable ESC M1", P, []),
            ("prop_m1", "Hélice M1", P, []),
        ]),
        ("arm_m2", "Brazo M2", A, [
            ("motor_m2", "Motor M2", P, []),
            ("esc_m2", "ESC M2", P, []),
            ("cable_esc_m2", "Cable ESC M2", P, []),
            ("prop_m2", "Hélice M2", P, []),
        ]),
        ("arm_m3", "Brazo M3", A, [
            ("motor_m3", "Motor M3", P, []),
            ("esc_m3", "ESC M3", P, []),
            ("cable_esc_m3", "Cable ESC M3", P, []),
            ("prop_m3", "Hélice M3", P, []),
        ]),
        ("arm_m4", "Brazo M4", A, [
            ("motor_m4", "Motor M4", P, []),
            ("esc_m4", "ESC M4", P, []),
            ("cable_esc_m4", "Cable ESC M4", P, []),
            ("prop_m4", "Hélice M4", P, []),
        ]),
    ]),
    ("spray", "Sistema de pulverización", A, [
        ("spray_tank", "Tanque", P, []),
        ("spray_pump", "Bomba", P, []),
        ("spray_flowmeter", "Caudalímetro", P, []),
        ("spray_atomizer_left", "Atomizador izquierdo", P, []),
        ("spray_atomizer_right", "Atomizador derecho", P, []),
        ("spray_hoses", "Mangueras", P, []),
        ("spray_valves", "Válvulas", P, []),
    ]),
    ("electrical", "Sistema eléctrico", A, [
        ("elec_power_dist", "Distribución de potencia", P, []),
        ("elec_battery_port", "Puerto de batería", P, []),
        ("elec_main_wiring", "Cableado principal", P, []),
        ("elec_connectors", "Conectores", P, []),
    ]),
    ("navigation", "Navegación y seguridad", A, [
        ("nav_radar", "Radar", P, []),
        ("nav_fpv", "Cámara FPV", P, []),
        ("nav_antennas", "Antenas", P, []),
        ("nav_rtk", "Módulo RTK", P, []),
    ]),
    ("structure", "Estructura", A, [
        ("struct_frame", "Chasis central", P, []),
        ("struct_landing", "Tren de aterrizaje", P, []),
        ("struct_covers", "Cubiertas", P, []),
        ("struct_mounts", "Soportes", P, []),
    ]),
    ("spreading", "Sistema de esparcimiento", A, [
        ("spread_hopper", "Tolva", P, []),
        ("spread_motor", "Motor del esparcidor", P, []),
        ("spread_disc", "Disco", P, []),
        ("spread_weight_sensor", "Sensor de peso", P, []),
    ]),
]

D12500_TREE = [
    ("engine", "Motor", A, [
        ("ign_system", "Sistema de encendido", A, [
            ("spark_plug", "Bujía", P, []),
        ]),
        ("air_filter", "Filtro de aire", P, []),
        ("start_system", "Sistema de arranque", P, []),
        ("intake", "Admisión", P, []),
        ("exhaust", "Escape", P, []),
    ]),
    ("fuel", "Sistema de combustible", A, [
        ("fuel_tank", "Tanque", P, []),
        ("fuel_hoses", "Mangueras", P, []),
        ("fuel_filter", "Filtro de combustible", P, []),
        ("fuel_pump", "Bomba de combustible", P, []),
    ]),
    ("electrical", "Sistema eléctrico", A, [
        ("alternator", "Alternador", P, []),
        ("regulator", "Regulador", P, []),
        ("inverter", "Módulo inversor", P, []),
        ("start_battery", "Batería de arranque", P, []),
        ("fuses", "Fusibles", P, []),
        ("wiring", "Cableado", P, []),
    ]),
    ("cooling", "Refrigeración", A, [
        ("fan", "Ventilador", P, []),
        ("ducts", "Conductos", P, []),
        ("temp_sensor", "Sensor de temperatura", P, []),
    ]),
    ("control_panel", "Panel de control", A, [
        ("screen", "Pantalla", P, []),
        ("switches", "Interruptores", P, []),
        ("outlets", "Tomas de salida", P, []),
        ("panel_connectors", "Conectores", P, []),
    ]),
    ("structure", "Estructura", A, [
        ("chassis", "Chasis", P, []),
        ("covers", "Cubiertas", P, []),
        ("mounts", "Soportes", P, []),
        ("dampers", "Amortiguadores", P, []),
    ]),
]


def _build(model, nodes, parent=None, order_start=0):
    for i, (code, name, ctype, children) in enumerate(nodes):
        comp, _ = EquipmentComponent.objects.get_or_create(
            equipment_model=model,
            code=code,
            defaults={
                "name": name,
                "component_type": ctype,
                "parent": parent,
                "diagram_key": code,
                "sort_order": order_start + i,
            },
        )
        _build(model, children, parent=comp)


class Command(BaseCommand):
    help = "Siembra el catálogo técnico DJI Agras T50 y DJI D12500iE (idempotente)."

    @transaction.atomic
    def handle(self, *args, **options):
        drone, _ = EquipmentType.objects.get_or_create(name="Drone agrícola")
        planta, _ = EquipmentType.objects.get_or_create(name="Planta eléctrica")

        t50, _ = EquipmentModel.objects.get_or_create(
            brand="DJI", model_code="T50", revision="",
            defaults={"equipment_type": drone, "name": "DJI Agras T50"},
        )
        d125, _ = EquipmentModel.objects.get_or_create(
            brand="DJI", model_code="D12500IE", revision="",
            defaults={"equipment_type": planta, "name": "DJI D12500iE"},
        )
        _build(t50, T50_TREE)
        _build(d125, D12500_TREE)
        self.stdout.write(self.style.SUCCESS("Catálogo técnico sembrado (T50 + D12500iE)."))
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `docker compose exec backend pytest apps/equipment/tests/test_seed_catalog.py -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Ejecutar el seed en la base de desarrollo**

Run: `docker compose exec backend python manage.py seed_equipment_catalog`
Expected: "Catálogo técnico sembrado (T50 + D12500iE)."

- [ ] **Step 6: Commit**

```bash
git add backend/apps/equipment/management/ backend/apps/equipment/tests/test_seed_catalog.py
git commit -m "feat(equipment): comando idempotente seed_equipment_catalog (T50, D12500iE)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Verificación de regresión de la Etapa 1

**Files:** ninguno (solo verificación).

- [ ] **Step 1: Correr las suites afectadas completas**

Run: `docker compose exec backend pytest apps/equipment apps/inventory apps/service_orders -q`
Expected: PASS (todas — nuevas + existentes; los campos nuevos son opcionales y no rompen nada).

- [ ] **Step 2: Verificar que no quedan migraciones sin generar**

Run: `docker compose exec backend python manage.py makemigrations --check --dry-run`
Expected: "No changes detected" (o sin migraciones faltantes para equipment/inventory/service_orders).

Si falla algún test o falta una migración, reportar antes de cerrar la etapa.

## Notas / decisiones

- **Tipos de equipo reutilizados:** el seed usa "Drone agrícola" (T50) y "Planta eléctrica" (D12500iE) — ya existen por la data-migration `0002_seed_equipment_types` — en vez de crear "Dron agrícola"/"Generador" duplicados. Documentado por si se prefiere lo contrario.
- **`diagram_key` = `code`** por defecto en el seed, para que Etapa 4 (SVG) tenga claves estables (`propulsion`, `arm_m1`, `spray`, `engine`, …). Ajustables luego desde admin.
- Las validaciones de árbol/compatibilidad viven en `clean()` (probadas con `full_clean()`); la Etapa 2 las hará cumplir vía serializers en la API.
- No se crean `ProductCompatibility` automáticas (restricción del encargo).
