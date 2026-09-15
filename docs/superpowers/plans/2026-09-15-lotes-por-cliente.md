# Lotes por cliente (Fase 1) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada cliente tenga sus lotes con hectáreas, cultivo, ubicación y receta habitual, y que crear un Trabajo de campo desde un lote autollene todos esos datos.

**Architecture:** Dos modelos nuevos (`FieldPlot`, `FieldPlotProduct`) dentro de la app existente `apps.field_jobs`, reutilizando los enums `FieldJob.Crop` y `FieldJobProduct.Unit` para que no haya dos catálogos. `FieldJob` gana un FK opcional `plot` que es solo un enlace informativo: el autollenado ocurre en el formulario web, y el trabajo guarda siempre sus propios valores copiados. En el frontend, el editor de filas de químicos se extrae de `FieldJobFormModal` a un componente controlado que comparten el form del trabajo y el del lote.

**Tech Stack:** Django 5.1 + DRF 3.15 + drf-spectacular, PostgreSQL 16, pytest + pytest-django. Frontend React 19 + Mantine 9 + TanStack Query 5 + openapi-fetch, Vitest + Testing Library. Todo corre en Docker Compose.

**Spec:** `docs/superpowers/specs/2026-09-15-lotes-por-cliente-design.md`

## Global Constraints

- Rama de trabajo: **V3.0**. No se toca `master` ni `V2.0`.
- Todo el backend vive en `apps.field_jobs`. **No se crea una app nueva.**
- **Una sola migración nueva:** `backend/apps/field_jobs/migrations/0004_*.py`, aditiva (dos tablas nuevas + columna `plot` nullable). No migra datos.
- Los enums no se duplican: el cultivo del lote usa `FieldJob.Crop.choices` y la unidad de sus químicos usa `FieldJobProduct.Unit.choices`. Cambiar los enums existentes generaría una migración sobre `FieldJob`/`FieldJobProduct`: **no se cambian**.
- Tope de **10 químicos** por lote y por trabajo, validado en el serializer.
- Mensajes de error de API y textos de UI **en español** (convención del repo).
- Eliminar un lote es **desactivarlo** (`is_active = False`), igual que en Clientes. `is_active` es de solo lectura en el serializer, como en `CustomerSerializer`.
- Permisos de lotes: `RoleWriteOrReadOnly(*roles.FIELD_JOBS_WRITE)` (super_admin, general_admin, technician, sales, piloto escriben; cualquier autenticado lee). En el frontend el guard equivalente es `canWriteFieldJobs(user?.role)`.
- El **piloto ve los lotes de todos los clientes**. No se replica el filtro `technician_id=user.id` que `FieldJobViewSet` aplica a los trabajos.
- `/api/field-plots/` **no pagina** (`pagination_class = None`): el `GET` devuelve un array plano, no `{count, results}`. Los hooks del frontend deben tiparlo así.
- **Windows:** el bind-mount no dispara autoreload. Tras editar Python: `docker compose restart backend`. Tras editar el frontend en el contenedor: `docker compose restart frontend` + recarga dura. Ver memoria `backend-autoreload-windows`.
- No se toca la app móvil (fue eliminada del repo), ni el módulo de equipos, ni facturación.
- **Fuera de alcance de este plan:** mapa/geometría del lote, página propia de "Lotes" en el menú, receta en PDF/WhatsApp (Fase 2) y Delta T (Fase 3).

**Comandos de verificación:**
- Backend (una app): `docker compose exec -T backend python -m pytest apps/field_jobs -q`
- Backend (todo): `docker compose exec -T backend python -m pytest -q`
- Migraciones: `docker compose exec -T backend python manage.py makemigrations field_jobs` y `... migrate`
- Frontend: `cd frontend && npx vitest run`
- Tipos: `cd frontend && npx tsc -b --noEmit`
- Tipos del API: con el backend arriba, `cd frontend && npm run gen:api`

---

### Task 1: Modelos `FieldPlot` y `FieldPlotProduct` + enlace desde `FieldJob`

**Files:**
- Modify: `backend/apps/field_jobs/models.py` (agregar `plot` a `FieldJob` ~línea 60, y las dos clases nuevas al final)
- Modify: `backend/apps/field_jobs/admin.py`
- Create: `backend/apps/field_jobs/migrations/0004_fieldplot_fieldplotproduct_fieldjob_plot.py` (generada por `makemigrations`)
- Test: `backend/apps/field_jobs/tests/test_plots_model.py`

**Interfaces:**
- Consumes: nada (primera tarea).
- Produces:
  - `apps.field_jobs.models.FieldPlot` con campos `customer, name, hectares, crop, crop_other, location, water_per_hectare, notes, is_active` + `TimeStampedModel`.
  - `apps.field_jobs.models.FieldPlotProduct` con `plot, name, dose_per_hectare, unit`.
  - `FieldJob.plot` → FK nullable a `FieldPlot`, `related_name="field_jobs"`.
  - Constraint de BD `uniq_active_plot_name_per_customer`.

- [ ] **Step 1: Escribir el test del modelo**

Crear `backend/apps/field_jobs/tests/test_plots_model.py`:

```python
"""Reglas de integridad del lote: unicidad del nombre entre lotes activos."""
import pytest
from django.db import IntegrityError

from apps.customers.models import Customer
from apps.field_jobs.models import FieldPlot

pytestmark = pytest.mark.django_db


@pytest.fixture
def customer():
    return Customer.objects.create(name="Finca La Esperanza")


def test_no_repite_nombre_entre_lotes_activos_del_mismo_cliente(customer):
    FieldPlot.objects.create(customer=customer, name="Potrero 1")
    with pytest.raises(IntegrityError):
        FieldPlot.objects.create(customer=customer, name="Potrero 1")


def test_permite_repetir_el_nombre_si_el_otro_esta_desactivado(customer):
    FieldPlot.objects.create(customer=customer, name="Potrero 1", is_active=False)
    plot = FieldPlot.objects.create(customer=customer, name="Potrero 1")
    assert plot.is_active is True


def test_mismo_nombre_en_clientes_distintos_es_valido(customer):
    otro = Customer.objects.create(name="Finca Santa Rita")
    FieldPlot.objects.create(customer=customer, name="Potrero 1")
    assert FieldPlot.objects.create(customer=otro, name="Potrero 1").pk


def test_str_es_el_nombre(customer):
    plot = FieldPlot.objects.create(customer=customer, name="Potrero 1")
    assert str(plot) == "Potrero 1"


def test_defaults_del_lote(customer):
    plot = FieldPlot.objects.create(customer=customer, name="Potrero 1")
    assert plot.crop == "rice"
    assert plot.hectares == 1
    assert plot.water_per_hectare is None
    assert plot.is_active is True
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `docker compose exec -T backend python -m pytest apps/field_jobs/tests/test_plots_model.py -q`
Expected: FAIL con `ImportError: cannot import name 'FieldPlot' from 'apps.field_jobs.models'`

- [ ] **Step 3: Agregar el FK `plot` a `FieldJob`**

En `backend/apps/field_jobs/models.py`, dentro de `FieldJob`, justo después del campo `customer` (que termina con `related_name="field_jobs"`), agregar:

```python
    plot = models.ForeignKey(
        "FieldPlot",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="field_jobs",
    )
```

Se referencia por string porque `FieldPlot` se define más abajo en el mismo archivo (necesita `FieldJob.Crop`).

- [ ] **Step 4: Agregar los dos modelos nuevos**

Al final de `backend/apps/field_jobs/models.py`, después de `FieldJobProduct`:

```python
class FieldPlot(TimeStampedModel):
    """Lote (potrero/talhão) de un cliente: los datos estables de un terreno.

    Guarda además la receta habitual (tasa de aplicación y químicos) para
    autollenar el Trabajo de campo. El trabajo copia los valores al crearse:
    editar el lote después no reescribe trabajos ya capturados.
    """

    customer = models.ForeignKey(
        "customers.Customer", on_delete=models.PROTECT, related_name="plots"
    )
    name = models.CharField(max_length=150)
    hectares = models.DecimalField(max_digits=10, decimal_places=4, default=1)
    crop = models.CharField(
        max_length=20, choices=FieldJob.Crop.choices, default=FieldJob.Crop.RICE
    )
    crop_other = models.CharField(max_length=100, blank=True)
    location = models.CharField(max_length=255, blank=True)
    # Mismo nombre que en FieldJob para que la copia sea campo a campo.
    water_per_hectare = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("customer", "name")
        constraints = [
            models.UniqueConstraint(
                fields=["customer", "name"],
                condition=models.Q(is_active=True),
                name="uniq_active_plot_name_per_customer",
            )
        ]

    def __str__(self):
        return self.name


class FieldPlotProduct(TimeStampedModel):
    plot = models.ForeignKey(
        FieldPlot, on_delete=models.CASCADE, related_name="products"
    )
    name = models.CharField(max_length=150)
    dose_per_hectare = models.DecimalField(max_digits=10, decimal_places=4, default=0)
    unit = models.CharField(
        max_length=10,
        choices=FieldJobProduct.Unit.choices,
        default=FieldJobProduct.Unit.L_HA,
    )

    class Meta:
        ordering = ("id",)

    def __str__(self):
        return f"{self.name} ({self.dose_per_hectare} {self.unit})"
```

- [ ] **Step 5: Generar y aplicar la migración**

```bash
docker compose exec -T backend python manage.py makemigrations field_jobs
docker compose exec -T backend python manage.py migrate
```

Expected: crea `0004_fieldplot_fieldplotproduct_fieldjob_plot.py` con `CreateModel` ×2, `AddField` (`fieldjob.plot`) y `AddConstraint`. Si el archivo sale con otro nombre, está bien; lo que no debe aparecer es ninguna operación sobre `FieldJobProduct.unit` ni `FieldJob.crop` (sería señal de que se tocaron los enums).

- [ ] **Step 6: Registrar en el admin**

En `backend/apps/field_jobs/admin.py`, cambiar el import y agregar al final:

```python
from .models import FieldJob, FieldPlot, FieldPlotProduct


class FieldPlotProductInline(admin.TabularInline):
    model = FieldPlotProduct
    extra = 0


@admin.register(FieldPlot)
class FieldPlotAdmin(admin.ModelAdmin):
    list_display = ("name", "customer", "hectares", "crop", "water_per_hectare", "is_active")
    list_filter = ("is_active", "crop")
    search_fields = ("name", "location", "customer__name")
    readonly_fields = ("created_at", "updated_at")
    inlines = [FieldPlotProductInline]
```

- [ ] **Step 7: Correr los tests y verificar que pasan**

Run: `docker compose exec -T backend python -m pytest apps/field_jobs -q`
Expected: PASS — los 5 tests nuevos y toda la suite previa de `field_jobs` en verde.

- [ ] **Step 8: Commit**

```bash
git add backend/apps/field_jobs/models.py backend/apps/field_jobs/admin.py backend/apps/field_jobs/migrations/ backend/apps/field_jobs/tests/test_plots_model.py
git commit -m "feat(field-jobs): modelo de lote por cliente con su receta habitual"
```

---

### Task 2: API `/api/field-plots/`

**Files:**
- Modify: `backend/apps/field_jobs/serializers.py`
- Modify: `backend/apps/field_jobs/views.py`
- Modify: `backend/apps/field_jobs/urls.py`
- Test: `backend/apps/field_jobs/tests/test_plots_api.py`
- Test: `backend/apps/field_jobs/tests/test_plots_permissions.py`

**Interfaces:**
- Consumes: `FieldPlot`, `FieldPlotProduct` (Task 1).
- Produces:
  - `apps.field_jobs.serializers.FieldPlotSerializer` — campos `id, customer, customer_name, name, hectares, crop, crop_display, crop_other, location, water_per_hectare, notes, products, is_active, created_at, updated_at`.
  - `apps.field_jobs.serializers.FieldPlotProductSerializer` — `id, name, dose_per_hectare, unit`.
  - `apps.field_jobs.views.FieldPlotViewSet`, basename `field-plot`, rutas `/api/field-plots/` y `/api/field-plots/{id}/`, **sin paginación**.

- [ ] **Step 1: Escribir los tests de la API**

Crear `backend/apps/field_jobs/tests/test_plots_api.py`:

```python
"""CRUD, filtros y soft-delete de /api/field-plots/."""
import pytest
from rest_framework.test import APIClient

from apps.customers.models import Customer
from apps.field_jobs.models import FieldPlot, FieldPlotProduct
from apps.users.models import User

pytestmark = pytest.mark.django_db

PLOTS_URL = "/api/field-plots/"


@pytest.fixture
def admin_client():
    user = User.objects.create_user(
        email="admin@test.com", password="x", role="general_admin", full_name="Ad Min"
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def customer():
    return Customer.objects.create(name="Finca La Esperanza")


def test_crea_lote_con_quimicos_anidados(admin_client, customer):
    payload = {
        "customer": customer.id,
        "name": "Potrero 1",
        "hectares": "15",
        "crop": "other",
        "crop_other": "Sandía",
        "location": "Entrada norte",
        "water_per_hectare": "20",
        "products": [
            {"name": "Glifosato", "dose_per_hectare": "10", "unit": "L/ha"},
            {"name": "Adherente", "dose_per_hectare": "50", "unit": "cc/ha"},
        ],
    }
    res = admin_client.post(PLOTS_URL, payload, format="json")
    assert res.status_code == 201, res.content
    body = res.json()
    assert body["customer_name"] == "Finca La Esperanza"
    assert body["crop_display"] == "Otros"
    assert body["is_active"] is True
    assert len(body["products"]) == 2


def test_rechaza_mas_de_diez_quimicos(admin_client, customer):
    products = [
        {"name": f"Q{i}", "dose_per_hectare": "1", "unit": "L/ha"} for i in range(11)
    ]
    res = admin_client.post(
        PLOTS_URL,
        {"customer": customer.id, "name": "Potrero 1", "products": products},
        format="json",
    )
    assert res.status_code == 400
    assert "products" in res.json()


def test_rechaza_nombre_repetido_del_mismo_cliente(admin_client, customer):
    FieldPlot.objects.create(customer=customer, name="Potrero 1")
    res = admin_client.post(
        PLOTS_URL, {"customer": customer.id, "name": "potrero 1"}, format="json"
    )
    assert res.status_code == 400
    assert "name" in res.json()


def test_editar_reemplaza_los_quimicos(admin_client, customer):
    plot = FieldPlot.objects.create(customer=customer, name="Potrero 1")
    FieldPlotProduct.objects.create(plot=plot, name="Viejo", dose_per_hectare=1)
    res = admin_client.patch(
        f"{PLOTS_URL}{plot.id}/",
        {"products": [{"name": "Nuevo", "dose_per_hectare": "2", "unit": "L/ha"}]},
        format="json",
    )
    assert res.status_code == 200, res.content
    assert [p["name"] for p in res.json()["products"]] == ["Nuevo"]
    assert plot.products.count() == 1


def test_delete_desactiva_y_lo_saca_del_listado(admin_client, customer):
    plot = FieldPlot.objects.create(customer=customer, name="Potrero 1")
    assert admin_client.delete(f"{PLOTS_URL}{plot.id}/").status_code == 204
    plot.refresh_from_db()
    assert plot.is_active is False
    assert admin_client.get(PLOTS_URL).json() == []
    con_inactivos = admin_client.get(f"{PLOTS_URL}?include_inactive=true").json()
    assert [p["id"] for p in con_inactivos] == [plot.id]


def test_listado_sin_paginacion_y_filtro_por_cliente(admin_client, customer):
    otro = Customer.objects.create(name="Finca Santa Rita")
    FieldPlot.objects.create(customer=customer, name="Potrero 1")
    FieldPlot.objects.create(customer=otro, name="Potrero 2")
    todos = admin_client.get(PLOTS_URL).json()
    assert isinstance(todos, list) and len(todos) == 2
    solo_uno = admin_client.get(f"{PLOTS_URL}?customer={customer.id}").json()
    assert [p["name"] for p in solo_uno] == ["Potrero 1"]


def test_customer_no_numerico_da_400(admin_client):
    res = admin_client.get(f"{PLOTS_URL}?customer=abc")
    assert res.status_code == 400
    assert "customer" in res.json()


def test_busqueda_por_nombre_y_ubicacion(admin_client, customer):
    FieldPlot.objects.create(customer=customer, name="Potrero Alto", location="Norte")
    FieldPlot.objects.create(customer=customer, name="Bajo", location="Sur")
    assert len(admin_client.get(f"{PLOTS_URL}?search=alto").json()) == 1
    assert len(admin_client.get(f"{PLOTS_URL}?search=sur").json()) == 1
```

Crear `backend/apps/field_jobs/tests/test_plots_permissions.py`:

```python
"""Permisos de /api/field-plots/: RoleWriteOrReadOnly(*roles.FIELD_JOBS_WRITE)."""
import pytest
from rest_framework.test import APIClient

from apps.customers.models import Customer
from apps.field_jobs.models import FieldPlot
from apps.users.models import User

pytestmark = pytest.mark.django_db

PLOTS_URL = "/api/field-plots/"


@pytest.fixture
def customer():
    return Customer.objects.create(name="Finca La Esperanza")


def _client_for_role(role):
    user = User.objects.create_user(
        email=f"{role}@test.com", password="x", role=role, full_name="Test User"
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def test_anonimo_recibe_401():
    assert APIClient().get(PLOTS_URL).status_code == 401


def test_readonly_lee_pero_no_escribe(customer):
    client = _client_for_role("readonly")
    assert client.get(PLOTS_URL).status_code == 200
    res = client.post(PLOTS_URL, {"customer": customer.id, "name": "X"}, format="json")
    assert res.status_code == 403


def test_piloto_crea_lotes(customer):
    client = _client_for_role("piloto")
    res = client.post(
        PLOTS_URL, {"customer": customer.id, "name": "Potrero 1"}, format="json"
    )
    assert res.status_code == 201, res.content


def test_piloto_ve_lotes_de_cualquier_cliente(customer):
    """A diferencia de los trabajos, los lotes no se filtran por piloto asignado."""
    otro = Customer.objects.create(name="Finca Santa Rita")
    FieldPlot.objects.create(customer=customer, name="Potrero 1")
    FieldPlot.objects.create(customer=otro, name="Potrero 2")
    body = _client_for_role("piloto").get(PLOTS_URL).json()
    assert len(body) == 2
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `docker compose exec -T backend python -m pytest apps/field_jobs/tests/test_plots_api.py apps/field_jobs/tests/test_plots_permissions.py -q`
Expected: FAIL con 404 en todas las llamadas (la ruta `/api/field-plots/` todavía no existe).

- [ ] **Step 3: Escribir los serializers**

En `backend/apps/field_jobs/serializers.py`, cambiar el import de modelos y agregar al final del archivo:

```python
from .models import FieldJob, FieldJobProduct, FieldPlot, FieldPlotProduct
```

```python
class FieldPlotProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = FieldPlotProduct
        fields = ("id", "name", "dose_per_hectare", "unit")


class FieldPlotSerializer(serializers.ModelSerializer):
    products = FieldPlotProductSerializer(many=True, required=False)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    crop_display = serializers.CharField(source="get_crop_display", read_only=True)

    class Meta:
        model = FieldPlot
        fields = (
            "id",
            "customer",
            "customer_name",
            "name",
            "hectares",
            "crop",
            "crop_display",
            "crop_other",
            "location",
            "water_per_hectare",
            "notes",
            "products",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "is_active", "created_at", "updated_at")

    def validate_products(self, value):
        if len(value) > 10:
            raise serializers.ValidationError("Máximo 10 químicos por lote.")
        return value

    def validate(self, attrs):
        # En PATCH parcial attrs solo trae lo enviado; se completa con la instancia
        # para poder chequear el par (cliente, nombre) contra los lotes activos.
        customer = attrs.get(
            "customer", getattr(self.instance, "customer", None) if self.instance else None
        )
        name = attrs.get(
            "name", getattr(self.instance, "name", "") if self.instance else ""
        )
        qs = FieldPlot.objects.filter(
            customer=customer, name__iexact=name, is_active=True
        )
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                {"name": "Ya existe un lote activo con ese nombre para este cliente."}
            )
        return attrs

    def create(self, validated_data):
        products = validated_data.pop("products", [])
        plot = super().create(validated_data)
        for product in products:
            FieldPlotProduct.objects.create(plot=plot, **product)
        return plot

    def update(self, instance, validated_data):
        products = validated_data.pop("products", None)
        plot = super().update(instance, validated_data)
        if products is not None:
            plot.products.all().delete()
            for product in products:
                FieldPlotProduct.objects.create(plot=plot, **product)
        return plot
```

- [ ] **Step 4: Escribir el ViewSet**

En `backend/apps/field_jobs/views.py`, ampliar los imports y agregar la clase al final:

```python
from .models import FieldJob, FieldPlot
from .serializers import FieldJobSerializer, FieldPlotSerializer
```

```python
class FieldPlotViewSet(viewsets.ModelViewSet):
    """Lotes de un cliente. Sin paginación: alimenta el selector del trabajo."""

    serializer_class = FieldPlotSerializer
    permission_classes = [FieldJobWrite]
    pagination_class = None
    filter_backends = [filters.SearchFilter]
    search_fields = ["name", "location"]

    def get_queryset(self):
        qs = FieldPlot.objects.select_related("customer").prefetch_related("products")
        include_inactive = self.request.query_params.get("include_inactive", "")
        if include_inactive.lower() not in ("1", "true", "yes", "on"):
            qs = qs.filter(is_active=True)
        customer = _int_param(self.request.query_params, "customer")
        if customer is not None:
            qs = qs.filter(customer_id=customer)
        return qs

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active", "updated_at"])
```

- [ ] **Step 5: Registrar la ruta**

Reemplazar `backend/apps/field_jobs/urls.py` por:

```python
from rest_framework.routers import SimpleRouter

from .views import FieldJobViewSet, FieldPlotViewSet

router = SimpleRouter()
router.register(r"field-jobs", FieldJobViewSet, basename="field-job")
router.register(r"field-plots", FieldPlotViewSet, basename="field-plot")

urlpatterns = router.urls
```

- [ ] **Step 6: Reiniciar el backend y correr los tests**

```bash
docker compose restart backend
docker compose exec -T backend python -m pytest apps/field_jobs -q
```

Expected: PASS — los 12 tests nuevos de esta tarea más toda la suite previa de `field_jobs`.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/field_jobs/serializers.py backend/apps/field_jobs/views.py backend/apps/field_jobs/urls.py backend/apps/field_jobs/tests/test_plots_api.py backend/apps/field_jobs/tests/test_plots_permissions.py
git commit -m "feat(field-jobs): API de lotes con receta anidada, filtros y baja lógica"
```

---

### Task 3: Enlace `plot` en el Trabajo de campo

**Files:**
- Modify: `backend/apps/field_jobs/serializers.py` (`FieldJobSerializer`)
- Test: `backend/apps/field_jobs/tests/test_api.py` (agregar al final)

**Interfaces:**
- Consumes: `FieldPlot` (Task 1), `FieldPlotSerializer` (Task 2).
- Produces: `FieldJobSerializer` expone `plot` (escribible, opcional, `allow_null`) y `plot_name` (solo lectura). Error de pertenencia: `{"plot": "El lote no pertenece al cliente del trabajo."}` con status 400.

- [ ] **Step 1: Escribir los tests**

Agregar al final de `backend/apps/field_jobs/tests/test_api.py`:

```python
def test_enlaza_lote_del_mismo_cliente(admin_client, customer):
    from apps.field_jobs.models import FieldPlot

    plot = FieldPlot.objects.create(customer=customer, name="Potrero 1")
    res = admin_client.post(
        "/api/field-jobs/",
        {"customer": customer.id, "plot": plot.id, "hectares": "10"},
        format="json",
    )
    assert res.status_code == 201, res.content
    assert res.json()["plot"] == plot.id
    assert res.json()["plot_name"] == "Potrero 1"


def test_rechaza_lote_de_otro_cliente(admin_client, customer):
    from apps.field_jobs.models import FieldPlot

    otro = Customer.objects.create(name="Finca Santa Rita")
    plot = FieldPlot.objects.create(customer=otro, name="Potrero ajeno")
    res = admin_client.post(
        "/api/field-jobs/",
        {"customer": customer.id, "plot": plot.id},
        format="json",
    )
    assert res.status_code == 400
    assert "plot" in res.json()


def test_patch_parcial_valida_el_lote_contra_el_cliente_guardado(admin_client, customer):
    """El PATCH no manda customer: se resuelve desde la instancia."""
    from apps.field_jobs.models import FieldPlot

    job = FieldJob.objects.create(customer=customer, hectares=Decimal("1"))
    otro = Customer.objects.create(name="Finca Santa Rita")
    ajeno = FieldPlot.objects.create(customer=otro, name="Potrero ajeno")
    propio = FieldPlot.objects.create(customer=customer, name="Potrero 1")

    assert admin_client.patch(
        f"/api/field-jobs/{job.id}/", {"plot": ajeno.id}, format="json"
    ).status_code == 400
    assert admin_client.patch(
        f"/api/field-jobs/{job.id}/", {"plot": propio.id}, format="json"
    ).status_code == 200


def test_no_acepta_lote_desactivado(admin_client, customer):
    from apps.field_jobs.models import FieldPlot

    plot = FieldPlot.objects.create(customer=customer, name="Potrero 1", is_active=False)
    res = admin_client.post(
        "/api/field-jobs/", {"customer": customer.id, "plot": plot.id}, format="json"
    )
    assert res.status_code == 400
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `docker compose exec -T backend python -m pytest apps/field_jobs/tests/test_api.py -q`
Expected: FAIL — el POST devuelve 201 ignorando `plot` (campo desconocido) y `res.json()["plot"]` lanza `KeyError`.

- [ ] **Step 3: Agregar los campos al serializer**

En `backend/apps/field_jobs/serializers.py`, dentro de `FieldJobSerializer`, junto a los demás campos declarados:

```python
    plot = serializers.PrimaryKeyRelatedField(
        queryset=FieldPlot.objects.filter(is_active=True),
        required=False,
        allow_null=True,
    )
    plot_name = serializers.CharField(source="plot.name", read_only=True, default="")
```

Y en `Meta.fields`, agregar `"plot"` y `"plot_name"` justo después de `"customer_name"`.

- [ ] **Step 4: Validar la pertenencia**

En la misma clase, agregar el `validate` (junto a `validate_products`):

```python
    def validate(self, attrs):
        # El lote es un enlace informativo: debe ser del mismo cliente del trabajo.
        # En PATCH parcial, cliente y lote se resuelven contra la instancia.
        plot = attrs.get("plot", getattr(self.instance, "plot", None))
        customer = attrs.get("customer", getattr(self.instance, "customer", None))
        if plot is not None and customer is not None and plot.customer_id != customer.id:
            raise serializers.ValidationError(
                {"plot": "El lote no pertenece al cliente del trabajo."}
            )
        return attrs
```

- [ ] **Step 5: Reiniciar el backend y correr los tests**

```bash
docker compose restart backend
docker compose exec -T backend python -m pytest apps/field_jobs -q
```

Expected: PASS, incluidos los 4 tests nuevos.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/field_jobs/serializers.py backend/apps/field_jobs/tests/test_api.py
git commit -m "feat(field-jobs): el trabajo enlaza un lote del mismo cliente"
```

---

### Task 4: Extraer `ChemicalRowsEditor` (refactor sin cambio visible)

**Files:**
- Create: `frontend/src/features/field-jobs/ChemicalRowsEditor.tsx`
- Modify: `frontend/src/features/field-jobs/FieldJobFormModal.tsx` (imports, `MAX_PRODUCTS`, bloque de líneas 215-261)
- Test: `frontend/src/features/field-jobs/field-job-form.test.tsx` (**no se modifica**: es la red de seguridad del refactor)

**Interfaces:**
- Consumes: `PRODUCT_UNIT_OPTIONS` de `features/field-jobs/types.ts`.
- Produces:
  - `ChemicalRow` = `{ name: string; dose_per_hectare: number | string; unit: string }`
  - `MAX_CHEMICALS` = `10`
  - `<ChemicalRowsEditor rows onChange title? maxNote? />` — componente controlado.

- [ ] **Step 1: Correr los tests actuales del form y verlos en verde**

Run: `cd frontend && npx vitest run src/features/field-jobs/field-job-form.test.tsx`
Expected: PASS (4 tests). Es el estado que el refactor debe conservar.

- [ ] **Step 2: Crear el componente**

Crear `frontend/src/features/field-jobs/ChemicalRowsEditor.tsx`:

```tsx
import { ActionIcon, Button, Group, NumberInput, Select, Text, TextInput } from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";

import { PRODUCT_UNIT_OPTIONS } from "./types";

export interface ChemicalRow {
  name: string;
  dose_per_hectare: number | string;
  unit: string;
}

export const MAX_CHEMICALS = 10;

/** Editor de filas de químicos, compartido por el form del trabajo y el del lote. */
export function ChemicalRowsEditor({
  rows,
  onChange,
  title = "Químicos a aplicar",
  maxNote = `Máximo ${MAX_CHEMICALS} químicos por trabajo.`,
}: {
  rows: ChemicalRow[];
  onChange: (rows: ChemicalRow[]) => void;
  title?: string;
  maxNote?: string;
}) {
  const patch = (i: number, field: keyof ChemicalRow, value: string | number) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));

  return (
    <>
      <Text fw={600} size="sm" mt="sm">{title}</Text>
      {rows.map((p, i) => (
        <Group key={i} wrap="nowrap" mt={4}>
          <TextInput
            placeholder="Nombre del químico"
            value={p.name}
            onChange={(e) => patch(i, "name", e.currentTarget.value)}
            style={{ flex: 1 }}
          />
          <NumberInput
            placeholder="Dosis/ha"
            min={0}
            decimalScale={4}
            value={p.dose_per_hectare}
            onChange={(v) => patch(i, "dose_per_hectare", v as number | string)}
            w={120}
          />
          <Select
            data={PRODUCT_UNIT_OPTIONS}
            value={p.unit}
            onChange={(v) => patch(i, "unit", v ?? "L/ha")}
            allowDeselect={false}
            w={100}
          />
          <ActionIcon
            variant="subtle"
            color="red"
            aria-label="Quitar químico"
            onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
          >
            <IconTrash size={18} />
          </ActionIcon>
        </Group>
      ))}
      <Button
        variant="light"
        size="xs"
        mt={4}
        leftSection={<IconPlus size={16} />}
        disabled={rows.length >= MAX_CHEMICALS}
        onClick={() => onChange([...rows, { name: "", dose_per_hectare: 0, unit: "L/ha" }])}
      >
        Agregar químico
      </Button>
      {rows.length >= MAX_CHEMICALS && (
        <Text size="xs" c="dimmed" mt={4}>{maxNote}</Text>
      )}
    </>
  );
}
```

- [ ] **Step 3: Usarlo en `FieldJobFormModal`**

En `frontend/src/features/field-jobs/FieldJobFormModal.tsx`:

1. Quitar `ActionIcon` del import de `@mantine/core`. **`Group`, `Text`, `TextInput`, `NumberInput` y `Select` se quedan**: se siguen usando en el resto del formulario.
2. Borrar la línea `import { IconPlus, IconTrash } from "@tabler/icons-react";` (ya no se usa ninguno de los dos en este archivo).
3. Agregar `import { ChemicalRowsEditor, type ChemicalRow } from "./ChemicalRowsEditor";`.
4. Borrar la constante `const MAX_PRODUCTS = 10;`.
5. En `interface FormValues`, cambiar el tipo de `products` a `ChemicalRow[]`.
6. Reemplazar **todo** el bloque que va desde `<Text fw={600} size="sm" mt="sm">Químicos a aplicar</Text>` hasta el cierre del `{form.values.products.length >= MAX_PRODUCTS && (...)}` por:

```tsx
        <ChemicalRowsEditor
          rows={form.values.products}
          onChange={(rows) => form.setFieldValue("products", rows)}
        />
```

- [ ] **Step 4: Correr los tests del form y el typecheck**

```bash
cd frontend && npx vitest run src/features/field-jobs/ && npx tsc -b --noEmit
```

Expected: PASS sin tocar el archivo de test — mismos textos, mismos placeholders, mismo tope. Si `vitest` se queja de `PRODUCT_UNIT_OPTIONS` sin definir, es que quedó un import viejo colgando.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/field-jobs/ChemicalRowsEditor.tsx frontend/src/features/field-jobs/FieldJobFormModal.tsx
git commit -m "refactor(web): extrae el editor de químicos a un componente compartido"
```

---

### Task 5: Tipos y hooks del frontend para lotes

**Files:**
- Modify: `frontend/src/lib/api/schema.d.ts` (regenerado, no editar a mano)
- Create: `frontend/src/features/field-plots/types.ts`
- Create: `frontend/src/features/field-plots/api.ts`

**Interfaces:**
- Consumes: `/api/field-plots/` (Task 2).
- Produces:
  - `FieldPlot` = `Schemas["FieldPlot"]`
  - `useFieldPlots(params: FieldPlotListParams, enabled?: boolean)` → `UseQueryResult<FieldPlot[]>` (**array plano**, la API no pagina).
  - `useSaveFieldPlot()` → mutación con `Partial<FieldPlot> & { id?: number }`.
  - `useDeleteFieldPlot()` → mutación con `id: number`.

- [ ] **Step 1: Regenerar los tipos del API**

Con el backend arriba (`docker compose up -d` y `/api/schema/` respondiendo):

```bash
cd frontend && npm run gen:api
git diff --stat src/lib/api/schema.d.ts
```

Expected: el diff agrega los esquemas `FieldPlot`, `FieldPlotProduct`, `PatchedFieldPlot` y las rutas `/api/field-plots/`, además de `plot`/`plot_name` dentro de `FieldJob`. Si no aparecen, el backend no tomó los cambios: `docker compose restart backend` y repetir.

- [ ] **Step 2: Crear los tipos**

Crear `frontend/src/features/field-plots/types.ts`:

```ts
import type { Schemas } from "../../lib/api/types";

export type FieldPlot = Schemas["FieldPlot"];
```

- [ ] **Step 3: Crear los hooks**

Crear `frontend/src/features/field-plots/api.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../../lib/api/client";
import type { FieldPlot } from "./types";

export interface FieldPlotListParams {
  customer?: number;
  search?: string;
  includeInactive?: boolean;
}

/** La API de lotes no pagina: devuelve un array plano. */
export function useFieldPlots(params: FieldPlotListParams, enabled = true) {
  return useQuery({
    queryKey: ["field-plots", params],
    enabled,
    queryFn: async () => {
      const { data, error } = await api.GET("/api/field-plots/", {
        params: {
          query: {
            customer: params.customer,
            search: params.search || undefined,
            include_inactive: params.includeInactive ? "true" : undefined,
          } as unknown as never,
        },
      });
      if (error || !data) throw new Error("No se pudieron cargar los lotes.");
      return data as unknown as FieldPlot[];
    },
  });
}

export function useSaveFieldPlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<FieldPlot> & { id?: number }) => {
      const { id, ...body } = payload;
      if (id) {
        const { data, error } = await api.PATCH("/api/field-plots/{id}/", {
          params: { path: { id } },
          body: body as FieldPlot,
        });
        if (error) throw new Error("No se pudo guardar el lote.");
        return data as FieldPlot;
      }
      const { data, error } = await api.POST("/api/field-plots/", {
        body: body as FieldPlot,
      });
      if (error) throw new Error("No se pudo crear el lote.");
      return data as FieldPlot;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["field-plots"] }),
  });
}

export function useDeleteFieldPlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await api.DELETE("/api/field-plots/{id}/", {
        params: { path: { id } },
      });
      if (error) throw new Error("No se pudo eliminar el lote.");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["field-plots"] }),
  });
}
```

- [ ] **Step 4: Verificar tipos**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: sin errores. Si `Schemas["FieldPlot"]` no existe, el Step 1 no regeneró bien el esquema.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api/schema.d.ts frontend/src/features/field-plots/
git commit -m "feat(web): tipos y hooks del API de lotes"
```

---

### Task 6: `FieldPlotFormModal`

**Files:**
- Create: `frontend/src/features/field-plots/FieldPlotFormModal.tsx`
- Test: `frontend/src/features/field-plots/field-plot-form.test.tsx`

**Interfaces:**
- Consumes: `useSaveFieldPlot` (Task 5), `ChemicalRowsEditor`/`ChemicalRow`/`MAX_CHEMICALS` (Task 4), `CROP_OPTIONS` de `features/field-jobs/types.ts`.
- Produces: `<FieldPlotFormModal opened onClose customerId plot? />` — `plot` a `null`/`undefined` significa alta.

- [ ] **Step 1: Escribir el test**

Crear `frontend/src/features/field-plots/field-plot-form.test.tsx`:

```tsx
import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FieldPlotFormModal } from "./FieldPlotFormModal";

vi.mock("./api", () => ({
  useSaveFieldPlot: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

function renderForm() {
  return render(
    <MantineProvider>
      <FieldPlotFormModal opened onClose={() => {}} customerId={1} plot={null} />
    </MantineProvider>,
  );
}

describe("FieldPlotFormModal", () => {
  it("muestra los campos del lote", () => {
    renderForm();
    expect(screen.getByLabelText(/nombre del lote/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/hectáreas/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tasa de aplicación/i)).toBeInTheDocument();
  });

  it("revela el texto de cultivo al elegir Otros", () => {
    renderForm();
    expect(screen.queryByLabelText(/especifica el cultivo/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^cultivo$/i), { target: { value: "other" } });
    expect(screen.getByLabelText(/especifica el cultivo/i)).toBeInTheDocument();
  });

  it("permite agregar químicos y corta en 10 con el texto del lote", () => {
    renderForm();
    const addBtn = screen.getByRole("button", { name: /agregar químico/i });
    for (let i = 0; i < 10; i++) fireEvent.click(addBtn);
    expect(addBtn).toBeDisabled();
    expect(screen.getByText(/máximo 10 químicos por lote/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd frontend && npx vitest run src/features/field-plots/field-plot-form.test.tsx`
Expected: FAIL — `Failed to resolve import "./FieldPlotFormModal"`.

- [ ] **Step 3: Escribir el modal**

Crear `frontend/src/features/field-plots/FieldPlotFormModal.tsx`:

```tsx
import {
  Button,
  Grid,
  Group,
  Modal,
  NativeSelect,
  NumberInput,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useEffect } from "react";

import { ChemicalRowsEditor, type ChemicalRow } from "../field-jobs/ChemicalRowsEditor";
import { CROP_OPTIONS } from "../field-jobs/types";
import { useSaveFieldPlot } from "./api";
import type { FieldPlot } from "./types";

interface FormValues {
  name: string;
  hectares: number | string;
  crop: string;
  crop_other: string;
  location: string;
  water_per_hectare: number | string;
  notes: string;
  products: ChemicalRow[];
}

const EMPTY: FormValues = {
  name: "",
  hectares: 1,
  crop: "rice",
  crop_other: "",
  location: "",
  water_per_hectare: "",
  notes: "",
  products: [],
};

const numOrNull = (v: number | string) => (v === "" || v == null ? null : String(v));

export function FieldPlotFormModal({
  opened,
  onClose,
  customerId,
  plot,
}: {
  opened: boolean;
  onClose: () => void;
  customerId: number;
  plot?: FieldPlot | null;
}) {
  const save = useSaveFieldPlot();
  const editing = Boolean(plot?.id);

  const form = useForm<FormValues>({
    initialValues: EMPTY,
    validate: { name: (v) => (v.trim() ? null : "Escribe un nombre para el lote.") },
  });

  useEffect(() => {
    if (opened) {
      form.setValues({
        ...EMPTY,
        ...(plot
          ? {
              name: plot.name ?? "",
              hectares: plot.hectares ?? 1,
              crop: plot.crop ?? "rice",
              crop_other: plot.crop_other ?? "",
              location: plot.location ?? "",
              water_per_hectare: plot.water_per_hectare ?? "",
              notes: plot.notes ?? "",
              products: (plot.products ?? []).map((p) => ({
                name: p.name,
                dose_per_hectare: p.dose_per_hectare ?? "",
                unit: p.unit ?? "L/ha",
              })),
            }
          : {}),
      } as FormValues);
      form.clearErrors();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, plot]);

  const submit = form.onSubmit(async (values) => {
    const payload = {
      id: plot?.id,
      customer: customerId,
      name: values.name.trim(),
      hectares: String(values.hectares || 0),
      crop: values.crop,
      crop_other: values.crop === "other" ? values.crop_other : "",
      location: values.location,
      water_per_hectare: numOrNull(values.water_per_hectare),
      notes: values.notes,
      products: values.products
        .filter((p) => p.name.trim())
        .map((p) => ({
          name: p.name.trim(),
          dose_per_hectare: String(p.dose_per_hectare || 0),
          unit: p.unit,
        })),
    };
    try {
      await save.mutateAsync(payload as unknown as Partial<FieldPlot> & { id?: number });
      notifications.show({
        color: "green",
        message: editing ? "Lote actualizado." : "Lote creado.",
      });
      onClose();
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  });

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={editing ? "Editar lote" : "Nuevo lote"}
      size="lg"
    >
      <form onSubmit={submit}>
        <Grid>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="Nombre del lote" withAsterisk {...form.getInputProps("name")} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="Ubicación" {...form.getInputProps("location")} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <NumberInput label="Hectáreas" min={0} decimalScale={4} {...form.getInputProps("hectares")} />
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <NativeSelect label="Cultivo" data={CROP_OPTIONS} {...form.getInputProps("crop")} />
          </Grid.Col>
          {form.values.crop === "other" && (
            <Grid.Col span={{ base: 6, sm: 3 }}>
              <TextInput label="Especifica el cultivo" {...form.getInputProps("crop_other")} />
            </Grid.Col>
          )}
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <NumberInput
              label="Tasa de aplicación (L/ha)"
              min={0}
              decimalScale={2}
              {...form.getInputProps("water_per_hectare")}
            />
          </Grid.Col>
        </Grid>

        <ChemicalRowsEditor
          rows={form.values.products}
          title="Químicos habituales"
          maxNote="Máximo 10 químicos por lote."
          onChange={(rows) => form.setFieldValue("products", rows)}
        />

        <Textarea label="Notas" autosize minRows={2} mt="sm" {...form.getInputProps("notes")} />

        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={save.isPending}>Guardar</Button>
        </Group>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 4: Correr el test y el typecheck**

```bash
cd frontend && npx vitest run src/features/field-plots/ && npx tsc -b --noEmit
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/field-plots/FieldPlotFormModal.tsx frontend/src/features/field-plots/field-plot-form.test.tsx
git commit -m "feat(web): formulario de lote con su receta habitual"
```

---

### Task 7: Pestaña "Lotes" en el detalle del cliente

**Files:**
- Create: `frontend/src/features/field-plots/FieldPlotsTab.tsx`
- Modify: `frontend/src/features/customers/CustomerDetailPage.tsx` (bloque `<Tabs>`, líneas ~105-135)
- Test: `frontend/src/features/field-plots/field-plots-tab.test.tsx`

**Interfaces:**
- Consumes: `useFieldPlots`, `useDeleteFieldPlot` (Task 5), `FieldPlotFormModal` (Task 6), `canWriteFieldJobs` de `features/auth/roles.ts`, `useAuth` de `features/auth/useAuth.ts`, `DataTable`/`Column` de `components/ui/DataTable`.
- Produces: `<FieldPlotsTab customerId={number} />`.

- [ ] **Step 1: Escribir el test**

Crear `frontend/src/features/field-plots/field-plots-tab.test.tsx`:

```tsx
import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FieldPlotsTab } from "./FieldPlotsTab";

const role = { current: "general_admin" };

vi.mock("../auth/useAuth", () => ({ useAuth: () => ({ user: { role: role.current } }) }));
vi.mock("./api", () => ({
  useFieldPlots: () => ({
    data: [
      {
        id: 1,
        name: "Potrero 1",
        hectares: "15.0000",
        crop: "rice",
        crop_display: "Arroz",
        crop_other: "",
        location: "Entrada norte",
        water_per_hectare: "20.00",
        products: [{ id: 1, name: "Glifosato", dose_per_hectare: "10.0000", unit: "L/ha" }],
      },
    ],
    isLoading: false,
  }),
  useDeleteFieldPlot: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("./FieldPlotFormModal", () => ({ FieldPlotFormModal: () => null }));

function renderTab() {
  return render(
    <MantineProvider>
      <FieldPlotsTab customerId={1} />
    </MantineProvider>,
  );
}

describe("FieldPlotsTab", () => {
  it("lista los lotes del cliente", () => {
    role.current = "general_admin";
    renderTab();
    expect(screen.getByText("Potrero 1")).toBeInTheDocument();
    expect(screen.getByText("Entrada norte")).toBeInTheDocument();
    expect(screen.getByText("Arroz")).toBeInTheDocument();
  });

  it("muestra el botón de alta a quien puede escribir", () => {
    role.current = "piloto";
    renderTab();
    expect(screen.getByRole("button", { name: /nuevo lote/i })).toBeInTheDocument();
  });

  it("oculta las acciones a un rol de solo lectura", () => {
    role.current = "readonly";
    renderTab();
    expect(screen.queryByRole("button", { name: /nuevo lote/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/editar lote/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd frontend && npx vitest run src/features/field-plots/field-plots-tab.test.tsx`
Expected: FAIL — `Failed to resolve import "./FieldPlotsTab"`.

- [ ] **Step 3: Escribir la pestaña**

Crear `frontend/src/features/field-plots/FieldPlotsTab.tsx`:

```tsx
import { ActionIcon, Button, Group, Stack } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconEdit, IconPlus, IconTrash } from "@tabler/icons-react";
import { useState } from "react";

import { DataTable, type Column } from "../../components/ui/DataTable";
import { canWriteFieldJobs } from "../auth/roles";
import { useAuth } from "../auth/useAuth";
import { useDeleteFieldPlot, useFieldPlots } from "./api";
import { FieldPlotFormModal } from "./FieldPlotFormModal";
import type { FieldPlot } from "./types";

export function FieldPlotsTab({ customerId }: { customerId: number }) {
  const { user } = useAuth();
  const canWrite = canWriteFieldJobs(user?.role);
  const { data, isLoading } = useFieldPlots({ customer: customerId });
  const del = useDeleteFieldPlot();
  const [editing, setEditing] = useState<FieldPlot | null>(null);
  const [formOpen, { open, close }] = useDisclosure(false);

  const openNew = () => {
    setEditing(null);
    open();
  };
  const openEdit = (p: FieldPlot) => {
    setEditing(p);
    open();
  };

  const confirmDelete = (p: FieldPlot) =>
    modals.openConfirmModal({
      title: "Eliminar lote",
      children: `¿Marcar el lote "${p.name}" como inactivo?`,
      labels: { confirm: "Eliminar", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await del.mutateAsync(p.id);
          notifications.show({ color: "green", message: "Lote eliminado." });
        } catch (e) {
          notifications.show({ color: "red", message: (e as Error).message });
        }
      },
    });

  const columns: Column<FieldPlot>[] = [
    { header: "Nombre", render: (p) => p.name },
    { header: "Hectáreas", align: "right", render: (p) => Number(p.hectares ?? 0).toLocaleString("es-PA") },
    { header: "Cultivo", render: (p) => (p.crop === "other" ? p.crop_other || "Otros" : p.crop_display || "—") },
    { header: "Ubicación", render: (p) => p.location || "—" },
    { header: "Tasa (L/ha)", align: "right", render: (p) => p.water_per_hectare ?? "—" },
    { header: "Químicos", align: "right", render: (p) => (p.products ?? []).length },
    ...(canWrite
      ? [
          {
            header: "",
            align: "right" as const,
            render: (p: FieldPlot) => (
              <Group gap={4} justify="flex-end" wrap="nowrap">
                <ActionIcon variant="subtle" aria-label="Editar lote" onClick={() => openEdit(p)}>
                  <IconEdit size={18} />
                </ActionIcon>
                <ActionIcon variant="subtle" color="red" aria-label="Eliminar lote" onClick={() => confirmDelete(p)}>
                  <IconTrash size={18} />
                </ActionIcon>
              </Group>
            ),
          },
        ]
      : []),
  ];

  return (
    <Stack>
      {canWrite && (
        <Group justify="flex-end">
          <Button leftSection={<IconPlus size={18} />} onClick={openNew}>
            Nuevo lote
          </Button>
        </Group>
      )}
      <DataTable
        columns={columns}
        rows={data ?? []}
        loading={isLoading}
        rowKey={(p) => p.id}
        emptyText="Este cliente no tiene lotes."
      />
      <FieldPlotFormModal
        opened={formOpen}
        onClose={close}
        customerId={customerId}
        plot={editing}
      />
    </Stack>
  );
}
```

- [ ] **Step 4: Enchufar la pestaña en el detalle del cliente**

En `frontend/src/features/customers/CustomerDetailPage.tsx`:

1. Agregar el import `import { FieldPlotsTab } from "../field-plots/FieldPlotsTab";`
2. Dentro de `<Tabs.List>`, después de la pestaña "Facturas":

```tsx
          <Tabs.Tab value="plots">Lotes</Tabs.Tab>
```

3. Después del `<Tabs.Panel value="invoices">`:

```tsx
        <Tabs.Panel value="plots" pt="md">
          {customerId != null && <FieldPlotsTab customerId={customerId} />}
        </Tabs.Panel>
```

- [ ] **Step 5: Correr los tests y el typecheck**

```bash
cd frontend && npx vitest run && npx tsc -b --noEmit
```

Expected: PASS — los 3 tests nuevos y toda la suite previa (los tests de clientes no deben romperse: la pestaña nueva se monta perezosamente dentro de su panel).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/field-plots/FieldPlotsTab.tsx frontend/src/features/field-plots/field-plots-tab.test.tsx frontend/src/features/customers/CustomerDetailPage.tsx
git commit -m "feat(web): pestaña de lotes en el detalle del cliente"
```

---

### Task 8: Selector de lote y autollenado en el Trabajo de campo

**Files:**
- Modify: `frontend/src/features/field-jobs/FieldJobFormModal.tsx`
- Modify: `frontend/src/features/field-jobs/FieldJobDetailPage.tsx` (ficha, ~línea 85)
- Test: `frontend/src/features/field-jobs/field-job-form.test.tsx` (agregar casos)

**Interfaces:**
- Consumes: `useFieldPlots` (Task 5), `FieldPlot` (Task 5), campos `plot`/`plot_name` del API (Task 3).
- Produces: `FormValues` de `FieldJobFormModal` gana `plot: string | null`, que viaja en el payload como `plot: number | null`.

- [ ] **Step 1: Escribir los tests nuevos**

En `frontend/src/features/field-jobs/field-job-form.test.tsx`, agregar el mock de clientes y lotes y los casos. Reemplazar el mock de clientes existente por uno con datos, y agregar el de lotes:

```tsx
vi.mock("../customers/api", () => ({
  useCustomers: () => ({ data: { results: [{ id: 7, name: "Finca La Esperanza" }] } }),
}));
vi.mock("../field-plots/api", () => ({
  useFieldPlots: () => ({
    data: [
      {
        id: 3,
        name: "Potrero 1",
        hectares: "15.0000",
        crop: "corn",
        crop_other: "",
        location: "Entrada norte",
        water_per_hectare: "20.00",
        products: [{ id: 1, name: "Glifosato", dose_per_hectare: "10.0000", unit: "L/ha" }],
      },
    ],
    isLoading: false,
  }),
}));
```

Y al final del `describe`:

```tsx
  it("no muestra el selector de lote sin cliente elegido", () => {
    renderForm();
    expect(screen.queryByLabelText(/^lote$/i)).not.toBeInTheDocument();
  });

  it("al elegir un lote copia sus datos y avisa", async () => {
    renderForm();
    // Mantine Select es un input con listbox; se elige por texto de la opción.
    fireEvent.click(screen.getByLabelText(/^cliente$/i));
    fireEvent.click(await screen.findByText("Finca La Esperanza"));

    fireEvent.click(screen.getByLabelText(/^lote$/i));
    fireEvent.click(await screen.findByText("Potrero 1"));

    expect(screen.getByText(/datos del lote cargados/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/finca \/ ubicación/i)).toHaveValue("Entrada norte");
    // NumberInput normaliza los decimales: se compara con regex, no con "15".
    expect(screen.getByLabelText(/hectáreas/i)).toHaveDisplayValue(/^15/);
    expect(screen.getByDisplayValue("Glifosato")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `cd frontend && npx vitest run src/features/field-jobs/field-job-form.test.tsx`
Expected: FAIL — no existe ningún control con la etiqueta "Lote".

- [ ] **Step 3: Agregar el estado y el selector**

En `frontend/src/features/field-jobs/FieldJobFormModal.tsx`:

1. Imports nuevos:

```tsx
import { useState } from "react";

import { useFieldPlots } from "../field-plots/api";
import type { FieldPlot } from "../field-plots/types";
```

(`useState` se suma al `import { useEffect } from "react";` existente.)

2. En `interface FormValues`, agregar `plot: string | null;` debajo de `customer`. En `EMPTY`, agregar `plot: null,`.

3. Dentro del componente, **después** del bloque `const form = useForm<FormValues>({...});` (no antes: las dos últimas líneas leen `form.values`):

```tsx
  const [plotLoaded, setPlotLoaded] = useState(false);
  const customerId = form.values.customer ? Number(form.values.customer) : undefined;
  const plots = useFieldPlots({ customer: customerId }, customerId != null);
```

4. En el `useEffect` de apertura, agregar dentro del objeto del `job` la línea `plot: job.plot ? String(job.plot) : null,` y, antes de `form.clearErrors()`, `setPlotLoaded(false);`.

5. Copiar el lote al elegirlo — agregar esta función antes del `return`:

```tsx
  const applyPlot = (value: string | null) => {
    form.setFieldValue("plot", value);
    const plot = (plots.data ?? []).find((p: FieldPlot) => String(p.id) === value);
    if (!plot) {
      setPlotLoaded(false);
      return;
    }
    form.setFieldValue("location", plot.location ?? "");
    form.setFieldValue("crop", plot.crop ?? "rice");
    form.setFieldValue("crop_other", plot.crop_other ?? "");
    form.setFieldValue("hectares", plot.hectares ?? 1);
    form.setFieldValue("water_per_hectare", plot.water_per_hectare ?? "");
    form.setFieldValue(
      "products",
      (plot.products ?? []).map((p) => ({
        name: p.name,
        dose_per_hectare: p.dose_per_hectare ?? "",
        unit: p.unit ?? "L/ha",
      })),
    );
    setPlotLoaded(true);
  };
```

6. En el `<Select label="Cliente">`, **después** del spread de `getInputProps`, sobreescribir el `onChange` para limpiar el lote:

```tsx
              {...form.getInputProps("customer")}
              onChange={(v) => {
                form.setFieldValue("customer", v);
                form.setFieldValue("plot", null);
                setPlotLoaded(false);
              }}
```

7. Justo después de la `Grid.Col` del cliente, agregar la del lote:

```tsx
          {form.values.customer && (
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Select
                label="Lote"
                placeholder="Sin lote"
                data={(plots.data ?? []).map((p: FieldPlot) => ({
                  value: String(p.id),
                  label: p.name,
                }))}
                searchable
                clearable
                value={form.values.plot}
                onChange={applyPlot}
              />
              {plotLoaded && (
                <Text size="xs" c="teal" mt={4}>Datos del lote cargados</Text>
              )}
            </Grid.Col>
          )}
```

8. En el objeto `payload` del `submit`, agregar:

```tsx
      plot: values.plot ? Number(values.plot) : null,
```

- [ ] **Step 4: Mostrar el lote en el detalle del trabajo**

En `frontend/src/features/field-jobs/FieldJobDetailPage.tsx`, dentro del primer `<Grid>` de la `Card`, después de la columna "Finca":

```tsx
          <Grid.Col span={{ base: 6, sm: 3 }}><Field label="Lote" value={job.plot_name || "—"} /></Grid.Col>
```

- [ ] **Step 5: Correr los tests y el typecheck**

```bash
cd frontend && npx vitest run && npx tsc -b --noEmit
```

Expected: PASS — toda la suite del frontend, incluidos los 2 casos nuevos. Si el clic sobre la opción del `Select` no la encuentra, usar `screen.findByRole("option", { name: "Potrero 1" })`; Mantine 9 renderiza las opciones en un portal dentro del mismo contenedor.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/field-jobs/FieldJobFormModal.tsx frontend/src/features/field-jobs/FieldJobDetailPage.tsx frontend/src/features/field-jobs/field-job-form.test.tsx
git commit -m "feat(web): el trabajo de campo se autollena desde el lote del cliente"
```

---

### Task 9: Verificación completa y cierre

**Files:**
- Modify: ninguno salvo que aparezca un defecto.

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: evidencia de que la Fase 1 funciona end-to-end.

- [ ] **Step 1: Suite completa del backend**

Run: `docker compose exec -T backend python -m pytest -q`
Expected: PASS. La referencia antes de este plan era **545 tests en verde**; ahora deben ser ~566 (21 nuevos). Cualquier test rojo que no sea de lotes es una regresión y se arregla antes de seguir.

- [ ] **Step 2: Suite completa del frontend + tipos + build**

```bash
cd frontend && npx vitest run && npx tsc -b --noEmit && npm run build
```

Expected: PASS. La referencia antes de este plan era **123 tests**; ahora ~131.

- [ ] **Step 3: Confirmar que no quedaron migraciones sin generar**

Run: `docker compose exec -T backend python manage.py makemigrations --check --dry-run`
Expected: "No changes detected". Si detecta algo, falta commitear una migración.

- [ ] **Step 4: Prueba en el navegador**

Con `docker compose up -d` y sesión de admin:

1. Cliente → detalle → pestaña **Lotes** → "Nuevo lote": nombre "Potrero 1", 15 ha, cultivo Maíz, ubicación "Entrada norte", tasa 20, dos químicos. Guardar y verlo en la tabla con "2" en la columna Químicos.
2. Intentar crear otro lote con el mismo nombre → debe salir el error "Ya existe un lote activo con ese nombre para este cliente."
3. Trabajos de campo → "Nuevo": elegir ese cliente, elegir el lote → los campos se llenan solos y aparece "Datos del lote cargados".
4. "Detalles de aplicación" → "Calcular mezcla" → el cálculo usa la tasa y los químicos del lote.
5. Guardar el trabajo y abrir su detalle → la ficha muestra **Lote: Potrero 1**.
6. Volver al cliente y eliminar el lote → desaparece de la tabla; el trabajo ya creado conserva sus datos.

- [ ] **Step 5: Actualizar la memoria del proyecto**

Agregar a `veragro-erp-progreso.md` una entrada "HECHO (en V3.0) — Fase 1: Lotes por cliente" con: los dos modelos y la migración `field_jobs/0004`, la ruta `/api/field-plots/` sin paginación, el enlace `plot` del trabajo, el componente `ChemicalRowsEditor` compartido, y el recordatorio de que **en producción hace falta `migrate`**. Anotar en `veragro-erp-followups.md` que las Fases 2 (receta PDF/WhatsApp) y 3 (Delta T) siguen pendientes.

- [ ] **Step 6: Commit final y push**

```bash
git add docs/superpowers/
git commit -m "docs: spec y plan de lotes por cliente (Fase 1)"
git push origin V3.0
```

---

## Notas para quien ejecute

- **Orden obligatorio:** las tareas 1→3 son backend y la 5 depende de que el backend esté corriendo con los cambios (regenera `schema.d.ts` desde `/api/schema/`). La 4 es independiente y se puede hacer en paralelo con el backend.
- **Trampa de Windows:** si un test de API devuelve 404 después de haber escrito la vista, casi siempre es el autoreload: `docker compose restart backend`.
- **Trampa del enum:** si `makemigrations` propone `AlterField` sobre `fieldjobproduct.unit` o `fieldjob.crop`, se tocaron los enums existentes. Revertir: el lote los **reutiliza**, no los redefine.
- **Trampa del array:** `/api/field-plots/` no pagina. Si un hook hace `data.results`, explota en tiempo de ejecución con `undefined`.
