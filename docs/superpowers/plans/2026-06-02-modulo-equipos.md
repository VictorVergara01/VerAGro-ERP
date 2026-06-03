# Módulo de Equipos Veragro ERP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el módulo de Equipos del ERP Veragro: tipos de equipo (lookup sembrado + endpoint read-only), modelo Equipment, CRUD con búsqueda/filtros/soft-delete-vía-status, validación owner/customer, permisos por rol reutilizables, y endpoint placeholder de historial.

**Architecture:** App Django `apps.equipment` siguiendo el patrón ya establecido en `apps.customers` (models → serializers → views (ViewSet) → urls → tests). Tipos en tabla `EquipmentType` sembrada por data migration y expuesta read-only. Permiso reutilizable `RoleWriteOrReadOnly` añadido a `apps.core`. Soft-delete vía `status="retired"`. Sin dependencias nuevas.

**Tech Stack:** Python 3.12, Django 5.1, DRF, simplejwt (ya configurado), PostgreSQL, pytest-django, Docker Compose.

---

## Convenciones

- Todo corre en Docker: `docker compose up -d db redis` y luego `docker compose run --rm backend <cmd>`.
- Rutas relativas a la raíz `C:/Users/victo/Proyectos/VerAgro-ERP`.
- Rama de trabajo: `feat/modulo-equipos` (ya creada).
- Commits en español; cada commit con trailer:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
  (usar `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "..."`).
- Base existente: `apps.core.models.TimeStampedModel`; `apps.core.permissions` con `IsAdmin`,
  `IsAdminOrReadOnly`, `role_required`; `apps.customers.models.Customer`; auth JWT en
  `/api/auth/`; `config/urls.py` ya incluye admin, schema, docs, `api/auth/`, y
  `api/` (customers). La app `apps.equipment` existe pero está vacía (solo `__init__.py`,
  `apps.py`, `migrations/__init__.py`).

---

## Task 1: Permiso reutilizable RoleWriteOrReadOnly

**Files:**
- Modify: `backend/apps/core/permissions.py`
- Modify: `backend/apps/core/tests/test_permissions.py`

- [ ] **Step 1: Añadir los tests al final de `backend/apps/core/tests/test_permissions.py`**

Primero, actualizar el import en la parte superior del archivo. Cambiar:
```python
from apps.core.permissions import IsAdmin, IsAdminOrReadOnly, role_required
```
por:
```python
from apps.core.permissions import (
    IsAdmin,
    IsAdminOrReadOnly,
    RoleWriteOrReadOnly,
    role_required,
)
```

Luego añadir al final del archivo:
```python


@pytest.mark.django_db
def test_role_write_or_readonly_allows_read_for_any_authenticated():
    ro = User.objects.create_user(
        email="ro@v.com", password="x", full_name="RO", role="readonly"
    )
    perm = RoleWriteOrReadOnly("admin", "technician")()
    assert perm.has_permission(_request("get", ro), None) is True


@pytest.mark.django_db
def test_role_write_or_readonly_allows_write_for_listed_role():
    tech = User.objects.create_user(
        email="tw@v.com", password="x", full_name="T", role="technician"
    )
    perm = RoleWriteOrReadOnly("admin", "technician")()
    assert perm.has_permission(_request("post", tech), None) is True


@pytest.mark.django_db
def test_role_write_or_readonly_blocks_write_for_unlisted_role():
    ro = User.objects.create_user(
        email="ro2@v.com", password="x", full_name="RO", role="readonly"
    )
    perm = RoleWriteOrReadOnly("admin", "technician")()
    assert perm.has_permission(_request("post", ro), None) is False
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
docker compose up -d db redis
docker compose run --rm backend pytest apps/core/tests/test_permissions.py -v
```
Expected: ImportError / fallos (RoleWriteOrReadOnly no existe aún).

- [ ] **Step 3: Implementar en `backend/apps/core/permissions.py`**

Añadir al final del archivo (después de `role_required`):
```python


def RoleWriteOrReadOnly(*write_roles):
    """Lectura para cualquier autenticado; escritura solo para los roles dados.

    Uso: ``permission_classes = [RoleWriteOrReadOnly("admin", "technician")]``.
    Métodos seguros (GET/HEAD/OPTIONS) los puede usar cualquier usuario
    autenticado; la escritura queda restringida a ``write_roles``.
    """

    allowed = set(write_roles)

    class _RoleWriteOrReadOnly(BasePermission):
        def has_permission(self, request, view):
            if not (request.user and request.user.is_authenticated):
                return False
            if request.method in SAFE_METHODS:
                return True
            return request.user.role in allowed

    return _RoleWriteOrReadOnly
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
docker compose run --rm backend pytest apps/core/tests/test_permissions.py -v
```
Expected: todos PASS (los 6 previos + 3 nuevos = 9).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: permiso reutilizable RoleWriteOrReadOnly en core

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Modelos EquipmentType y Equipment

**Files:**
- Create: `backend/apps/equipment/models.py`
- Create: `backend/apps/equipment/tests/__init__.py`
- Create: `backend/apps/equipment/tests/test_models.py`

- [ ] **Step 1: Crear `backend/apps/equipment/tests/__init__.py`** (vacío)

- [ ] **Step 2: Escribir `backend/apps/equipment/tests/test_models.py`**

```python
import pytest

from apps.customers.models import Customer
from apps.equipment.models import Equipment, EquipmentType


@pytest.mark.django_db
def test_equipment_type_str():
    t = EquipmentType.objects.create(name="Drone agrícola")
    assert str(t) == "Drone agrícola"
    assert t.is_active is True


@pytest.mark.django_db
def test_create_equipment_defaults():
    t = EquipmentType.objects.create(name="Batería")
    e = Equipment.objects.create(name="Batería T50 #1", equipment_type=t)
    assert e.status == "active"
    assert e.owner_type == "customer"
    assert str(e) == "Batería T50 #1"
    assert e.created_at is not None


@pytest.mark.django_db
def test_equipment_linked_to_customer():
    t = EquipmentType.objects.create(name="Bomba")
    c = Customer.objects.create(name="Agro SA")
    e = Equipment.objects.create(
        name="Bomba 1", equipment_type=t, owner_type="customer", customer=c
    )
    assert e.customer == c
    assert list(c.equipment.all()) == [e]
```

- [ ] **Step 3: Ejecutar y verificar que falla**

```bash
docker compose run --rm backend pytest apps/equipment/tests/test_models.py -v
```
Expected: FAIL (ModuleNotFoundError: apps.equipment.models).

- [ ] **Step 4: Implementar `backend/apps/equipment/models.py`**

```python
from django.db import models

from apps.core.models import TimeStampedModel


class EquipmentType(TimeStampedModel):
    name = models.CharField(max_length=100, unique=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("name",)

    def __str__(self):
        return self.name


class Equipment(TimeStampedModel):
    class OwnerType(models.TextChoices):
        CUSTOMER = "customer", "Cliente"
        COMPANY = "company", "Empresa"

    class Status(models.TextChoices):
        ACTIVE = "active", "Activo"
        IN_MAINTENANCE = "in_maintenance", "En mantenimiento"
        OUT_OF_SERVICE = "out_of_service", "Fuera de servicio"
        SOLD = "sold", "Vendido"
        RETIRED = "retired", "Retirado"

    owner_type = models.CharField(
        max_length=20, choices=OwnerType.choices, default=OwnerType.CUSTOMER
    )
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="equipment",
    )
    equipment_type = models.ForeignKey(
        EquipmentType, on_delete=models.PROTECT, related_name="equipment"
    )
    name = models.CharField(max_length=255)
    brand = models.CharField(max_length=100, blank=True)
    model = models.CharField(max_length=100, blank=True)
    serial_number = models.CharField(max_length=100, blank=True)
    internal_code = models.CharField(max_length=100, blank=True)
    purchase_date = models.DateField(null=True, blank=True)
    warranty_expiration = models.DateField(null=True, blank=True)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.ACTIVE
    )
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ("name",)

    def __str__(self):
        return self.name
```

- [ ] **Step 5: Generar migraciones y correr tests**

```bash
docker compose run --rm backend python manage.py makemigrations equipment
docker compose run --rm backend pytest apps/equipment/tests/test_models.py -v
```
Expected: migración `0001_initial.py` creada; 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/equipment
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: modelos EquipmentType y Equipment

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Seed de tipos de equipo (data migration)

**Files:**
- Create: `backend/apps/equipment/migrations/0002_seed_equipment_types.py`
- Create: `backend/apps/equipment/tests/test_seed.py`

- [ ] **Step 1: Escribir `backend/apps/equipment/tests/test_seed.py`**

```python
import pytest

from apps.equipment.models import EquipmentType

EXPECTED_TYPES = {
    "Drone agrícola",
    "Drone de mapeo",
    "Planta eléctrica",
    "Cargador",
    "Batería",
    "Bomba",
    "Atomizador",
    "Control remoto",
    "Otro",
}


@pytest.mark.django_db
def test_equipment_types_are_seeded():
    names = set(EquipmentType.objects.values_list("name", flat=True))
    assert EXPECTED_TYPES.issubset(names)
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
docker compose run --rm backend pytest apps/equipment/tests/test_seed.py -v
```
Expected: FAIL (no hay tipos sembrados; pytest-django aplica migraciones a la BD de test,
así que esto valida la data migration).

- [ ] **Step 3: Crear `backend/apps/equipment/migrations/0002_seed_equipment_types.py`**

```python
from django.db import migrations

TYPES = [
    "Drone agrícola",
    "Drone de mapeo",
    "Planta eléctrica",
    "Cargador",
    "Batería",
    "Bomba",
    "Atomizador",
    "Control remoto",
    "Otro",
]


def seed_types(apps, schema_editor):
    EquipmentType = apps.get_model("equipment", "EquipmentType")
    for name in TYPES:
        EquipmentType.objects.get_or_create(name=name)


def unseed_types(apps, schema_editor):
    EquipmentType = apps.get_model("equipment", "EquipmentType")
    EquipmentType.objects.filter(name__in=TYPES).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("equipment", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_types, unseed_types),
    ]
```

- [ ] **Step 4: Correr los tests**

```bash
docker compose run --rm backend pytest apps/equipment/tests/test_seed.py -v
```
Expected: PASS.

- [ ] **Step 5: Aplicar la migración a la BD de desarrollo y verificar**

```bash
docker compose run --rm backend python manage.py migrate equipment
docker compose run --rm backend python manage.py shell -c "from apps.equipment.models import EquipmentType; print(EquipmentType.objects.count())"
```
Expected: imprime 9 (o más si ya existían algunos por otra vía).

- [ ] **Step 6: Commit**

```bash
git add backend/apps/equipment
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: seed de tipos de equipo por data migration

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Serializers (Equipment + EquipmentType) con validación owner/customer

**Files:**
- Create: `backend/apps/equipment/serializers.py`
- Create: `backend/apps/equipment/tests/test_serializers.py`

- [ ] **Step 1: Escribir `backend/apps/equipment/tests/test_serializers.py`**

```python
import pytest

from apps.customers.models import Customer
from apps.equipment.models import Equipment, EquipmentType
from apps.equipment.serializers import EquipmentSerializer


@pytest.mark.django_db
def test_customer_owner_requires_customer():
    t = EquipmentType.objects.create(name="Bomba")
    s = EquipmentSerializer(
        data={"name": "B1", "equipment_type": t.id, "owner_type": "customer"}
    )
    assert s.is_valid() is False
    assert "customer" in str(s.errors).lower() or "non_field" in s.errors


@pytest.mark.django_db
def test_company_owner_rejects_customer():
    t = EquipmentType.objects.create(name="Bomba")
    c = Customer.objects.create(name="Agro SA")
    s = EquipmentSerializer(
        data={
            "name": "B1",
            "equipment_type": t.id,
            "owner_type": "company",
            "customer": c.id,
        }
    )
    assert s.is_valid() is False


@pytest.mark.django_db
def test_valid_customer_equipment():
    t = EquipmentType.objects.create(name="Bomba")
    c = Customer.objects.create(name="Agro SA")
    s = EquipmentSerializer(
        data={
            "name": "B1",
            "equipment_type": t.id,
            "owner_type": "customer",
            "customer": c.id,
        }
    )
    assert s.is_valid(), s.errors


@pytest.mark.django_db
def test_partial_update_keeps_owner_invariant():
    # Equipo de cliente existente; PATCH que intenta quitar el customer debe fallar.
    t = EquipmentType.objects.create(name="Bomba")
    c = Customer.objects.create(name="Agro SA")
    e = Equipment.objects.create(
        name="B1", equipment_type=t, owner_type="customer", customer=c
    )
    s = EquipmentSerializer(instance=e, data={"customer": None}, partial=True)
    assert s.is_valid() is False
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
docker compose run --rm backend pytest apps/equipment/tests/test_serializers.py -v
```
Expected: FAIL (no existe `apps.equipment.serializers`).

- [ ] **Step 3: Implementar `backend/apps/equipment/serializers.py`**

```python
from rest_framework import serializers

from .models import Equipment, EquipmentType


class EquipmentTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = EquipmentType
        fields = ("id", "name")


class EquipmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Equipment
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at")

    def validate(self, attrs):
        # En PATCH parcial attrs solo trae lo enviado; respaldo con la instancia.
        instance = self.instance
        owner_type = attrs.get(
            "owner_type",
            getattr(instance, "owner_type", None) if instance else None,
        )
        if "customer" in attrs:
            customer = attrs.get("customer")
        else:
            customer = getattr(instance, "customer", None) if instance else None

        if owner_type == "customer" and customer is None:
            raise serializers.ValidationError(
                "Un equipo de tipo propietario 'customer' requiere un cliente."
            )
        if owner_type == "company" and customer is not None:
            raise serializers.ValidationError(
                "Un equipo de la empresa ('company') no debe tener cliente."
            )
        return attrs
```

- [ ] **Step 4: Correr los tests**

```bash
docker compose run --rm backend pytest apps/equipment/tests/test_serializers.py -v
```
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/equipment
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: serializers de equipo con validación owner/customer

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: ViewSets, URLs y CRUD (búsqueda, filtros, soft-delete, tipos, service-history)

**Files:**
- Create: `backend/apps/equipment/views.py`
- Create: `backend/apps/equipment/urls.py`
- Create: `backend/apps/equipment/admin.py`
- Modify: `backend/config/urls.py`
- Create: `backend/apps/equipment/tests/test_api.py`

- [ ] **Step 1: Escribir `backend/apps/equipment/tests/test_api.py`**

```python
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.customers.models import Customer
from apps.equipment.models import Equipment, EquipmentType

User = get_user_model()


@pytest.fixture
def equipment_type(db):
    return EquipmentType.objects.create(name="Bomba")


@pytest.fixture
def admin_client(db):
    user = User.objects.create_user(
        email="admin@veragro.com", password="x", full_name="Admin", role="admin"
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.mark.django_db
def test_create_company_equipment(admin_client, equipment_type):
    resp = admin_client.post(
        "/api/equipment/",
        {"name": "Planta 1", "equipment_type": equipment_type.id, "owner_type": "company"},
        format="json",
    )
    assert resp.status_code == 201
    assert resp.data["name"] == "Planta 1"


@pytest.mark.django_db
def test_create_customer_equipment_requires_customer(admin_client, equipment_type):
    resp = admin_client.post(
        "/api/equipment/",
        {"name": "Bomba X", "equipment_type": equipment_type.id, "owner_type": "customer"},
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_search_by_serial(admin_client, equipment_type):
    Equipment.objects.create(name="Uno", equipment_type=equipment_type, owner_type="company", serial_number="SER-111")
    Equipment.objects.create(name="Dos", equipment_type=equipment_type, owner_type="company", serial_number="SER-222")
    resp = admin_client.get("/api/equipment/?search=111")
    names = [e["name"] for e in resp.data["results"]]
    assert names == ["Uno"]


@pytest.mark.django_db
def test_filter_by_status(admin_client, equipment_type):
    Equipment.objects.create(name="Activo", equipment_type=equipment_type, owner_type="company", status="active")
    Equipment.objects.create(name="Retirado", equipment_type=equipment_type, owner_type="company", status="retired")
    resp = admin_client.get("/api/equipment/?status=retired")
    names = [e["name"] for e in resp.data["results"]]
    assert names == ["Retirado"]


@pytest.mark.django_db
def test_filter_by_customer(admin_client, equipment_type):
    c = Customer.objects.create(name="Agro SA")
    Equipment.objects.create(name="DelCliente", equipment_type=equipment_type, owner_type="customer", customer=c)
    Equipment.objects.create(name="DeEmpresa", equipment_type=equipment_type, owner_type="company")
    resp = admin_client.get(f"/api/equipment/?customer={c.id}")
    names = [e["name"] for e in resp.data["results"]]
    assert names == ["DelCliente"]


@pytest.mark.django_db
def test_delete_is_soft_sets_retired(admin_client, equipment_type):
    e = Equipment.objects.create(name="Borrar", equipment_type=equipment_type, owner_type="company")
    resp = admin_client.delete(f"/api/equipment/{e.id}/")
    assert resp.status_code == 204
    e.refresh_from_db()
    assert e.status == "retired"


@pytest.mark.django_db
def test_types_endpoint_is_readonly(admin_client, equipment_type):
    resp = admin_client.get("/api/equipment/types/")
    assert resp.status_code == 200
    names = [t["name"] for t in resp.data]
    assert "Bomba" in names
    # POST no permitido en endpoint read-only
    resp_post = admin_client.post("/api/equipment/types/", {"name": "Nuevo"}, format="json")
    assert resp_post.status_code == 405


@pytest.mark.django_db
def test_service_history_returns_empty(admin_client, equipment_type):
    e = Equipment.objects.create(name="ConHist", equipment_type=equipment_type, owner_type="company")
    resp = admin_client.get(f"/api/equipment/{e.id}/service-history/")
    assert resp.status_code == 200
    assert resp.data == []


@pytest.mark.django_db
def test_requires_authentication(equipment_type):
    client = APIClient()
    resp = client.get("/api/equipment/")
    assert resp.status_code == 401


@pytest.mark.django_db
def test_readonly_role_cannot_create(equipment_type):
    user = User.objects.create_user(
        email="ro@veragro.com", password="x", full_name="RO", role="readonly"
    )
    client = APIClient()
    client.force_authenticate(user=user)
    resp = client.post(
        "/api/equipment/",
        {"name": "X", "equipment_type": equipment_type.id, "owner_type": "company"},
        format="json",
    )
    assert resp.status_code == 403


@pytest.mark.django_db
def test_technician_role_can_create(equipment_type):
    user = User.objects.create_user(
        email="tech@veragro.com", password="x", full_name="T", role="technician"
    )
    client = APIClient()
    client.force_authenticate(user=user)
    resp = client.post(
        "/api/equipment/",
        {"name": "X", "equipment_type": equipment_type.id, "owner_type": "company"},
        format="json",
    )
    assert resp.status_code == 201
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
docker compose run --rm backend pytest apps/equipment/tests/test_api.py -v
```
Expected: FAIL (rutas `/api/equipment/...` → 404).

- [ ] **Step 3: Crear `backend/apps/equipment/views.py`**

```python
from rest_framework import filters, mixins, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.permissions import RoleWriteOrReadOnly

from .models import Equipment, EquipmentType
from .serializers import EquipmentSerializer, EquipmentTypeSerializer


class EquipmentTypeViewSet(
    mixins.ListModelMixin, viewsets.GenericViewSet
):
    """Listado read-only de tipos de equipo activos (para selectores)."""

    serializer_class = EquipmentTypeSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        return EquipmentType.objects.filter(is_active=True)


class EquipmentViewSet(viewsets.ModelViewSet):
    serializer_class = EquipmentSerializer
    permission_classes = [
        RoleWriteOrReadOnly("admin", "technician", "sales", "inventory")
    ]
    filter_backends = [filters.SearchFilter]
    search_fields = ["name", "serial_number", "internal_code", "brand", "model"]

    def get_queryset(self):
        qs = Equipment.objects.all()
        params = self.request.query_params
        status_param = params.get("status")
        if status_param:
            qs = qs.filter(status=status_param)
        customer_param = params.get("customer")
        if customer_param:
            qs = qs.filter(customer_id=customer_param)
        type_param = params.get("equipment_type")
        if type_param:
            qs = qs.filter(equipment_type_id=type_param)
        return qs

    def perform_destroy(self, instance):
        instance.status = Equipment.Status.RETIRED
        instance.save(update_fields=["status", "updated_at"])

    @action(detail=True, methods=["get"], url_path="service-history")
    def service_history(self, request, pk=None):
        self.get_object()  # valida existencia / 404
        return Response([])  # TODO: conectar con módulo service_orders
```

Nota: el endpoint de tipos se registra en una ruta fija `types/`. Para que NO colisione con
el detalle `/api/equipment/{pk}/`, se registra explícitamente en `urls.py` (abajo) antes del
router de equipos, o con un prefijo de router distinto. Aquí usamos rutas separadas en el
router (ver Step 4): `equipment` y `equipment/types`. El orden importa: DRF DefaultRouter
ordena por registro; registrar `equipment/types` ANTES de `equipment` evita que `types` sea
interpretado como un `pk`.

- [ ] **Step 4: Crear `backend/apps/equipment/urls.py`**

```python
from rest_framework.routers import DefaultRouter

from .views import EquipmentTypeViewSet, EquipmentViewSet

router = DefaultRouter()
# Registrar 'equipment/types' ANTES de 'equipment' para que la ruta fija
# no sea capturada como /equipment/{pk}/.
router.register(r"equipment/types", EquipmentTypeViewSet, basename="equipment-type")
router.register(r"equipment", EquipmentViewSet, basename="equipment")

urlpatterns = router.urls
```

- [ ] **Step 5: Crear `backend/apps/equipment/admin.py`**

```python
from django.contrib import admin

from .models import Equipment, EquipmentType


@admin.register(EquipmentType)
class EquipmentTypeAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active")
    search_fields = ("name",)


@admin.register(Equipment)
class EquipmentAdmin(admin.ModelAdmin):
    list_display = ("name", "equipment_type", "owner_type", "customer", "status")
    list_filter = ("status", "owner_type", "equipment_type")
    search_fields = ("name", "serial_number", "internal_code", "brand", "model")
```

- [ ] **Step 6: Modificar `backend/config/urls.py` para incluir las rutas de equipos**

El archivo actual termina con:
```python
    path("api/auth/", include("apps.users.urls")),
    path("api/", include("apps.customers.urls")),
]
```
Añadir la línea de equipos justo después de customers, dejando:
```python
    path("api/auth/", include("apps.users.urls")),
    path("api/", include("apps.customers.urls")),
    path("api/", include("apps.equipment.urls")),
]
```
(Usar Edit; `include` ya está importado.)

- [ ] **Step 7: Correr los tests del módulo**

```bash
docker compose run --rm backend pytest apps/equipment -v
```
Expected: todos PASS (3 models + 1 seed + 4 serializers + 11 api = 19).

- [ ] **Step 8: Correr la suite completa y el check**

```bash
docker compose run --rm backend pytest -q
docker compose run --rm backend python manage.py check
docker compose run --rm backend python manage.py makemigrations --check --dry-run
```
Expected: 27 (fundación) + 3 (core RoleWriteOrReadOnly, Task 1) + 19 (equipos) = 49 passed;
check sin issues; "No changes detected".

- [ ] **Step 9: Commit**

```bash
git add backend/apps/equipment backend/config/urls.py
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: API de equipos (CRUD, búsqueda, filtros, soft-delete, tipos, historial)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Verificación integral del módulo

**Files:** ninguno (verificación end-to-end).

- [ ] **Step 1: Suite completa**

```bash
docker compose run --rm backend pytest -q
```
Expected: 49 passed.

- [ ] **Step 2: Levantar el stack y migrar (aplica el seed)**

```bash
docker compose up -d --build
docker compose exec backend python manage.py migrate
```
Expected: migraciones de equipment aplicadas (incluida la data migration).

- [ ] **Step 3: Verificar endpoint de tipos (requiere token admin existente o crear uno)**

Si no hay usuario, crearlo:
```bash
docker compose exec -e DJANGO_SUPERUSER_EMAIL=admin@veragro.com -e DJANGO_SUPERUSER_PASSWORD=Admin12345 -e DJANGO_SUPERUSER_FULL_NAME="Admin" backend python manage.py createsuperuser --noinput
```
(Si ya existe, omitir; el error "ya existe" es esperado.)

Login y listar tipos (Git Bash):
```bash
ACCESS=$(curl.exe -s -X POST http://localhost:8000/api/auth/login/ -H "Content-Type: application/json" -d '{"email":"admin@veragro.com","password":"Admin12345"}' | python -c "import sys,json;print(json.load(sys.stdin)['access'])")
curl.exe -s http://localhost:8000/api/equipment/types/ -H "Authorization: Bearer $ACCESS"
```
Expected: JSON con los 9 tipos.

- [ ] **Step 4: Crear equipo de empresa y de cliente, listar y soft-delete**

```bash
# Tomar un type id de la respuesta anterior (p.ej. el de "Bomba")
curl.exe -s -X POST http://localhost:8000/api/equipment/ -H "Authorization: Bearer $ACCESS" -H "Content-Type: application/json" -d '{"name":"Planta Empresa","equipment_type":1,"owner_type":"company"}'
curl.exe -s "http://localhost:8000/api/equipment/" -H "Authorization: Bearer $ACCESS"
```
Expected: creación 201; listado con el equipo. (Ajustar `equipment_type` a un id válido.)

- [ ] **Step 5: Confirmar OpenAPI**

Abrir `http://localhost:8000/api/docs/` y comprobar que aparecen
`/api/equipment/`, `/api/equipment/types/` y `/api/equipment/{id}/service-history/`.

- [ ] **Step 6: Commit final (si hubo ajustes)**

```bash
git add -A
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "chore: verificación integral del módulo de equipos

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Resultado esperado

- Tipos de equipo sembrados y listables read-only en `/api/equipment/types/`.
- CRUD de equipos con búsqueda, filtros (status/customer/equipment_type) y soft-delete vía
  `status=retired`.
- Validación owner/customer en create y PATCH parcial.
- Permisos por rol (`RoleWriteOrReadOnly`): `readonly` solo lee; admin/técnico/vendedor/
  inventario escriben.
- `service-history` placeholder responde `[]`.
- ~49 tests en verde; OpenAPI actualizado.

Cumple el spec `2026-06-02-modulo-equipos-design.md`. Deja la base para el módulo de
Inventario (siguiente sub-proyecto).
