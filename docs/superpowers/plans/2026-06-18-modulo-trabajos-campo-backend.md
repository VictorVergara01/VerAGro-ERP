# Módulo Trabajos de Campo (Fumigación) — Backend — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el backend del módulo de Trabajos de Campo (`field_jobs`): registrar trabajos de fumigación/esparcido con drones, cobrarlos por hectárea/quintal, facturarlos, y exponer una calculadora de mezclas.

**Architecture:** Nuevo app Django `apps/field_jobs/` con el modelo `FieldJob` (hereda `TimeStampedModel`), `services.py` para transiciones atómicas (patrón de `service_orders/services.py`), y un `FieldJobViewSet` (patrón de `ServiceOrderViewSet`). Integra con `billing` (nuevo tipo de factura `field_job` + `create_invoice_from_field_job`) y con `core.CompanyProfile` (precios base configurables). La calculadora de mezclas es un endpoint de cálculo puro sin persistencia.

**Tech Stack:** Django + DRF (ModelViewSet, SimpleRouter), pytest. Sólo backend en este plan (web y móvil son planes posteriores).

## Global Constraints

- Sólo backend en este plan. No tocar `frontend/` ni `mobile/`.
- Tarifas base (configurables en `CompanyProfile`): fumigación **$20/ha**, esparcido **$10/qq**, tanque dron **30 L**, agua de carga **8 L/ha**.
- Numeración del trabajo: `TC-NNNNNN` (correlativo del pk, relleno a 6 dígitos), autogenerado en `save()`.
- Numeración de factura de fumigación: prefijo **`FUM-`** (`FUM-NNNNNN`).
- Cobro: fumigación = `hectares × unit_price`; esparcido = `quintals × unit_price`. `total` es read-only, recalculado en servidor.
- Estados del trabajo: `scheduled → done → invoiced`, más `cancelled`. Choices: `JobType`(`fumigation`/`spreading`), `Status`, `RateUnit`(`L/ha`,`mL/ha`,`kg/ha`,`cc/ha`).
- Permisos: escritura para `ADMINS + technician` (= `roles.SERVICE_WRITE`); lectura para cualquier autenticado. La calculadora (`calculate-mix`) no exige rol especial (sólo autenticado).
- Backend corre en Docker. Tests: `docker compose exec -T backend pytest <ruta> -v` desde la raíz del repo. Tras editar `.py`, pytest lee del bind-mount (no requiere reinicio); reiniciar sólo si se consulta el servidor en vivo (`docker compose restart backend`).
- Decisión explícita del spec: el químico/producto es **texto libre**; NO se descuenta de inventario (follow-up).

**Spec de referencia:** `docs/superpowers/specs/2026-06-16-modulo-trabajos-campo-nuway-design.md` (aprobado).

---

### Task 1: App `field_jobs` + modelo `FieldJob`

**Files:**
- Create: `backend/apps/field_jobs/__init__.py`
- Create: `backend/apps/field_jobs/apps.py`
- Create: `backend/apps/field_jobs/models.py`
- Create: `backend/apps/field_jobs/migrations/__init__.py`
- Modify: `backend/config/settings/base.py:42` (registrar app en `LOCAL_APPS`)
- Test: `backend/apps/field_jobs/tests/__init__.py`, `backend/apps/field_jobs/tests/test_models.py`

**Interfaces:**
- Produces:
  - `apps.field_jobs.models.FieldJob` con choices anidadas `JobType`, `Status`, `RateUnit`.
  - `FieldJob.recalculate_total()` — setea `self.total` según `job_type` (no guarda; el llamador guarda).
  - `FieldJob.save()` — autogenera `number = "TC-{pk:06d}"`.
  - Campos clave: `number, job_type, status, customer(FK), equipment(FK null), technician(FK null), scheduled_date, done_date, location, crop, applied_product, hectares, quintals, unit_price, total, notes, created_by(FK null)` + campos nuWay opcionales: `application_rate, application_rate_unit, tank_volume_liters, water_per_hectare, latitude, longitude, wind_speed_kmh, temperature_celsius, humidity_percentage, weather_notes`.

- [ ] **Step 1: Crear el scaffold del app**

Crear `backend/apps/field_jobs/__init__.py` vacío.
Crear `backend/apps/field_jobs/migrations/__init__.py` vacío.
Crear `backend/apps/field_jobs/tests/__init__.py` vacío.
Crear `backend/apps/field_jobs/apps.py`:

```python
from django.apps import AppConfig


class FieldJobsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.field_jobs"
    verbose_name = "Trabajos de campo"
```

- [ ] **Step 2: Registrar el app en settings**

En `backend/config/settings/base.py`, en la lista `LOCAL_APPS`, añadir `"apps.field_jobs",` después de `"apps.billing",` (antes de `"apps.reports",`):

```python
    "apps.billing",
    "apps.field_jobs",
    "apps.reports",
```

- [ ] **Step 3: Escribir el modelo**

Crear `backend/apps/field_jobs/models.py`:

```python
from decimal import Decimal

from django.db import models
from django.utils import timezone

from apps.core.models import TimeStampedModel


class FieldJob(TimeStampedModel):
    class JobType(models.TextChoices):
        FUMIGATION = "fumigation", "Fumigación"
        SPREADING = "spreading", "Esparcido / abono"

    class Status(models.TextChoices):
        SCHEDULED = "scheduled", "Programado"
        DONE = "done", "Hecho"
        INVOICED = "invoiced", "Facturado"
        CANCELLED = "cancelled", "Cancelado"

    class RateUnit(models.TextChoices):
        L_HA = "L/ha", "L/ha"
        ML_HA = "mL/ha", "mL/ha"
        KG_HA = "kg/ha", "kg/ha"
        CC_HA = "cc/ha", "cc/ha"

    number = models.CharField(max_length=30, unique=True, blank=True)
    job_type = models.CharField(
        max_length=20, choices=JobType.choices, default=JobType.FUMIGATION
    )
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.SCHEDULED
    )
    customer = models.ForeignKey(
        "customers.Customer", on_delete=models.PROTECT, related_name="field_jobs"
    )
    equipment = models.ForeignKey(
        "equipment.Equipment",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="field_jobs",
    )
    technician = models.ForeignKey(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="field_jobs",
    )
    scheduled_date = models.DateField(default=timezone.localdate)
    done_date = models.DateField(null=True, blank=True)
    location = models.CharField(max_length=255, blank=True)
    crop = models.CharField(max_length=100, blank=True)
    applied_product = models.CharField(max_length=255, blank=True)
    hectares = models.DecimalField(max_digits=10, decimal_places=4, default=0)
    quintals = models.DecimalField(max_digits=10, decimal_places=4, default=0)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        "users.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )

    # --- Registro de aplicación (inspirado en nuWay AgTrack); todos opcionales ---
    application_rate = models.DecimalField(
        max_digits=10, decimal_places=4, null=True, blank=True
    )
    application_rate_unit = models.CharField(
        max_length=10, choices=RateUnit.choices, blank=True
    )
    tank_volume_liters = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )
    water_per_hectare = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )
    latitude = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )
    longitude = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )
    wind_speed_kmh = models.DecimalField(
        max_digits=5, decimal_places=1, null=True, blank=True
    )
    temperature_celsius = models.DecimalField(
        max_digits=5, decimal_places=1, null=True, blank=True
    )
    humidity_percentage = models.DecimalField(
        max_digits=5, decimal_places=1, null=True, blank=True
    )
    weather_notes = models.CharField(max_length=100, blank=True)

    class Meta:
        ordering = ("-scheduled_date", "-created_at")

    def __str__(self):
        return self.number or f"TC sin número (#{self.pk})"

    def recalculate_total(self):
        if self.job_type == self.JobType.FUMIGATION:
            base = (self.hectares or Decimal("0")) * (self.unit_price or Decimal("0"))
        else:
            base = (self.quintals or Decimal("0")) * (self.unit_price or Decimal("0"))
        self.total = base

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if not self.number:
            self.number = f"TC-{self.pk:06d}"
            super().save(update_fields=["number"])
```

- [ ] **Step 4: Escribir los tests del modelo (fallan)**

Crear `backend/apps/field_jobs/tests/test_models.py`:

```python
from decimal import Decimal

import pytest

from apps.customers.models import Customer
from apps.field_jobs.models import FieldJob


@pytest.mark.django_db
def test_number_autogenerated():
    job = FieldJob.objects.create(customer=Customer.objects.create(name="C1"))
    assert job.number == f"TC-{job.pk:06d}"


@pytest.mark.django_db
def test_recalculate_total_fumigation_uses_hectares():
    job = FieldJob(
        customer=Customer.objects.create(name="C2"),
        job_type=FieldJob.JobType.FUMIGATION,
        hectares=Decimal("12.5"),
        quintals=Decimal("99"),
        unit_price=Decimal("20"),
    )
    job.recalculate_total()
    assert job.total == Decimal("250.0000")  # 12.5 * 20; quintals ignorado


@pytest.mark.django_db
def test_recalculate_total_spreading_uses_quintals():
    job = FieldJob(
        customer=Customer.objects.create(name="C3"),
        job_type=FieldJob.JobType.SPREADING,
        hectares=Decimal("99"),
        quintals=Decimal("8"),
        unit_price=Decimal("10"),
    )
    job.recalculate_total()
    assert job.total == Decimal("80.0000")  # 8 * 10; hectares ignorado


@pytest.mark.django_db
def test_ordering_recent_scheduled_first():
    from datetime import date

    c = Customer.objects.create(name="C4")
    old = FieldJob.objects.create(customer=c, scheduled_date=date(2026, 1, 1))
    new = FieldJob.objects.create(customer=c, scheduled_date=date(2026, 6, 1))
    ids = list(FieldJob.objects.values_list("id", flat=True))
    assert ids.index(new.id) < ids.index(old.id)
```

- [ ] **Step 5: Generar la migración**

Run: `docker compose exec -T backend python manage.py makemigrations field_jobs`
Expected: crea `apps/field_jobs/migrations/0001_initial.py` con el modelo `FieldJob`.

- [ ] **Step 6: Correr los tests y verificar que pasan**

Run: `docker compose exec -T backend pytest apps/field_jobs/tests/test_models.py -v`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add backend/apps/field_jobs/ backend/config/settings/base.py
git commit -m "feat(field-jobs): app y modelo FieldJob con numeracion y calculo de total

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Campos de precios en `CompanyProfile`

**Files:**
- Modify: `backend/apps/core/models.py` (`CompanyProfile`)
- Create: `backend/apps/core/migrations/000X_company_field_job_defaults.py` (vía makemigrations)
- Test: `backend/apps/core/tests/test_company_defaults.py`

**Interfaces:**
- Produces: `CompanyProfile.fumigation_price_per_hectare`, `.spreading_price_per_quintal`, `.drone_tank_volume_liters`, `.default_water_per_hectare` (todos `DecimalField` con defaults 20/10/30/8).

- [ ] **Step 1: Escribir el test (falla)**

Crear `backend/apps/core/tests/test_company_defaults.py` (el paquete `apps/core/tests/` ya existe):

```python
from decimal import Decimal

import pytest

from apps.core.models import CompanyProfile


@pytest.mark.django_db
def test_company_profile_field_job_defaults():
    company = CompanyProfile.load()
    assert company.fumigation_price_per_hectare == Decimal("20")
    assert company.spreading_price_per_quintal == Decimal("10")
    assert company.drone_tank_volume_liters == Decimal("30")
    assert company.default_water_per_hectare == Decimal("8")
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `docker compose exec -T backend pytest apps/core/tests/test_company_defaults.py -v`
Expected: FAIL (`AttributeError`: el campo no existe).

- [ ] **Step 3: Añadir los campos al modelo**

En `backend/apps/core/models.py`, dentro de `CompanyProfile`, después del campo `invoice_footer` y antes de `updated_at`, añadir:

```python
    # --- Trabajos de campo (precios base configurables) ---
    fumigation_price_per_hectare = models.DecimalField(
        max_digits=10, decimal_places=2, default=20
    )
    spreading_price_per_quintal = models.DecimalField(
        max_digits=10, decimal_places=2, default=10
    )
    drone_tank_volume_liters = models.DecimalField(
        max_digits=8, decimal_places=2, default=30
    )
    default_water_per_hectare = models.DecimalField(
        max_digits=8, decimal_places=2, default=8
    )
```

- [ ] **Step 4: Generar la migración**

Run: `docker compose exec -T backend python manage.py makemigrations core`
Expected: crea una migración en `apps/core/migrations/` con los 4 campos nuevos.

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `docker compose exec -T backend pytest apps/core/tests/test_company_defaults.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/core/
git commit -m "feat(core): precios base de trabajos de campo en CompanyProfile

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Integración con `billing` (tipo FIELD_JOB + factura desde trabajo)

**Files:**
- Modify: `backend/apps/billing/models.py` (`Invoice.InvoiceType`, FK `field_job`, `save()` prefijo)
- Create: `backend/apps/billing/migrations/000X_invoice_field_job.py` (vía makemigrations)
- Modify: `backend/apps/billing/services.py` (`create_invoice_from_field_job`)
- Test: `backend/apps/billing/tests/test_field_job_invoice.py`

**Interfaces:**
- Consumes: `apps.field_jobs.models.FieldJob` (Task 1).
- Produces:
  - `Invoice.InvoiceType.FIELD_JOB = "field_job"`.
  - `Invoice.field_job` (FK a `field_jobs.FieldJob`, `SET_NULL`, null/blank, `related_name="invoices"`).
  - Numeración `FUM-NNNNNN` cuando `invoice_type == FIELD_JOB`.
  - `billing.services.create_invoice_from_field_job(*, job, user=None) -> Invoice` — exige `job.status == DONE`, rechaza doble factura, crea 1 línea (`SERVICE`) y deja `job.status = invoiced`.

- [ ] **Step 1: Escribir los tests (fallan)**

Crear `backend/apps/billing/tests/test_field_job_invoice.py`:

```python
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.exceptions import ValidationError

from apps.billing.models import Invoice
from apps.billing.services import create_invoice_from_field_job
from apps.customers.models import Customer
from apps.field_jobs.models import FieldJob

User = get_user_model()


def _done_job(**kwargs):
    defaults = dict(
        customer=Customer.objects.create(name="Finca La Esperanza"),
        job_type=FieldJob.JobType.FUMIGATION,
        status=FieldJob.Status.DONE,
        hectares=Decimal("12.5"),
        unit_price=Decimal("20"),
        location="Finca La Esperanza",
    )
    defaults.update(kwargs)
    return FieldJob.objects.create(**defaults)


@pytest.mark.django_db
def test_invoice_requires_done_status():
    job = _done_job(status=FieldJob.Status.SCHEDULED)
    with pytest.raises(ValidationError):
        create_invoice_from_field_job(job=job)


@pytest.mark.django_db
def test_invoice_fumigation_line_and_number_and_status():
    job = _done_job()
    invoice = create_invoice_from_field_job(job=job)
    assert invoice.invoice_type == Invoice.InvoiceType.FIELD_JOB
    assert invoice.invoice_number.startswith("FUM-")
    assert invoice.field_job_id == job.id
    line = invoice.lines.get()
    assert line.quantity == Decimal("12.50")
    assert line.unit_price == Decimal("20.00")
    assert "Fumigación" in line.description
    assert "ha" in line.description
    assert line.line_type == "service"
    job.refresh_from_db()
    assert job.status == FieldJob.Status.INVOICED


@pytest.mark.django_db
def test_invoice_spreading_uses_quintals_in_line():
    job = _done_job(
        job_type=FieldJob.JobType.SPREADING,
        hectares=Decimal("0"),
        quintals=Decimal("8"),
        unit_price=Decimal("10"),
        location="Finca Los Naranjos",
    )
    invoice = create_invoice_from_field_job(job=job)
    line = invoice.lines.get()
    assert line.quantity == Decimal("8.00")
    assert "Esparcido" in line.description
    assert "qq" in line.description


@pytest.mark.django_db
def test_invoice_rejects_double_billing():
    job = _done_job()
    create_invoice_from_field_job(job=job)
    job.refresh_from_db()
    job.status = FieldJob.Status.DONE  # forzar para reintentar
    job.save(update_fields=["status"])
    with pytest.raises(ValidationError):
        create_invoice_from_field_job(job=job)
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `docker compose exec -T backend pytest apps/billing/tests/test_field_job_invoice.py -v`
Expected: FAIL (no existe `create_invoice_from_field_job` ni el tipo/FK).

- [ ] **Step 3: Ampliar el modelo `Invoice`**

En `backend/apps/billing/models.py`, en `class InvoiceType`, añadir el choice:

```python
    class InvoiceType(models.TextChoices):
        SERVICE = "service_invoice", "Factura de servicio"
        FINAL = "final_invoice", "Factura final"
        PRODUCT_SALE = "product_sale", "Venta de producto"
        FIELD_JOB = "field_job", "Factura de fumigación"
```

Añadir la FK `field_job` en `Invoice`, justo después del campo `quote`:

```python
    field_job = models.ForeignKey(
        "field_jobs.FieldJob",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="invoices",
    )
```

Cambiar el cálculo del prefijo en `Invoice.save()`:

```python
    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if not self.invoice_number:
            if self.invoice_type == self.InvoiceType.FIELD_JOB:
                prefix = "FUM"
            elif self.invoice_type == self.InvoiceType.SERVICE:
                prefix = "OS"
            else:
                prefix = "FAC"
            self.invoice_number = f"{prefix}-{self.pk:06d}"
            super().save(update_fields=["invoice_number"])
```

- [ ] **Step 4: Generar la migración de billing**

Run: `docker compose exec -T backend python manage.py makemigrations billing`
Expected: crea una migración con el nuevo choice (alter field `invoice_type`) y la FK `field_job`.

- [ ] **Step 5: Implementar `create_invoice_from_field_job`**

En `backend/apps/billing/services.py`, añadir al final del archivo (junto a las demás funciones de creación de factura):

```python
def create_invoice_from_field_job(*, job, user=None):
    from apps.field_jobs.models import FieldJob

    if job.status != FieldJob.Status.DONE:
        raise ValidationError(
            {"status": "Solo se factura un trabajo de campo hecho (done)."}
        )
    if job.invoices.exclude(status=Invoice.Status.CANCELLED).exists():
        raise ValidationError({"detail": "El trabajo ya tiene una factura."})

    if job.job_type == FieldJob.JobType.FUMIGATION:
        quantity = job.hectares
        unit_word = "ha"
        type_word = "Fumigación"
    else:
        quantity = job.quintals
        unit_word = "qq"
        type_word = "Esparcido"
    description = (
        f"{type_word} {quantity:.2f} {unit_word} @ ${job.unit_price:.2f}/{unit_word}"
    )
    if job.location:
        description += f" — {job.location}"

    invoice = Invoice.objects.create(
        invoice_type=Invoice.InvoiceType.FIELD_JOB,
        customer=job.customer,
        field_job=job,
        created_by=user,
    )
    InvoiceLine.objects.create(
        invoice=invoice,
        description=description,
        quantity=quantity,
        unit_price=job.unit_price,
        line_type=LineType.SERVICE,
    )
    recalculate_invoice(invoice)
    job.status = FieldJob.Status.INVOICED
    job.save(update_fields=["status", "updated_at"])
    return invoice
```

- [ ] **Step 6: Correr los tests y verificar que pasan**

Run: `docker compose exec -T backend pytest apps/billing/tests/test_field_job_invoice.py -v`
Expected: PASS (4 tests).

- [ ] **Step 7: Verificar que no se rompió billing**

Run: `docker compose exec -T backend pytest apps/billing -q`
Expected: toda la suite de billing en verde.

- [ ] **Step 8: Commit**

```bash
git add backend/apps/billing/
git commit -m "feat(billing): tipo de factura field_job y create_invoice_from_field_job

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Servicios de transición de `field_jobs` (mark_done, cancel_job)

**Files:**
- Create: `backend/apps/field_jobs/services.py`
- Test: `backend/apps/field_jobs/tests/test_services.py`

**Interfaces:**
- Consumes: `FieldJob` (Task 1).
- Produces:
  - `services.mark_done(job, user=None) -> FieldJob` — `scheduled → done`, setea `done_date = hoy`. Error si no está `scheduled`.
  - `services.cancel_job(job, user=None) -> FieldJob` — `→ cancelled`. Error si está `invoiced`.

- [ ] **Step 1: Escribir los tests (fallan)**

Crear `backend/apps/field_jobs/tests/test_services.py`:

```python
from decimal import Decimal

import pytest
from rest_framework.exceptions import ValidationError

from apps.customers.models import Customer
from apps.field_jobs.models import FieldJob
from apps.field_jobs.services import cancel_job, mark_done


def _job(**kwargs):
    defaults = dict(
        customer=Customer.objects.create(name="C"),
        hectares=Decimal("10"),
        unit_price=Decimal("20"),
    )
    defaults.update(kwargs)
    return FieldJob.objects.create(**defaults)


@pytest.mark.django_db
def test_mark_done_from_scheduled():
    job = _job()
    mark_done(job)
    job.refresh_from_db()
    assert job.status == FieldJob.Status.DONE
    assert job.done_date is not None


@pytest.mark.django_db
def test_mark_done_fails_if_not_scheduled():
    job = _job(status=FieldJob.Status.DONE)
    with pytest.raises(ValidationError):
        mark_done(job)


@pytest.mark.django_db
def test_cancel_from_scheduled_and_done():
    job = _job()
    cancel_job(job)
    job.refresh_from_db()
    assert job.status == FieldJob.Status.CANCELLED

    job2 = _job(status=FieldJob.Status.DONE)
    cancel_job(job2)
    job2.refresh_from_db()
    assert job2.status == FieldJob.Status.CANCELLED


@pytest.mark.django_db
def test_cancel_fails_if_invoiced():
    job = _job(status=FieldJob.Status.INVOICED)
    with pytest.raises(ValidationError):
        cancel_job(job)
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `docker compose exec -T backend pytest apps/field_jobs/tests/test_services.py -v`
Expected: FAIL (no existe `services.py`).

- [ ] **Step 3: Implementar `services.py`**

Crear `backend/apps/field_jobs/services.py`:

```python
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import FieldJob


@transaction.atomic
def mark_done(job, user=None):
    if job.status != FieldJob.Status.SCHEDULED:
        raise ValidationError(
            {"status": "Solo se marca hecho un trabajo programado (scheduled)."}
        )
    job.status = FieldJob.Status.DONE
    job.done_date = timezone.localdate()
    job.save(update_fields=["status", "done_date", "updated_at"])
    return job


@transaction.atomic
def cancel_job(job, user=None):
    if job.status == FieldJob.Status.INVOICED:
        raise ValidationError(
            {"status": "No se puede cancelar un trabajo ya facturado."}
        )
    job.status = FieldJob.Status.CANCELLED
    job.save(update_fields=["status", "updated_at"])
    return job
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `docker compose exec -T backend pytest apps/field_jobs/tests/test_services.py -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/field_jobs/services.py backend/apps/field_jobs/tests/test_services.py
git commit -m "feat(field-jobs): servicios mark_done y cancel_job

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Calculadora de mezclas (función pura)

**Files:**
- Modify: `backend/apps/field_jobs/services.py` (añadir `calculate_spray_mix`)
- Test: `backend/apps/field_jobs/tests/test_spray_mix.py`

**Interfaces:**
- Produces: `services.calculate_spray_mix(*, hectares, water_per_hectare, tank_volume_liters, products) -> dict`.
  - `products`: lista de `{"name": str, "dose_per_liter": number, "dose_unit": str}`.
  - Devuelve `{"total_volume_liters", "fills_needed", "full_fills", "last_fill_liters", "per_full_fill": [{"name","quantity","unit"}], "last_fill": [...]}`.
  - `unit` de cada producto es `dose_unit` sin el sufijo `/L` (p.ej. `"mL/L"` → `"mL"`).
  - Lanza `ValidationError` si `hectares<=0`, `tank_volume_liters<=0`, `water_per_hectare<=0`, `products` vacío, o algún `dose_per_liter<=0`.

- [ ] **Step 1: Escribir los tests (fallan)**

Crear `backend/apps/field_jobs/tests/test_spray_mix.py`:

```python
import pytest
from rest_framework.exceptions import ValidationError

from apps.field_jobs.services import calculate_spray_mix


def _products():
    return [
        {"name": "Glifosato 48%", "dose_per_liter": 8.0, "dose_unit": "mL/L"},
        {"name": "Coadyuvante", "dose_per_liter": 3.0, "dose_unit": "mL/L"},
    ]


def test_spray_mix_example_from_spec():
    result = calculate_spray_mix(
        hectares=12.0,
        water_per_hectare=8.0,
        tank_volume_liters=30.0,
        products=_products(),
    )
    assert result["total_volume_liters"] == 96.0
    assert result["fills_needed"] == 4
    assert result["full_fills"] == 3
    assert result["last_fill_liters"] == 6.0
    assert result["per_full_fill"] == [
        {"name": "Glifosato 48%", "quantity": 240.0, "unit": "mL"},
        {"name": "Coadyuvante", "quantity": 90.0, "unit": "mL"},
    ]
    assert result["last_fill"] == [
        {"name": "Glifosato 48%", "quantity": 48.0, "unit": "mL"},
        {"name": "Coadyuvante", "quantity": 18.0, "unit": "mL"},
    ]


def test_spray_mix_exact_division_has_no_partial_fill():
    result = calculate_spray_mix(
        hectares=10.0,
        water_per_hectare=9.0,  # 90 L total
        tank_volume_liters=30.0,
        products=[{"name": "X", "dose_per_liter": 2.0, "dose_unit": "mL/L"}],
    )
    assert result["total_volume_liters"] == 90.0
    assert result["fills_needed"] == 3
    assert result["full_fills"] == 3
    assert result["last_fill_liters"] == 0.0
    assert result["last_fill"] == []


@pytest.mark.parametrize(
    "kwargs",
    [
        dict(hectares=0, water_per_hectare=8, tank_volume_liters=30),
        dict(hectares=12, water_per_hectare=0, tank_volume_liters=30),
        dict(hectares=12, water_per_hectare=8, tank_volume_liters=0),
    ],
)
def test_spray_mix_rejects_nonpositive_numbers(kwargs):
    with pytest.raises(ValidationError):
        calculate_spray_mix(products=_products(), **kwargs)


def test_spray_mix_rejects_empty_products():
    with pytest.raises(ValidationError):
        calculate_spray_mix(
            hectares=12, water_per_hectare=8, tank_volume_liters=30, products=[]
        )


def test_spray_mix_rejects_nonpositive_dose():
    with pytest.raises(ValidationError):
        calculate_spray_mix(
            hectares=12,
            water_per_hectare=8,
            tank_volume_liters=30,
            products=[{"name": "X", "dose_per_liter": 0, "dose_unit": "mL/L"}],
        )
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `docker compose exec -T backend pytest apps/field_jobs/tests/test_spray_mix.py -v`
Expected: FAIL (`ImportError`: `calculate_spray_mix` no existe).

- [ ] **Step 3: Implementar `calculate_spray_mix`**

Añadir a `backend/apps/field_jobs/services.py` (imports al inicio y la función al final):

```python
import math
```

(añadir esa línea junto a los imports existentes del archivo), y la función:

```python
def _unit_label(dose_unit):
    # "mL/L" -> "mL", "cc/L" -> "cc"
    return dose_unit.split("/")[0] if dose_unit else ""


def calculate_spray_mix(*, hectares, water_per_hectare, tank_volume_liters, products):
    if hectares is None or float(hectares) <= 0:
        raise ValidationError({"hectares": "Debe ser mayor que cero."})
    if water_per_hectare is None or float(water_per_hectare) <= 0:
        raise ValidationError({"water_per_hectare": "Debe ser mayor que cero."})
    if tank_volume_liters is None or float(tank_volume_liters) <= 0:
        raise ValidationError({"tank_volume_liters": "Debe ser mayor que cero."})
    if not products:
        raise ValidationError({"products": "Agregue al menos un producto."})

    hectares = float(hectares)
    water_per_hectare = float(water_per_hectare)
    tank = float(tank_volume_liters)

    total_volume = hectares * water_per_hectare
    fills_needed = math.ceil(total_volume / tank)
    last_fill_liters = round(total_volume - (fills_needed - 1) * tank, 4)
    # Si el total es múltiplo exacto del tanque, no hay llenado parcial.
    if abs(last_fill_liters - tank) < 1e-9:
        full_fills = fills_needed
        last_fill_liters = 0.0
    else:
        full_fills = fills_needed - 1

    per_full_fill, last_fill = [], []
    for product in products:
        dose = product.get("dose_per_liter")
        if dose is None or float(dose) <= 0:
            raise ValidationError(
                {"products": "Cada producto necesita dose_per_liter > 0."}
            )
        dose = float(dose)
        unit = _unit_label(product.get("dose_unit", ""))
        per_full_fill.append(
            {"name": product.get("name", ""), "quantity": round(tank * dose, 4), "unit": unit}
        )
        if last_fill_liters > 0:
            last_fill.append(
                {
                    "name": product.get("name", ""),
                    "quantity": round(last_fill_liters * dose, 4),
                    "unit": unit,
                }
            )

    return {
        "total_volume_liters": round(total_volume, 4),
        "fills_needed": fills_needed,
        "full_fills": full_fills,
        "last_fill_liters": last_fill_liters,
        "per_full_fill": per_full_fill,
        "last_fill": last_fill,
    }
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `docker compose exec -T backend pytest apps/field_jobs/tests/test_spray_mix.py -v`
Expected: PASS (todos los casos, incluidos los parametrizados).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/field_jobs/services.py backend/apps/field_jobs/tests/test_spray_mix.py
git commit -m "feat(field-jobs): calculadora de mezclas (calculate_spray_mix)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Serializer, ViewSet, rutas y API

**Files:**
- Create: `backend/apps/field_jobs/serializers.py`
- Create: `backend/apps/field_jobs/views.py`
- Create: `backend/apps/field_jobs/urls.py`
- Modify: `backend/config/urls.py` (incluir `apps.field_jobs.urls`)
- Test: `backend/apps/field_jobs/tests/test_api.py`

**Interfaces:**
- Consumes: `FieldJob` (Task 1), `mark_done`/`cancel_job`/`calculate_spray_mix` (Tasks 4,5), `create_invoice_from_field_job` (Task 3), `roles.SERVICE_WRITE`, `RoleWriteOrReadOnly`.
- Produces: endpoints REST bajo `/api/field-jobs/`:
  - CRUD: `GET/POST /api/field-jobs/`, `GET/PUT/PATCH/DELETE /api/field-jobs/{id}/`
  - Acciones detail: `POST .../{id}/mark-done/`, `POST .../{id}/generate-invoice/`, `POST .../{id}/cancel/`
  - Acción list: `POST /api/field-jobs/calculate-mix/`
  - Filtros: `?customer= &equipment= &technician= &status= &job_type= &from=YYYY-MM-DD&to=YYYY-MM-DD`; búsqueda `?search=`.

- [ ] **Step 1: Escribir el serializer**

Crear `backend/apps/field_jobs/serializers.py`:

```python
from rest_framework import serializers

from .models import FieldJob


class FieldJobSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    equipment_name = serializers.CharField(source="equipment.name", read_only=True, default="")
    technician_name = serializers.CharField(
        source="technician.full_name", read_only=True, default=""
    )
    job_type_display = serializers.CharField(source="get_job_type_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    application_rate_unit_display = serializers.CharField(
        source="get_application_rate_unit_display", read_only=True, default=""
    )

    class Meta:
        model = FieldJob
        fields = (
            "id",
            "number",
            "job_type",
            "job_type_display",
            "status",
            "status_display",
            "customer",
            "customer_name",
            "equipment",
            "equipment_name",
            "technician",
            "technician_name",
            "scheduled_date",
            "done_date",
            "location",
            "crop",
            "applied_product",
            "hectares",
            "quintals",
            "unit_price",
            "total",
            "notes",
            "application_rate",
            "application_rate_unit",
            "application_rate_unit_display",
            "tank_volume_liters",
            "water_per_hectare",
            "latitude",
            "longitude",
            "wind_speed_kmh",
            "temperature_celsius",
            "humidity_percentage",
            "weather_notes",
            "created_by",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "number",
            "status",
            "done_date",
            "total",
            "created_by",
            "created_at",
            "updated_at",
        )
```

- [ ] **Step 2: Escribir el ViewSet**

Crear `backend/apps/field_jobs/views.py`:

```python
from rest_framework import filters, status as http_status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.core import roles
from apps.core.permissions import RoleWriteOrReadOnly

from .models import FieldJob
from .serializers import FieldJobSerializer
from .services import calculate_spray_mix, cancel_job, mark_done

FieldJobWrite = RoleWriteOrReadOnly(*roles.SERVICE_WRITE)


def _int_param(params, key):
    value = params.get(key)
    if not value:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        raise ValidationError({key: "Debe ser un id numérico."})


def _date_param(params, key):
    value = params.get(key)
    if not value:
        return None
    from datetime import date

    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        raise ValidationError({key: "Fecha inválida (use YYYY-MM-DD)."})


class FieldJobViewSet(viewsets.ModelViewSet):
    serializer_class = FieldJobSerializer
    permission_classes = [FieldJobWrite]
    filter_backends = [filters.SearchFilter]
    search_fields = ["number", "location", "crop", "customer__name", "applied_product"]

    def get_queryset(self):
        qs = FieldJob.objects.select_related("customer", "equipment", "technician")
        params = self.request.query_params
        for key, field in (
            ("customer", "customer_id"),
            ("equipment", "equipment_id"),
            ("technician", "technician_id"),
        ):
            value = _int_param(params, key)
            if value is not None:
                qs = qs.filter(**{field: value})
        for key in ("status", "job_type"):
            value = params.get(key)
            if value:
                qs = qs.filter(**{key: value})
        date_from = _date_param(params, "from")
        if date_from is not None:
            qs = qs.filter(scheduled_date__gte=date_from)
        date_to = _date_param(params, "to")
        if date_to is not None:
            qs = qs.filter(scheduled_date__lte=date_to)
        return qs

    def perform_create(self, serializer):
        job = serializer.save(created_by=self.request.user)
        job.recalculate_total()
        job.save(update_fields=["total", "updated_at"])

    def perform_update(self, serializer):
        job = serializer.save()
        job.recalculate_total()
        job.save(update_fields=["total", "updated_at"])

    @action(detail=True, methods=["post"], url_path="mark-done")
    def mark_done_action(self, request, pk=None):
        job = self.get_object()
        mark_done(job, user=request.user)
        job.refresh_from_db()
        return Response(self.get_serializer(job).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        job = self.get_object()
        cancel_job(job, user=request.user)
        job.refresh_from_db()
        return Response(self.get_serializer(job).data)

    @action(detail=True, methods=["post"], url_path="generate-invoice")
    def generate_invoice(self, request, pk=None):
        from apps.billing.serializers import InvoiceSerializer
        from apps.billing.services import create_invoice_from_field_job

        job = self.get_object()
        invoice = create_invoice_from_field_job(job=job, user=request.user)
        return Response(
            InvoiceSerializer(invoice).data, status=http_status.HTTP_201_CREATED
        )

    @action(detail=False, methods=["post"], url_path="calculate-mix")
    def calculate_mix(self, request):
        data = request.data
        result = calculate_spray_mix(
            hectares=data.get("hectares"),
            water_per_hectare=data.get("water_per_hectare"),
            tank_volume_liters=data.get("tank_volume_liters"),
            products=data.get("products") or [],
        )
        return Response(result)
```

Nota: `InvoiceSerializer` ya existe en `apps/billing/serializers.py` (lo usa `ServiceOrderViewSet.generate_invoice`). No crear uno nuevo.

- [ ] **Step 3: Escribir las rutas**

Crear `backend/apps/field_jobs/urls.py`:

```python
from rest_framework.routers import SimpleRouter

from .views import FieldJobViewSet

router = SimpleRouter()
router.register(r"field-jobs", FieldJobViewSet, basename="field-job")

urlpatterns = router.urls
```

En `backend/config/urls.py`, añadir en `urlpatterns` junto a los demás `include` de apps (después de `path("api/", include("apps.billing.urls"))`):

```python
    path("api/", include("apps.field_jobs.urls")),
```

- [ ] **Step 4: Escribir los tests de API (fallan)**

Crear `backend/apps/field_jobs/tests/test_api.py`:

```python
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.customers.models import Customer
from apps.field_jobs.models import FieldJob

User = get_user_model()
URL = "/api/field-jobs/"


def _client(role="technician"):
    user = User.objects.create_user(
        email=f"{role}@v.com", password="x", full_name=role, role=role
    )
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture
def customer(db):
    return Customer.objects.create(name="Finca La Esperanza")


@pytest.mark.django_db
def test_create_fumigation_job_computes_total(customer):
    c = _client("technician")
    resp = c.post(
        URL,
        {"customer": customer.id, "job_type": "fumigation",
         "hectares": "12.5", "unit_price": "20", "location": "Lote 3"},
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["number"].startswith("TC-")
    assert Decimal(resp.data["total"]) == Decimal("250.00")


@pytest.mark.django_db
def test_filters_by_type_status_and_date(customer):
    from datetime import date

    c = _client("technician")
    FieldJob.objects.create(customer=customer, job_type="fumigation", scheduled_date=date(2026, 6, 1))
    FieldJob.objects.create(customer=customer, job_type="spreading", scheduled_date=date(2026, 1, 1))
    assert len(c.get(f"{URL}?job_type=fumigation").data["results"]) == 1
    assert len(c.get(f"{URL}?status=scheduled").data["results"]) == 2
    assert len(c.get(f"{URL}?from=2026-05-01&to=2026-07-01").data["results"]) == 1
    assert c.get(f"{URL}?from=nope").status_code == 400


@pytest.mark.django_db
def test_search_by_location_and_customer(customer):
    c = _client("technician")
    FieldJob.objects.create(customer=customer, location="Finca Los Naranjos")
    assert len(c.get(f"{URL}?search=Naranjos").data["results"]) == 1
    assert len(c.get(f"{URL}?search=Esperanza").data["results"]) == 1  # customer__name


@pytest.mark.django_db
def test_mark_done_then_generate_invoice(customer):
    c = _client("technician")
    job = FieldJob.objects.create(
        customer=customer, job_type="fumigation",
        hectares=Decimal("10"), unit_price=Decimal("20"),
    )
    job.total = Decimal("200")
    job.save(update_fields=["total"])
    done = c.post(f"{URL}{job.id}/mark-done/")
    assert done.status_code == 200
    assert done.data["status"] == "done"
    inv = c.post(f"{URL}{job.id}/generate-invoice/")
    assert inv.status_code == 201, inv.data
    assert inv.data["invoice_number"].startswith("FUM-")
    job.refresh_from_db()
    assert job.status == "invoiced"


@pytest.mark.django_db
def test_cancel_action(customer):
    c = _client("technician")
    job = FieldJob.objects.create(customer=customer)
    resp = c.post(f"{URL}{job.id}/cancel/")
    assert resp.status_code == 200
    assert resp.data["status"] == "cancelled"


@pytest.mark.django_db
def test_calculate_mix_endpoint(customer):
    c = _client("technician")
    resp = c.post(
        f"{URL}calculate-mix/",
        {"hectares": 12.0, "water_per_hectare": 8.0, "tank_volume_liters": 30.0,
         "products": [{"name": "Glifosato", "dose_per_liter": 8.0, "dose_unit": "mL/L"}]},
        format="json",
    )
    assert resp.status_code == 200, resp.data
    assert resp.data["fills_needed"] == 4
    assert resp.data["per_full_fill"][0]["quantity"] == 240.0


@pytest.mark.django_db
def test_calculate_mix_validation_error(customer):
    c = _client("technician")
    resp = c.post(
        f"{URL}calculate-mix/",
        {"hectares": 0, "water_per_hectare": 8.0, "tank_volume_liters": 30.0,
         "products": [{"name": "X", "dose_per_liter": 8.0, "dose_unit": "mL/L"}]},
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_permissions_viewer_readonly_anon_denied(customer):
    FieldJob.objects.create(customer=customer)
    # readonly puede leer
    viewer = _client("readonly")
    assert viewer.get(URL).status_code == 200
    # readonly no puede escribir
    assert viewer.post(URL, {"customer": customer.id}, format="json").status_code == 403
    # anónimo no puede leer
    assert APIClient().get(URL).status_code == 401
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `docker compose exec -T backend pytest apps/field_jobs/tests/test_api.py -v`
Expected: PASS (8 tests). Si el servidor en vivo se consulta (no en estos tests), `docker compose restart backend`.

- [ ] **Step 6: Correr toda la suite del app y verificar regresiones**

Run: `docker compose exec -T backend pytest apps/field_jobs apps/billing apps/core -q`
Expected: todo en verde.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/field_jobs/serializers.py backend/apps/field_jobs/views.py backend/apps/field_jobs/urls.py backend/config/urls.py backend/apps/field_jobs/tests/test_api.py
git commit -m "feat(field-jobs): API REST (CRUD, filtros, acciones, calculadora de mezclas)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Notas de ejecución

- **Orden estricto:** 1 → 2 → 3 → 4 → 5 → 6. Task 3 y 4 dependen del modelo (Task 1). Task 6 integra todo.
- **Migraciones:** se generan con `makemigrations` dentro del contenedor; revisar que cada una toque sólo lo esperado antes de commitear.
- **Fuera de alcance de este plan (planes/posteriores):** frontend web, app móvil, exportación MIDA Panamá, persistir la mezcla calculada, descuento de inventario, múltiples operadores, vista de mapa, calendario, push.
