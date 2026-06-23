# Productos y calculadora de mezcla — Backend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backend para registrar una lista de productos (con dosis por hectárea, líquidos o granulados) por trabajo de campo, y una calculadora de mezcla que reparta químico líquido vs agua por tanque.

**Architecture:** Nuevo modelo `FieldJobProduct` (relacionado a `FieldJob`), escritura anidada en `FieldJobSerializer`, y reemplazo de la calculadora `calculate_spray_mix` (modelo "dosis por litro") por `calculate_mix` (modelo "dosis por hectárea" con clasificación líquido/sólido y agua = caldo − químico líquido). Default del tanque a 200 L en `CompanyProfile`.

**Tech Stack:** Django + DRF, pytest. Solo backend en este plan (web y móvil son planes posteriores).

## Global Constraints

- **Agua = caldo total − químico líquido.** Los granulados (sólidos) van aparte (no restan agua).
- El **caldo por hectárea** lo ingresa el usuario (campo `caldo_per_hectare` en el cálculo; en `FieldJob` se reutiliza `water_per_hectare`, solo relabel en la UI — no cambia el nombre del campo).
- Unidades: líquidas `L/ha`, `mL/ha`, `cc/ha` (base = litros); sólidas `kg/ha`, `g/ha` (base = kilogramos). Conversión: `mL/cc → ÷1000`, `g → ÷1000`.
- Resultado del cálculo reportado en **L** (líquidos) o **kg** (sólidos), redondeado a 3 decimales.
- Default de tanque/mixer: **200 L** (`CompanyProfile.drone_tank_volume_liters`).
- `applied_product` queda legacy (no se borra la columna; se acepta/devuelve si viene).
- Backend en Docker. Tests: `docker compose exec -T backend pytest <ruta> -v` desde la raíz. Migraciones: `docker compose exec -T backend python manage.py makemigrations <app>`.

**Spec de referencia:** `docs/superpowers/specs/2026-06-21-productos-mezcla-trabajos-campo-design.md` (aprobado).

---

### Task 1: Modelo `FieldJobProduct`

**Files:**
- Modify: `backend/apps/field_jobs/models.py` (añadir `FieldJobProduct`)
- Create: `backend/apps/field_jobs/migrations/000X_fieldjobproduct.py` (vía makemigrations)
- Test: `backend/apps/field_jobs/tests/test_products_model.py`

**Interfaces:**
- Produces: `apps.field_jobs.models.FieldJobProduct` (`field_job` FK CASCADE `related_name="products"`, `name` CharField(150), `dose_per_hectare` Decimal(10,4), `unit` CharField(10) con choices `L/ha`,`mL/ha`,`cc/ha`,`kg/ha`,`g/ha`).

- [ ] **Step 1: Escribir el test (falla)**

Crear `backend/apps/field_jobs/tests/test_products_model.py`:

```python
from decimal import Decimal

import pytest

from apps.customers.models import Customer
from apps.field_jobs.models import FieldJob, FieldJobProduct


@pytest.mark.django_db
def test_field_job_has_products():
    job = FieldJob.objects.create(customer=Customer.objects.create(name="C"))
    FieldJobProduct.objects.create(field_job=job, name="Glifosato", dose_per_hectare=Decimal("1.5"), unit="L/ha")
    FieldJobProduct.objects.create(field_job=job, name="Urea", dose_per_hectare=Decimal("2"), unit="kg/ha")
    names = list(job.products.values_list("name", flat=True))
    assert names == ["Glifosato", "Urea"]  # ordenado por id


@pytest.mark.django_db
def test_deleting_job_cascades_products():
    job = FieldJob.objects.create(customer=Customer.objects.create(name="C"))
    FieldJobProduct.objects.create(field_job=job, name="X", dose_per_hectare=Decimal("1"), unit="L/ha")
    job.delete()
    assert FieldJobProduct.objects.count() == 0
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `docker compose exec -T backend pytest apps/field_jobs/tests/test_products_model.py -v`
Expected: FAIL (no existe `FieldJobProduct`).

- [ ] **Step 3: Añadir el modelo**

En `backend/apps/field_jobs/models.py`, al final del archivo (tras la clase `FieldJob`):

```python
class FieldJobProduct(TimeStampedModel):
    class Unit(models.TextChoices):
        L_HA = "L/ha", "L/ha"
        ML_HA = "mL/ha", "mL/ha"
        CC_HA = "cc/ha", "cc/ha"
        KG_HA = "kg/ha", "kg/ha"
        G_HA = "g/ha", "g/ha"

    field_job = models.ForeignKey(
        FieldJob, on_delete=models.CASCADE, related_name="products"
    )
    name = models.CharField(max_length=150)
    dose_per_hectare = models.DecimalField(max_digits=10, decimal_places=4, default=0)
    unit = models.CharField(max_length=10, choices=Unit.choices, default=Unit.L_HA)

    class Meta:
        ordering = ("id",)

    def __str__(self):
        return f"{self.name} ({self.dose_per_hectare} {self.unit})"
```

- [ ] **Step 4: Generar la migración**

Run: `docker compose exec -T backend python manage.py makemigrations field_jobs`
Expected: crea `apps/field_jobs/migrations/000X_fieldjobproduct.py`.

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `docker compose exec -T backend pytest apps/field_jobs/tests/test_products_model.py -v`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/apps/field_jobs/models.py backend/apps/field_jobs/migrations/ backend/apps/field_jobs/tests/test_products_model.py
git commit -m "feat(field-jobs): modelo FieldJobProduct (productos por trabajo)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Calculadora `calculate_mix` (reemplaza `calculate_spray_mix`)

**Files:**
- Modify: `backend/apps/field_jobs/services.py` (reemplazar `calculate_spray_mix` por `calculate_mix`; quitar `_unit_label`)
- Modify: `backend/apps/field_jobs/views.py` (import + la acción `calculate-mix`)
- Delete + recreate: `backend/apps/field_jobs/tests/test_spray_mix.py` → `backend/apps/field_jobs/tests/test_mix.py`
- Modify: `backend/apps/field_jobs/tests/test_api.py` (actualizar los 2 tests de `calculate-mix`)

**Interfaces:**
- Consumes: nada de tareas previas.
- Produces: `services.calculate_mix(*, hectares, caldo_per_hectare, tank_volume_liters, products) -> dict`. `products`: `[{"name","dose_per_hectare","unit"}]`. Respuesta con `total_caldo_liters, liquid_chemical_liters, water_liters, tanks_needed, full_tanks, last_tank_liters, products_total[], per_full_tank[], water_per_full_tank, last_tank[], water_last_tank`.

- [ ] **Step 1: Reescribir el test del cálculo (falla)**

Borrar `backend/apps/field_jobs/tests/test_spray_mix.py` y crear `backend/apps/field_jobs/tests/test_mix.py`:

```python
import pytest
from rest_framework.exceptions import ValidationError

from apps.field_jobs.services import calculate_mix


def _products():
    return [
        {"name": "Glifosato", "dose_per_hectare": 1.5, "unit": "L/ha"},
        {"name": "Coadyuvante", "dose_per_hectare": 200, "unit": "cc/ha"},
        {"name": "Urea", "dose_per_hectare": 2, "unit": "kg/ha"},
    ]


def test_multi_tank_example():
    r = calculate_mix(hectares=50, caldo_per_hectare=8, tank_volume_liters=200, products=_products())
    assert r["total_caldo_liters"] == 400.0
    assert r["liquid_chemical_liters"] == 85.0   # 75 L + 10 L (200 cc/ha * 50 ha = 10000 cc = 10 L)
    assert r["water_liters"] == 315.0
    assert r["tanks_needed"] == 2
    assert r["full_tanks"] == 2
    assert r["last_tank_liters"] == 0.0
    assert r["products_total"] == [
        {"name": "Glifosato", "quantity": 75.0, "unit": "L"},
        {"name": "Coadyuvante", "quantity": 10.0, "unit": "L"},
        {"name": "Urea", "quantity": 100.0, "unit": "kg"},
    ]
    assert r["per_full_tank"] == [
        {"name": "Glifosato", "quantity": 37.5, "unit": "L"},
        {"name": "Coadyuvante", "quantity": 5.0, "unit": "L"},
        {"name": "Urea", "quantity": 50.0, "unit": "kg"},
    ]
    assert r["water_per_full_tank"] == 157.5
    assert r["last_tank"] == []


def test_single_partial_tank():
    r = calculate_mix(hectares=10, caldo_per_hectare=8, tank_volume_liters=200, products=_products())
    assert r["total_caldo_liters"] == 80.0
    assert r["tanks_needed"] == 1
    assert r["full_tanks"] == 0
    assert r["last_tank_liters"] == 80.0
    # 1.5*10=15 L glifosato; 200cc*10=2000cc=2 L coadyuvante; urea 20 kg
    assert r["water_last_tank"] == 63.0  # 80 - (15+2)
    assert r["last_tank"][0] == {"name": "Glifosato", "quantity": 15.0, "unit": "L"}
    assert r["last_tank"][2] == {"name": "Urea", "quantity": 20.0, "unit": "kg"}
    assert r["per_full_tank"] == []


def test_unit_conversions():
    r = calculate_mix(
        hectares=1, caldo_per_hectare=100, tank_volume_liters=1000,
        products=[
            {"name": "A", "dose_per_hectare": 500, "unit": "cc/ha"},  # 0.5 L
            {"name": "B", "dose_per_hectare": 500, "unit": "g/ha"},   # 0.5 kg
        ],
    )
    assert r["products_total"] == [
        {"name": "A", "quantity": 0.5, "unit": "L"},
        {"name": "B", "quantity": 0.5, "unit": "kg"},
    ]
    assert r["liquid_chemical_liters"] == 0.5


@pytest.mark.parametrize(
    "kwargs",
    [
        dict(hectares=0, caldo_per_hectare=8, tank_volume_liters=200),
        dict(hectares=10, caldo_per_hectare=0, tank_volume_liters=200),
        dict(hectares=10, caldo_per_hectare=8, tank_volume_liters=0),
    ],
)
def test_rejects_nonpositive(kwargs):
    with pytest.raises(ValidationError):
        calculate_mix(products=_products(), **kwargs)


def test_rejects_empty_products():
    with pytest.raises(ValidationError):
        calculate_mix(hectares=10, caldo_per_hectare=8, tank_volume_liters=200, products=[])


def test_rejects_bad_unit():
    with pytest.raises(ValidationError):
        calculate_mix(
            hectares=10, caldo_per_hectare=8, tank_volume_liters=200,
            products=[{"name": "X", "dose_per_hectare": 1, "unit": "L/L"}],
        )
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `docker compose exec -T backend pytest apps/field_jobs/tests/test_mix.py -v`
Expected: FAIL (`calculate_mix` no existe).

- [ ] **Step 3: Reemplazar la función en `services.py`**

En `backend/apps/field_jobs/services.py`, **quitar** `_unit_label` y `calculate_spray_mix`, y añadir:

```python
_UNIT_BASE = {
    "L/ha": ("L", 1.0),
    "cc/ha": ("L", 0.001),
    "kg/ha": ("kg", 1.0),
    "g/ha": ("kg", 0.001),
}


def calculate_mix(*, hectares, caldo_per_hectare, tank_volume_liters, products):
    if hectares is None or float(hectares) <= 0:
        raise ValidationError({"hectares": "Debe ser mayor que cero."})
    if caldo_per_hectare is None or float(caldo_per_hectare) <= 0:
        raise ValidationError({"caldo_per_hectare": "Debe ser mayor que cero."})
    if tank_volume_liters is None or float(tank_volume_liters) <= 0:
        raise ValidationError({"tank_volume_liters": "Debe ser mayor que cero."})
    if not products:
        raise ValidationError({"products": "Agregue al menos un producto."})

    hectares = float(hectares)
    caldo = float(caldo_per_hectare)
    tank = float(tank_volume_liters)
    total_caldo = hectares * caldo

    # (nombre, cantidad_base, unidad_base) por producto
    items = []
    for product in products:
        dose = product.get("dose_per_hectare")
        if dose is None or float(dose) <= 0:
            raise ValidationError(
                {"products": "Cada producto necesita dose_per_hectare > 0."}
            )
        unit = product.get("unit")
        if unit not in _UNIT_BASE:
            raise ValidationError({"products": f"Unidad inválida: {unit}."})
        base_unit, factor = _UNIT_BASE[unit]
        base_qty = float(dose) * hectares * factor
        items.append((product.get("name", ""), base_qty, base_unit))

    liquid_chemical = sum(qty for _, qty, base_unit in items if base_unit == "L")
    water = max(0.0, total_caldo - liquid_chemical)

    tanks_needed = math.ceil(total_caldo / tank)
    last_tank_liters = round(total_caldo - (tanks_needed - 1) * tank, 4)
    if abs(last_tank_liters - tank) < 1e-9:
        full_tanks = tanks_needed
        last_tank_liters = 0.0
    else:
        full_tanks = tanks_needed - 1

    def _loads(fraction):
        return [
            {"name": name, "quantity": round(qty * fraction, 3), "unit": base_unit}
            for name, qty, base_unit in items
        ]

    def _water_for(fill_liters):
        liquid_in = liquid_chemical * (fill_liters / total_caldo) if total_caldo else 0.0
        return round(max(0.0, fill_liters - liquid_in), 3)

    return {
        "total_caldo_liters": round(total_caldo, 3),
        "liquid_chemical_liters": round(liquid_chemical, 3),
        "water_liters": round(water, 3),
        "tanks_needed": tanks_needed,
        "full_tanks": full_tanks,
        "last_tank_liters": last_tank_liters,
        "products_total": [
            {"name": name, "quantity": round(qty, 3), "unit": base_unit}
            for name, qty, base_unit in items
        ],
        "per_full_tank": _loads(tank / total_caldo) if full_tanks > 0 else [],
        "water_per_full_tank": _water_for(tank) if full_tanks > 0 else 0.0,
        "last_tank": _loads(last_tank_liters / total_caldo) if last_tank_liters > 0 else [],
        "water_last_tank": _water_for(last_tank_liters) if last_tank_liters > 0 else 0.0,
    }
```

(`import math` y `from rest_framework.exceptions import ValidationError` ya están al inicio del archivo.)

- [ ] **Step 4: Actualizar la acción del viewset**

En `backend/apps/field_jobs/views.py`:
1. Cambiar el import de services: `from .services import calculate_mix, cancel_job, mark_done` (antes decía `calculate_spray_mix`).
2. Reemplazar la acción `calculate_mix` por (renombrando el método para no chocar con la función importada):

```python
    @action(
        detail=False,
        methods=["post"],
        url_path="calculate-mix",
        permission_classes=[IsAuthenticated],
    )
    def calculate_mix_action(self, request):
        data = request.data
        result = calculate_mix(
            hectares=data.get("hectares"),
            caldo_per_hectare=data.get("caldo_per_hectare"),
            tank_volume_liters=data.get("tank_volume_liters"),
            products=data.get("products") or [],
        )
        return Response(result)
```

- [ ] **Step 5: Actualizar los tests de API de `calculate-mix`**

En `backend/apps/field_jobs/tests/test_api.py`, reemplazar `test_calculate_mix_endpoint` y `test_calculate_mix_validation_error` por:

```python
@pytest.mark.django_db
def test_calculate_mix_endpoint(customer):
    c = _client("technician")
    resp = c.post(
        f"{URL}calculate-mix/",
        {"hectares": 50, "caldo_per_hectare": 8, "tank_volume_liters": 200,
         "products": [{"name": "Glifosato", "dose_per_hectare": 1.5, "unit": "L/ha"},
                      {"name": "Urea", "dose_per_hectare": 2, "unit": "kg/ha"}]},
        format="json",
    )
    assert resp.status_code == 200, resp.data
    assert resp.data["water_liters"] == 325.0   # 400 caldo - 75 L glifosato
    assert resp.data["tanks_needed"] == 2


@pytest.mark.django_db
def test_calculate_mix_validation_error(customer):
    c = _client("technician")
    resp = c.post(
        f"{URL}calculate-mix/",
        {"hectares": 0, "caldo_per_hectare": 8, "tank_volume_liters": 200,
         "products": [{"name": "X", "dose_per_hectare": 1, "unit": "L/ha"}]},
        format="json",
    )
    assert resp.status_code == 400
```

- [ ] **Step 6: Correr los tests y verificar que pasan**

Run: `docker compose exec -T backend pytest apps/field_jobs/tests/test_mix.py apps/field_jobs/tests/test_api.py -v`
Expected: PASS (todos).

- [ ] **Step 7: Commit**

```bash
git add backend/apps/field_jobs/services.py backend/apps/field_jobs/views.py backend/apps/field_jobs/tests/test_mix.py backend/apps/field_jobs/tests/test_api.py
git rm backend/apps/field_jobs/tests/test_spray_mix.py 2>/dev/null || true
git commit -m "feat(field-jobs): calculate_mix por dosis/ha (liquido vs agua, granulado aparte)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Escritura anidada de `products` en el serializer

**Files:**
- Modify: `backend/apps/field_jobs/serializers.py` (`FieldJobProductSerializer` + `products` anidado)
- Modify: `backend/apps/field_jobs/views.py` (`get_queryset`: prefetch `products`)
- Test: `backend/apps/field_jobs/tests/test_products_api.py`

**Interfaces:**
- Consumes: `FieldJobProduct` (Task 1).
- Produces: `FieldJobSerializer` acepta/devuelve `products` (lista de `{id, name, dose_per_hectare, unit}`); en create/update reemplaza el conjunto.

- [ ] **Step 1: Escribir los tests (fallan)**

Crear `backend/apps/field_jobs/tests/test_products_api.py`:

```python
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.customers.models import Customer
from apps.field_jobs.models import FieldJob

User = get_user_model()
URL = "/api/field-jobs/"


def _client(role="technician"):
    user = User.objects.create_user(email=f"{role}@v.com", password="x", full_name=role, role=role)
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture
def customer(db):
    return Customer.objects.create(name="Finca")


@pytest.mark.django_db
def test_create_job_with_products(customer):
    c = _client()
    resp = c.post(
        URL,
        {"customer": customer.id, "job_type": "fumigation",
         "products": [{"name": "Glifosato", "dose_per_hectare": "1.5", "unit": "L/ha"},
                      {"name": "Urea", "dose_per_hectare": "2", "unit": "kg/ha"}]},
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert [p["name"] for p in resp.data["products"]] == ["Glifosato", "Urea"]
    job = FieldJob.objects.get(pk=resp.data["id"])
    assert job.products.count() == 2


@pytest.mark.django_db
def test_update_replaces_products(customer):
    c = _client()
    job = FieldJob.objects.create(customer=customer)
    job.products.create(name="Viejo", dose_per_hectare="1", unit="L/ha")
    resp = c.patch(
        f"{URL}{job.id}/",
        {"products": [{"name": "Nuevo", "dose_per_hectare": "3", "unit": "kg/ha"}]},
        format="json",
    )
    assert resp.status_code == 200, resp.data
    names = list(job.products.values_list("name", flat=True))
    assert names == ["Nuevo"]


@pytest.mark.django_db
def test_detail_returns_products(customer):
    c = _client()
    job = FieldJob.objects.create(customer=customer)
    job.products.create(name="Glifosato", dose_per_hectare="1.5", unit="L/ha")
    resp = c.get(f"{URL}{job.id}/")
    assert resp.status_code == 200
    assert resp.data["products"][0]["name"] == "Glifosato"
    assert resp.data["products"][0]["unit"] == "L/ha"
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `docker compose exec -T backend pytest apps/field_jobs/tests/test_products_api.py -v`
Expected: FAIL (`products` no está en el serializer).

- [ ] **Step 3: Añadir el serializer anidado y create/update**

En `backend/apps/field_jobs/serializers.py`:
1. Ampliar el import del modelo: `from .models import FieldJob, FieldJobProduct`.
2. Añadir antes de `FieldJobSerializer`:

```python
class FieldJobProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = FieldJobProduct
        fields = ("id", "name", "dose_per_hectare", "unit")
```

3. En `FieldJobSerializer`, declarar el campo anidado (junto a los demás campos declarados):

```python
    products = FieldJobProductSerializer(many=True, required=False)
```

4. Añadir `"products"` a `Meta.fields` (p. ej. tras `"applied_product"`).

5. Añadir `create`/`update` a `FieldJobSerializer`:

```python
    def create(self, validated_data):
        products = validated_data.pop("products", [])
        job = super().create(validated_data)
        for product in products:
            FieldJobProduct.objects.create(field_job=job, **product)
        return job

    def update(self, instance, validated_data):
        products = validated_data.pop("products", None)
        job = super().update(instance, validated_data)
        if products is not None:
            job.products.all().delete()
            for product in products:
                FieldJobProduct.objects.create(field_job=job, **product)
        return job
```

- [ ] **Step 4: Prefetch en el viewset**

En `backend/apps/field_jobs/views.py`, en `FieldJobViewSet.get_queryset`, ampliar el `prefetch_related` para incluir `products`:

```python
        qs = FieldJob.objects.select_related(
            "customer", "equipment", "technician"
        ).prefetch_related("invoices", "products")
```

- [ ] **Step 5: Correr los tests y la suite del módulo**

Run: `docker compose exec -T backend pytest apps/field_jobs -q`
Expected: PASS, sin regresiones (los nuevos + los existentes).

- [ ] **Step 6: Commit**

```bash
git add backend/apps/field_jobs/serializers.py backend/apps/field_jobs/views.py backend/apps/field_jobs/tests/test_products_api.py
git commit -m "feat(field-jobs): products anidados en el serializer (create/update/read)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Default del tanque a 200 L en `CompanyProfile`

**Files:**
- Modify: `backend/apps/core/models.py` (`drone_tank_volume_liters` default)
- Create: `backend/apps/core/migrations/000X_tank_default_200.py` (vía makemigrations)
- Test: `backend/apps/core/tests/test_company_defaults.py` (añadir caso)

**Interfaces:**
- Produces: `CompanyProfile.drone_tank_volume_liters` con default `200`.

- [ ] **Step 1: Escribir el test (falla)**

Añadir a `backend/apps/core/tests/test_company_defaults.py`:

```python
def test_drone_tank_default_is_200():
    from decimal import Decimal

    from apps.core.models import CompanyProfile

    # Instancia no guardada: aplica el default del campo.
    assert CompanyProfile().drone_tank_volume_liters == Decimal("200")
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `docker compose exec -T backend pytest apps/core/tests/test_company_defaults.py::test_drone_tank_default_is_200 -v`
Expected: FAIL (default es 30).

- [ ] **Step 3: Cambiar el default**

En `backend/apps/core/models.py`, en `CompanyProfile`, cambiar:

```python
    drone_tank_volume_liters = models.DecimalField(
        max_digits=8, decimal_places=2, default=200
    )
```

- [ ] **Step 4: Generar la migración**

Run: `docker compose exec -T backend python manage.py makemigrations core`
Expected: crea una migración de `AlterField` para `drone_tank_volume_liters`.

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `docker compose exec -T backend pytest apps/core/tests/test_company_defaults.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/core/models.py backend/apps/core/migrations/ backend/apps/core/tests/test_company_defaults.py
git commit -m "feat(core): default del tanque del dron a 200 L

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Notas de ejecución

- **Orden estricto:** 1 → 2 → 3 → 4. La 3 (serializer) depende del modelo (Task 1).
- **Reemplazo de la calculadora:** Task 2 borra `calculate_spray_mix`/`test_spray_mix.py` y actualiza la acción + sus tests de API. La web (`SprayMixModal`) y el móvil (`SprayCalculatorScreen`) que aún consumen el cuerpo viejo se reescriben en sus **planes de fase** (web/móvil), no acá; mientras tanto el endpoint ya responde con el nuevo contrato.
- **Fuera de alcance de este plan (planes posteriores):** UI web (lista de productos + calculadora) y UI móvil. Catálogo de productos, descuento de inventario, persistir el resultado del cálculo.
