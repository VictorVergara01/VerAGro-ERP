# Catálogo técnico — Etapa 2: API

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exponer la capa de catálogo (Etapa 1) por REST: CRUD de modelos y componentes, árbol anidado, CRUD de compatibilidades, filtros de productos, campos de modelo/componente en la orden y sus piezas, validación estructurada vs manual en `add-part`, y los endpoints orientados a la orden (component-tree, compatible-products). Regenerar tipos OpenAPI.

**Architecture:** ViewSets DRF con `SimpleRouter` (patrón del repo), `RoleWriteOrReadOnly` con la matriz existente, soft-delete `is_active` para catálogo. El árbol se arma en memoria desde un `flat queryset` (una consulta por modelo, sin N+1). La validación de compatibilidad vive en el serializer/servicio backend (no solo en el frontend). Los campos nuevos de orden/pieza se añaden a los serializers existentes con `select_related`/`prefetch_related`.

**Tech Stack:** Django 5.1, DRF, PostgreSQL, drf-spectacular, openapi-typescript, pytest.

## Global Constraints

- Backend en Docker; tests: `docker compose exec backend pytest <ruta>` desde la raíz `C:\Users\victo\Proyectos\VerAgro-ERP`. Backend arriba: `docker compose up -d db backend`.
- Permisos con la matriz existente (`apps/core/roles.py`, `apps/core/permissions.py`): catálogo técnico (modelos, componentes) = `roles.LOOKUPS_WRITE`; compatibilidades = `roles.INVENTORY_WRITE`; piezas de orden = `roles.SERVICE_WRITE`. Lectura para cualquier autenticado.
- No romper filtros existentes de productos (`category`, `equipment_type`, `search`, `include_inactive`); combinar con AND y `.distinct()` en joins M2M/1-N.
- Modo manual heredado de `add-part` (sin `component`) debe seguir funcionando.
- Router de `equipment`: registrar `equipment/models` y `equipment/components` **ANTES** de `equipment` (si no, `equipment/{pk}` captura `models`/`components`). Igual que ya se hace con `equipment/types`.
- Rama `V3.0`. Commits en español, imperativo, footer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Spec: `docs/superpowers/specs/equipment-parts-catalog.md`. Modelos de la Etapa 1 ya existen y están migrados.

---

### Task 1: Serializers de catálogo + árbol + `EquipmentModelViewSet`

**Files:**
- Create: `backend/apps/equipment/catalog_serializers.py`
- Modify: `backend/apps/equipment/views.py`
- Modify: `backend/apps/equipment/urls.py`
- Create: `backend/apps/equipment/tests/test_catalog_api.py`

**Interfaces:**
- Produces: `EquipmentModelSerializer`, `EquipmentComponentSerializer` (plano, con `path`), función `serialize_component_tree(components)` (arma anidado desde flat), `EquipmentModelViewSet` con acción `component-tree`. Endpoints `GET/POST /api/equipment/models/`, `GET/PATCH/DELETE /api/equipment/models/{id}/` (DELETE soft), `GET /api/equipment/models/{id}/component-tree/`. Filtro lista `?equipment_type=`, `?include_inactive=`.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `backend/apps/equipment/tests/test_catalog_api.py`:

```python
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.equipment.models import EquipmentType, EquipmentModel, EquipmentComponent

User = get_user_model()


def _client(role):
    u = User.objects.create_user(email=f"{role}@v.com", password="x", full_name=role, role=role)
    c = APIClient()
    c.force_authenticate(user=u)
    return c


@pytest.fixture
def inv_client(db):
    return _client("inventory")


@pytest.fixture
def drone(db):
    t, _ = EquipmentType.objects.get_or_create(name="Drone agrícola")
    return t


@pytest.mark.django_db
def test_create_and_list_equipment_model(inv_client, drone):
    resp = inv_client.post(
        "/api/equipment/models/",
        {"equipment_type": drone.id, "brand": "DJI", "name": "DJI Agras T50", "model_code": "T50"},
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["equipment_type_name"] == "Drone agrícola"
    lst = inv_client.get("/api/equipment/models/")
    names = [m["name"] for m in lst.data]  # sin paginación
    assert "DJI Agras T50" in names


@pytest.mark.django_db
def test_equipment_model_soft_delete(inv_client, drone):
    m = EquipmentModel.objects.create(equipment_type=drone, brand="DJI", name="T50", model_code="T50")
    assert inv_client.delete(f"/api/equipment/models/{m.id}/").status_code == 204
    m.refresh_from_db()
    assert m.is_active is False
    assert "T50" not in [x["name"] for x in inv_client.get("/api/equipment/models/").data]


@pytest.mark.django_db
def test_component_tree_endpoint(inv_client, drone):
    m = EquipmentModel.objects.create(equipment_type=drone, brand="DJI", name="T50", model_code="T50")
    prop = EquipmentComponent.objects.create(equipment_model=m, code="propulsion", name="Sistema de propulsión", component_type="assembly", sort_order=0)
    arm = EquipmentComponent.objects.create(equipment_model=m, parent=prop, code="arm_m1", name="Brazo M1", component_type="assembly", sort_order=0)
    EquipmentComponent.objects.create(equipment_model=m, parent=arm, code="motor_m1", name="Motor", sort_order=0)
    resp = inv_client.get(f"/api/equipment/models/{m.id}/component-tree/")
    assert resp.status_code == 200
    assert len(resp.data) == 1
    root = resp.data[0]
    assert root["code"] == "propulsion"
    assert root["children"][0]["code"] == "arm_m1"
    assert root["children"][0]["children"][0]["code"] == "motor_m1"


@pytest.mark.django_db
def test_model_write_requires_role(drone):
    ro = _client("readonly")
    resp = ro.post(
        "/api/equipment/models/",
        {"equipment_type": drone.id, "brand": "DJI", "name": "T50", "model_code": "T50"},
        format="json",
    )
    assert resp.status_code == 403
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `docker compose exec backend pytest apps/equipment/tests/test_catalog_api.py -v`
Expected: FAIL (404 en las rutas — no existen aún).

- [ ] **Step 3: Crear los serializers y el helper de árbol**

Crear `backend/apps/equipment/catalog_serializers.py`:

```python
from collections import defaultdict

from rest_framework import serializers

from .models import EquipmentModel, EquipmentComponent


class EquipmentModelSerializer(serializers.ModelSerializer):
    equipment_type_name = serializers.CharField(
        source="equipment_type.name", read_only=True
    )

    class Meta:
        model = EquipmentModel
        fields = (
            "id",
            "equipment_type",
            "equipment_type_name",
            "brand",
            "name",
            "model_code",
            "revision",
            "description",
            "diagram_type",
            "diagram_file",
            "is_active",
        )
        read_only_fields = ("id",)


class EquipmentComponentSerializer(serializers.ModelSerializer):
    path = serializers.CharField(read_only=True)

    class Meta:
        model = EquipmentComponent
        fields = (
            "id",
            "equipment_model",
            "parent",
            "code",
            "name",
            "component_type",
            "diagram_key",
            "position",
            "description",
            "sort_order",
            "is_active",
            "path",
        )
        read_only_fields = ("id", "path")

    def validate(self, attrs):
        instance = self.instance
        model = attrs.get(
            "equipment_model",
            getattr(instance, "equipment_model", None) if instance else None,
        )
        parent = attrs.get(
            "parent", getattr(instance, "parent", None) if instance else None
        )
        if parent is not None and model is not None:
            if parent.equipment_model_id != model.id:
                raise serializers.ValidationError(
                    {"parent": "El padre debe pertenecer al mismo modelo técnico."}
                )
            # Evitar ciclos al reasignar padre en una edición.
            if instance is not None:
                ancestor, seen = parent, set()
                while ancestor is not None and ancestor.pk not in seen:
                    if ancestor.pk == instance.pk:
                        raise serializers.ValidationError(
                            {"parent": "Relación cíclica no permitida."}
                        )
                    seen.add(ancestor.pk)
                    ancestor = ancestor.parent
        return attrs


def serialize_component_tree(components):
    """Arma el árbol anidado desde un iterable plano de EquipmentComponent.

    Una sola consulta (el caller pasa la lista ya materializada), sin N+1.
    Respeta el orden del queryset (sort_order, name).
    """
    by_parent = defaultdict(list)
    for c in components:
        by_parent[c.parent_id].append(c)

    def node(c):
        return {
            "id": c.id,
            "code": c.code,
            "name": c.name,
            "component_type": c.component_type,
            "diagram_key": c.diagram_key,
            "position": c.position,
            "sort_order": c.sort_order,
            "children": [node(ch) for ch in by_parent[c.id]],
        }

    return [node(c) for c in by_parent[None]]
```

- [ ] **Step 4: Crear el viewset y registrar la ruta**

En `backend/apps/equipment/views.py`, agregar imports y el viewset:

```python
from .models import Equipment, EquipmentType, EquipmentModel, EquipmentComponent
from .catalog_serializers import (
    EquipmentModelSerializer,
    EquipmentComponentSerializer,
    serialize_component_tree,
)
```

Y al final del archivo:

```python
class EquipmentModelViewSet(viewsets.ModelViewSet):
    """CRUD de modelos técnicos. Lectura para todos; escritura admin/inventory.
    Sin paginación (alimenta selectores). Soft-delete vía is_active."""

    serializer_class = EquipmentModelSerializer
    permission_classes = [RoleWriteOrReadOnly(*roles.LOOKUPS_WRITE)]
    pagination_class = None

    def get_queryset(self):
        qs = EquipmentModel.objects.select_related("equipment_type")
        params = self.request.query_params
        if params.get("include_inactive", "").lower() not in ("1", "true", "yes", "on"):
            qs = qs.filter(is_active=True)
        etype = params.get("equipment_type")
        if etype:
            try:
                qs = qs.filter(equipment_type_id=int(etype))
            except (TypeError, ValueError):
                raise ValidationError({"equipment_type": "Debe ser un id numérico."})
        return qs

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active", "updated_at"])

    @action(detail=True, methods=["get"], url_path="component-tree")
    def component_tree(self, request, pk=None):
        model = self.get_object()
        components = model.components.filter(is_active=True)
        return Response(serialize_component_tree(components))
```

En `backend/apps/equipment/urls.py`, registrar ANTES de `equipment`:

```python
from .views import (
    EquipmentTypeViewSet,
    EquipmentViewSet,
    EquipmentModelViewSet,
)

router = SimpleRouter()
router.register(r"equipment/types", EquipmentTypeViewSet, basename="equipment-type")
router.register(r"equipment/models", EquipmentModelViewSet, basename="equipment-model")
router.register(r"equipment", EquipmentViewSet, basename="equipment")
```

- [ ] **Step 5: Correr los tests para verificar que pasan**

Run: `docker compose exec backend pytest apps/equipment/tests/test_catalog_api.py -v`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/apps/equipment/catalog_serializers.py backend/apps/equipment/views.py backend/apps/equipment/urls.py backend/apps/equipment/tests/test_catalog_api.py
git commit -m "feat(equipment): API de modelos técnicos con árbol de componentes

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `EquipmentComponentViewSet` (CRUD + filtros)

**Files:**
- Modify: `backend/apps/equipment/views.py`
- Modify: `backend/apps/equipment/urls.py`
- Modify: `backend/apps/equipment/tests/test_catalog_api.py`

**Interfaces:**
- Consumes: `EquipmentComponentSerializer` (Task 1).
- Produces: `EquipmentComponentViewSet`. Endpoints `GET/POST /api/equipment/components/`, `GET/PATCH/DELETE /api/equipment/components/{id}/` (DELETE soft). Filtros `?equipment_model=`, `?parent=`. Rechaza (400) padre de otro modelo vía serializer.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar a `backend/apps/equipment/tests/test_catalog_api.py`:

```python
@pytest.mark.django_db
def test_component_crud_and_filter(inv_client, drone):
    m = EquipmentModel.objects.create(equipment_type=drone, brand="DJI", name="T50", model_code="T50")
    root = inv_client.post(
        "/api/equipment/components/",
        {"equipment_model": m.id, "code": "propulsion", "name": "Propulsión", "component_type": "assembly"},
        format="json",
    )
    assert root.status_code == 201, root.data
    child = inv_client.post(
        "/api/equipment/components/",
        {"equipment_model": m.id, "parent": root.data["id"], "code": "motor", "name": "Motor"},
        format="json",
    )
    assert child.status_code == 201
    assert child.data["path"] == "Propulsión > Motor"
    # Filtro por modelo
    by_model = inv_client.get(f"/api/equipment/components/?equipment_model={m.id}")
    codes = [c["code"] for c in by_model.data]
    assert set(codes) == {"propulsion", "motor"}
    # Filtro por parent
    by_parent = inv_client.get(f"/api/equipment/components/?parent={root.data['id']}")
    assert [c["code"] for c in by_parent.data] == ["motor"]


@pytest.mark.django_db
def test_component_rejects_parent_of_other_model(inv_client, drone):
    m1 = EquipmentModel.objects.create(equipment_type=drone, brand="DJI", name="A", model_code="A")
    m2 = EquipmentModel.objects.create(equipment_type=drone, brand="DJI", name="B", model_code="B")
    p = EquipmentComponent.objects.create(equipment_model=m1, code="a", name="A")
    resp = inv_client.post(
        "/api/equipment/components/",
        {"equipment_model": m2.id, "parent": p.id, "code": "b", "name": "B"},
        format="json",
    )
    assert resp.status_code == 400
    assert "parent" in resp.data
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `docker compose exec backend pytest apps/equipment/tests/test_catalog_api.py -k component_crud -v`
Expected: FAIL (404).

- [ ] **Step 3: Crear el viewset y registrar la ruta**

En `backend/apps/equipment/views.py`, agregar:

```python
class EquipmentComponentViewSet(viewsets.ModelViewSet):
    """CRUD de componentes del árbol. Lectura para todos; escritura admin/inventory.
    Sin paginación (alimenta el árbol/selectores). Soft-delete vía is_active."""

    serializer_class = EquipmentComponentSerializer
    permission_classes = [RoleWriteOrReadOnly(*roles.LOOKUPS_WRITE)]
    pagination_class = None

    def get_queryset(self):
        qs = EquipmentComponent.objects.select_related("parent", "equipment_model")
        params = self.request.query_params
        if params.get("include_inactive", "").lower() not in ("1", "true", "yes", "on"):
            qs = qs.filter(is_active=True)
        model = params.get("equipment_model")
        if model:
            try:
                qs = qs.filter(equipment_model_id=int(model))
            except (TypeError, ValueError):
                raise ValidationError({"equipment_model": "Debe ser un id numérico."})
        parent = params.get("parent")
        if parent:
            try:
                qs = qs.filter(parent_id=int(parent))
            except (TypeError, ValueError):
                raise ValidationError({"parent": "Debe ser un id numérico."})
        return qs

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active", "updated_at"])
```

En `backend/apps/equipment/urls.py`, agregar el import `EquipmentComponentViewSet` y registrar (antes de `equipment`, junto a models):

```python
router.register(r"equipment/components", EquipmentComponentViewSet, basename="equipment-component")
```

- [ ] **Step 4: Correr los tests**

Run: `docker compose exec backend pytest apps/equipment/tests/test_catalog_api.py -v`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/equipment/views.py backend/apps/equipment/urls.py backend/apps/equipment/tests/test_catalog_api.py
git commit -m "feat(equipment): CRUD de componentes con filtros por modelo y padre

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: API de `ProductCompatibility`

**Files:**
- Modify: `backend/apps/inventory/serializers.py`
- Modify: `backend/apps/inventory/views.py`
- Modify: `backend/apps/inventory/urls.py`
- Create: `backend/apps/inventory/tests/test_compatibility_api.py`

**Interfaces:**
- Produces: `ProductCompatibilitySerializer` (con `component_name`, `component_code`, `component_path`, `equipment_model_name` de solo lectura; valida modelo↔componente), `ProductCompatibilityViewSet`. Endpoints `GET/POST /api/inventory/product-compatibilities/`, `GET/PATCH/DELETE /api/inventory/product-compatibilities/{id}/`. Filtros `?product=`, `?equipment_model=`, `?component=`.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `backend/apps/inventory/tests/test_compatibility_api.py`:

```python
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.equipment.models import EquipmentType, EquipmentModel, EquipmentComponent
from apps.inventory.models import Product, ProductCompatibility

User = get_user_model()


def _client(role):
    u = User.objects.create_user(email=f"{role}@v.com", password="x", full_name=role, role=role)
    c = APIClient()
    c.force_authenticate(user=u)
    return c


@pytest.fixture
def setup(db):
    inv = _client("inventory")
    t, _ = EquipmentType.objects.get_or_create(name="Drone agrícola")
    m = EquipmentModel.objects.create(equipment_type=t, brand="DJI", name="T50", model_code="T50")
    comp = EquipmentComponent.objects.create(equipment_model=m, code="motor_m1", name="Motor")
    prod = Product.objects.create(sku="MOT-1", name="Motor CW")
    return inv, m, comp, prod


@pytest.mark.django_db
def test_create_compatibility_exposes_paths(setup):
    inv, m, comp, prod = setup
    resp = inv.post(
        "/api/inventory/product-compatibilities/",
        {"product": prod.id, "equipment_model": m.id, "component": comp.id, "is_primary": True},
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["component_name"] == "Motor"
    assert resp.data["component_path"] == "Motor"
    assert resp.data["equipment_model_name"] == "T50"


@pytest.mark.django_db
def test_reject_component_of_other_model(setup):
    inv, m, comp, prod = setup
    other = EquipmentModel.objects.create(equipment_type=m.equipment_type, brand="DJI", name="D", model_code="D")
    resp = inv.post(
        "/api/inventory/product-compatibilities/",
        {"product": prod.id, "equipment_model": other.id, "component": comp.id},
        format="json",
    )
    assert resp.status_code == 400
    assert "component" in resp.data


@pytest.mark.django_db
def test_filter_compatibilities(setup):
    inv, m, comp, prod = setup
    ProductCompatibility.objects.create(product=prod, equipment_model=m, component=comp)
    assert len(inv.get(f"/api/inventory/product-compatibilities/?product={prod.id}").data["results"]) == 1
    assert len(inv.get(f"/api/inventory/product-compatibilities/?component={comp.id}").data["results"]) == 1
    assert len(inv.get(f"/api/inventory/product-compatibilities/?equipment_model={m.id}").data["results"]) == 1


@pytest.mark.django_db
def test_compatibility_write_requires_role(setup):
    _, m, comp, prod = setup
    ro = _client("readonly")
    resp = ro.post(
        "/api/inventory/product-compatibilities/",
        {"product": prod.id, "equipment_model": m.id, "component": comp.id},
        format="json",
    )
    assert resp.status_code == 403
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `docker compose exec backend pytest apps/inventory/tests/test_compatibility_api.py -v`
Expected: FAIL (404).

- [ ] **Step 3: Crear el serializer**

En `backend/apps/inventory/serializers.py`, agregar el import `ProductCompatibility` y al final:

```python
class ProductCompatibilitySerializer(serializers.ModelSerializer):
    component_name = serializers.CharField(source="component.name", read_only=True)
    component_code = serializers.CharField(source="component.code", read_only=True)
    component_path = serializers.CharField(source="component.path", read_only=True)
    equipment_model_name = serializers.CharField(
        source="equipment_model.name", read_only=True
    )

    class Meta:
        model = ProductCompatibility
        fields = (
            "id",
            "product",
            "equipment_model",
            "equipment_model_name",
            "component",
            "component_name",
            "component_code",
            "component_path",
            "is_primary",
            "notes",
        )
        read_only_fields = ("id",)

    def validate(self, attrs):
        instance = self.instance
        model = attrs.get(
            "equipment_model",
            getattr(instance, "equipment_model", None) if instance else None,
        )
        component = attrs.get(
            "component",
            getattr(instance, "component", None) if instance else None,
        )
        if (
            model is not None
            and component is not None
            and component.equipment_model_id != model.id
        ):
            raise serializers.ValidationError(
                {"component": "El componente no pertenece al modelo indicado."}
            )
        return attrs
```

- [ ] **Step 4: Crear el viewset y registrar la ruta**

En `backend/apps/inventory/views.py`, agregar imports (`ProductCompatibility`, `ProductCompatibilitySerializer`, `roles`) y el viewset:

```python
class ProductCompatibilityViewSet(viewsets.ModelViewSet):
    """CRUD de compatibilidades pieza↔modelo↔componente. Escritura admin/inventory."""

    serializer_class = ProductCompatibilitySerializer
    permission_classes = [RoleWriteOrReadOnly(*roles.INVENTORY_WRITE)]

    def get_queryset(self):
        qs = ProductCompatibility.objects.select_related(
            "product", "equipment_model", "component"
        )
        params = self.request.query_params
        for key, field in (
            ("product", "product_id"),
            ("equipment_model", "equipment_model_id"),
            ("component", "component_id"),
        ):
            value = params.get(key)
            if value:
                try:
                    qs = qs.filter(**{field: int(value)})
                except (TypeError, ValueError):
                    raise ValidationError({key: "Debe ser un id numérico."})
        return qs
```

(Verificar que `views.py` ya importe `viewsets`, `ValidationError` y `RoleWriteOrReadOnly`; el módulo ya usa `from apps.core.permissions import RoleWriteOrReadOnly` — si falta `from apps.core import roles`, agregarlo.)

En `backend/apps/inventory/urls.py`, agregar el import y registrar:

```python
router.register(
    r"inventory/product-compatibilities",
    ProductCompatibilityViewSet,
    basename="product-compatibility",
)
```

- [ ] **Step 5: Correr los tests**

Run: `docker compose exec backend pytest apps/inventory/tests/test_compatibility_api.py -v`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/apps/inventory/serializers.py backend/apps/inventory/views.py backend/apps/inventory/urls.py backend/apps/inventory/tests/test_compatibility_api.py
git commit -m "feat(inventory): API de compatibilidades pieza↔modelo↔componente

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Filtros de productos por modelo/componente/equipo

**Files:**
- Modify: `backend/apps/inventory/views.py` (`ProductViewSet.get_queryset`)
- Modify: `backend/apps/inventory/tests/test_api.py`

**Interfaces:**
- Consumes: `ProductCompatibility`, `equipment.Equipment`.
- Produces: `GET /api/inventory/products/` acepta `?equipment_model=`, `?component=`, `?compatible_with_equipment=` (id de unidad física → resuelve `catalog_model`), combinables (AND) con los filtros existentes; `.distinct()`.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `backend/apps/inventory/tests/test_api.py`:

```python
@pytest.mark.django_db
def test_filter_products_by_equipment_model_and_component(inv_client):
    from apps.equipment.models import EquipmentType, EquipmentModel, EquipmentComponent
    from apps.inventory.models import ProductCompatibility

    t, _ = EquipmentType.objects.get_or_create(name="Drone agrícola")
    m = EquipmentModel.objects.create(equipment_type=t, brand="DJI", name="T50", model_code="T50")
    c1 = EquipmentComponent.objects.create(equipment_model=m, code="motor_m1", name="Motor")
    c2 = EquipmentComponent.objects.create(equipment_model=m, code="prop_m1", name="Hélice")
    p_motor = Product.objects.create(sku="PM-1", name="Motor")
    p_prop = Product.objects.create(sku="PP-1", name="Hélice")
    Product.objects.create(sku="PX-1", name="Sin compat")
    ProductCompatibility.objects.create(product=p_motor, equipment_model=m, component=c1)
    ProductCompatibility.objects.create(product=p_prop, equipment_model=m, component=c2)

    by_model = inv_client.get(f"/api/inventory/products/?equipment_model={m.id}")
    assert sorted(p["name"] for p in by_model.data["results"]) == ["Hélice", "Motor"]

    by_comp = inv_client.get(f"/api/inventory/products/?component={c1.id}")
    assert [p["name"] for p in by_comp.data["results"]] == ["Motor"]


@pytest.mark.django_db
def test_filter_products_compatible_with_equipment(inv_client):
    from apps.customers.models import Customer
    from apps.equipment.models import EquipmentType, EquipmentModel, EquipmentComponent, Equipment
    from apps.inventory.models import ProductCompatibility

    t, _ = EquipmentType.objects.get_or_create(name="Drone agrícola")
    m = EquipmentModel.objects.create(equipment_type=t, brand="DJI", name="T50", model_code="T50")
    c1 = EquipmentComponent.objects.create(equipment_model=m, code="motor_m1", name="Motor")
    prod = Product.objects.create(sku="EM-1", name="Motor")
    ProductCompatibility.objects.create(product=prod, equipment_model=m, component=c1)
    cli = Customer.objects.create(name="C")
    eq = Equipment.objects.create(name="T50 físico", equipment_type=t, customer=cli, catalog_model=m)

    resp = inv_client.get(f"/api/inventory/products/?compatible_with_equipment={eq.id}")
    assert [p["name"] for p in resp.data["results"]] == ["Motor"]


@pytest.mark.django_db
def test_invalid_equipment_model_filter_returns_400(inv_client):
    assert inv_client.get("/api/inventory/products/?equipment_model=abc").status_code == 400
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `docker compose exec backend pytest apps/inventory/tests/test_api.py -k "equipment_model or compatible_with" -v`
Expected: FAIL (los filtros no existen; devuelven todo / no 400).

- [ ] **Step 3: Extender `ProductViewSet.get_queryset`**

En `backend/apps/inventory/views.py`, dentro de `ProductViewSet.get_queryset`, tras el bloque de `equipment_type` y antes de `return qs`, agregar:

```python
        equipment_model = params.get("equipment_model")
        if equipment_model:
            try:
                qs = qs.filter(
                    compatibilities__equipment_model_id=int(equipment_model)
                ).distinct()
            except (TypeError, ValueError):
                raise ValidationError({"equipment_model": "Debe ser un id numérico."})
        component = params.get("component")
        if component:
            try:
                qs = qs.filter(compatibilities__component_id=int(component)).distinct()
            except (TypeError, ValueError):
                raise ValidationError({"component": "Debe ser un id numérico."})
        compatible_with = params.get("compatible_with_equipment")
        if compatible_with:
            from apps.equipment.models import Equipment

            try:
                equipment = Equipment.objects.filter(id=int(compatible_with)).first()
            except (TypeError, ValueError):
                raise ValidationError(
                    {"compatible_with_equipment": "Debe ser un id numérico."}
                )
            model_id = equipment.catalog_model_id if equipment else None
            # Sin equipo o sin modelo técnico → sin resultados compatibles.
            qs = (
                qs.filter(compatibilities__equipment_model_id=model_id).distinct()
                if model_id
                else qs.none()
            )
        return qs
```

- [ ] **Step 4: Correr los tests**

Run: `docker compose exec backend pytest apps/inventory/tests/test_api.py -v`
Expected: PASS (todos — nuevos + existentes, sin romper `category`/`equipment_type`/`search`).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/inventory/views.py backend/apps/inventory/tests/test_api.py
git commit -m "feat(inventory): filtra productos por modelo, componente y equipo compatible

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Campos de modelo/componente en orden y piezas + validación estructurada

**Files:**
- Modify: `backend/apps/service_orders/serializers.py`
- Modify: `backend/apps/service_orders/views.py` (`ServiceOrderViewSet.get_queryset`)
- Create: `backend/apps/service_orders/tests/test_structured_parts.py`

**Interfaces:**
- Consumes: `ProductCompatibility`, `EquipmentComponent`.
- Produces:
  - `ServiceOrderSerializer` incluye `equipment_catalog_model` (int|null) y `equipment_catalog_model_name` (str|null).
  - `ServiceOrderPartSerializer` incluye `component` (escribible, opcional) y `component_name`/`component_code`/`component_path` (solo lectura); `validate()` aplica el **modo estructurado** (con `component`: exige equipo con `catalog_model`, componente del modelo, y `ProductCompatibility` existente → 400 claro si falla) y conserva el **modo manual** (sin `component`).

- [ ] **Step 1: Escribir los tests que fallan**

Crear `backend/apps/service_orders/tests/test_structured_parts.py`:

```python
import pytest
from decimal import Decimal
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.customers.models import Customer
from apps.equipment.models import EquipmentType, EquipmentModel, EquipmentComponent, Equipment
from apps.inventory.models import Product, ProductCompatibility
from apps.service_orders.models import ServiceOrder

User = get_user_model()


@pytest.fixture
def tech(db):
    u = User.objects.create_user(email="t@v.com", password="x", full_name="t", role="technician")
    c = APIClient()
    c.force_authenticate(user=u)
    return c


@pytest.fixture
def scenario(db):
    cli = Customer.objects.create(name="C")
    t, _ = EquipmentType.objects.get_or_create(name="Drone agrícola")
    m = EquipmentModel.objects.create(equipment_type=t, brand="DJI", name="DJI Agras T50", model_code="T50")
    comp = EquipmentComponent.objects.create(equipment_model=m, code="motor_m1", name="Motor")
    other_comp = EquipmentComponent.objects.create(equipment_model=m, code="prop_m1", name="Hélice")
    eq = Equipment.objects.create(name="T50 físico", equipment_type=t, customer=cli, catalog_model=m)
    prod = Product.objects.create(sku="MOT-1", name="Motor CW", sale_price=Decimal("450"))
    ProductCompatibility.objects.create(product=prod, equipment_model=m, component=comp)
    order = ServiceOrder.objects.create(customer=cli, equipment=eq)
    return cli, m, comp, other_comp, eq, prod, order


@pytest.mark.django_db
def test_order_exposes_catalog_model(tech, scenario):
    _, m, _, _, _, _, order = scenario
    resp = tech.get(f"/api/service-orders/{order.id}/")
    assert resp.data["equipment_catalog_model"] == m.id
    assert resp.data["equipment_catalog_model_name"] == "DJI Agras T50"


@pytest.mark.django_db
def test_add_structured_part_ok_saves_component(tech, scenario):
    _, _, comp, _, _, prod, order = scenario
    resp = tech.post(
        f"/api/service-orders/{order.id}/add-part/",
        {"product": prod.id, "component": comp.id, "quantity": "1"},
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["component"] == comp.id
    assert resp.data["component_name"] == "Motor"
    assert resp.data["component_path"] == "Motor"


@pytest.mark.django_db
def test_add_structured_part_incompatible_rejected(tech, scenario):
    _, _, _, other_comp, _, prod, order = scenario
    # prod es compatible con 'motor_m1', no con 'prop_m1'
    resp = tech.post(
        f"/api/service-orders/{order.id}/add-part/",
        {"product": prod.id, "component": other_comp.id, "quantity": "1"},
        format="json",
    )
    assert resp.status_code == 400
    assert "component" in resp.data


@pytest.mark.django_db
def test_add_manual_part_without_component_still_works(tech, scenario):
    cli = Customer.objects.create(name="Otro")
    order = ServiceOrder.objects.create(customer=cli)  # sin equipo
    prod = Product.objects.create(sku="X-1", name="Genérico")
    resp = tech.post(
        f"/api/service-orders/{order.id}/add-part/",
        {"product": prod.id, "quantity": "2"},
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["component"] is None


@pytest.mark.django_db
def test_structured_part_requires_catalog_model(tech, scenario):
    cli = Customer.objects.create(name="SinModelo")
    t, _ = EquipmentType.objects.get_or_create(name="Drone agrícola")
    eq = Equipment.objects.create(name="viejo", equipment_type=t, customer=cli)  # sin catalog_model
    order = ServiceOrder.objects.create(customer=cli, equipment=eq)
    _, m, comp, _, _, prod, _ = scenario
    resp = tech.post(
        f"/api/service-orders/{order.id}/add-part/",
        {"product": prod.id, "component": comp.id, "quantity": "1"},
        format="json",
    )
    assert resp.status_code == 400
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `docker compose exec backend pytest apps/service_orders/tests/test_structured_parts.py -v`
Expected: FAIL (KeyError equipment_catalog_model / component no aceptado / no valida).

- [ ] **Step 3: Extender los serializers**

En `backend/apps/service_orders/serializers.py`:

En `ServiceOrderPartSerializer`, agregar campos read-only tras `product_name`:

```python
    component_name = serializers.CharField(source="component.name", read_only=True, default=None)
    component_code = serializers.CharField(source="component.code", read_only=True, default=None)
    component_path = serializers.CharField(source="component.path", read_only=True, default=None)
```

Añadir `"component"`, `"component_name"`, `"component_code"`, `"component_path"` a `Meta.fields` (después de `"product_name"`). `component` es escribible (no lo pongas en `read_only_fields`).

Reemplazar el `validate` existente por:

```python
    def validate(self, attrs):
        # Defaults de costo/precio desde el producto si no se envían.
        product = attrs.get("product")
        if product is not None:
            attrs.setdefault("unit_cost", product.average_cost)
            attrs.setdefault("unit_price", product.sale_price)

        # Modo estructurado: si llega componente, validar compatibilidad en backend.
        component = attrs.get("component")
        if component is not None:
            from apps.inventory.models import ProductCompatibility

            order = attrs.get("service_order") or getattr(
                self.instance, "service_order", None
            )
            equipment = getattr(order, "equipment", None) if order else None
            if equipment is None:
                raise serializers.ValidationError(
                    {"component": "La orden no tiene equipo; no se puede usar el despiece."}
                )
            if equipment.catalog_model_id is None:
                raise serializers.ValidationError(
                    {"component": "El equipo no tiene un modelo técnico asignado."}
                )
            if component.equipment_model_id != equipment.catalog_model_id:
                raise serializers.ValidationError(
                    {"component": "El componente no pertenece al modelo del equipo."}
                )
            compatible = ProductCompatibility.objects.filter(
                product=product,
                equipment_model_id=equipment.catalog_model_id,
                component=component,
            ).exists()
            if not compatible:
                raise serializers.ValidationError(
                    {"component": "El producto no es compatible con este componente."}
                )
        return attrs
```

En `ServiceOrderSerializer`, agregar tras `equipment_name`:

```python
    equipment_catalog_model = serializers.IntegerField(
        source="equipment.catalog_model_id", read_only=True, allow_null=True
    )
    equipment_catalog_model_name = serializers.CharField(
        source="equipment.catalog_model.name", read_only=True, allow_null=True
    )
```

Y añadir `"equipment_catalog_model"`, `"equipment_catalog_model_name"` a `Meta.fields` (después de `"equipment_name"`).

- [ ] **Step 4: Evitar N+1 en la orden**

En `backend/apps/service_orders/views.py`, `ServiceOrderViewSet.get_queryset`, ampliar el `select_related`/`prefetch_related`:

```python
        qs = ServiceOrder.objects.select_related(
            "customer",
            "equipment",
            "equipment__equipment_type",
            "equipment__catalog_model",
            "technician",
        ).prefetch_related("parts__product", "parts__component")
```

- [ ] **Step 5: Correr los tests**

Run: `docker compose exec backend pytest apps/service_orders/tests/test_structured_parts.py -v`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/apps/service_orders/serializers.py backend/apps/service_orders/views.py backend/apps/service_orders/tests/test_structured_parts.py
git commit -m "feat(service-orders): componente en piezas con validación estructurada de compatibilidad

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Endpoints de orden — `component-tree` y `compatible-products`

**Files:**
- Modify: `backend/apps/service_orders/views.py` (`ServiceOrderViewSet`)
- Modify: `backend/apps/service_orders/tests/test_structured_parts.py`

**Interfaces:**
- Consumes: `serialize_component_tree` (equipment.catalog_serializers), `ProductCompatibility`, `EquipmentComponent`.
- Produces:
  - `GET /api/service-orders/{id}/component-tree/` → árbol del `catalog_model` del equipo; 400 claro si no hay equipo o no hay `catalog_model`.
  - `GET /api/service-orders/{id}/compatible-products/?component=25` → `{equipment_model:{id,name}, component:{id,name,path}, products:[{id,sku,name,stock_quantity,reserved_quantity,available_quantity,sale_price,location,is_primary}]}`.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar a `backend/apps/service_orders/tests/test_structured_parts.py`:

```python
@pytest.mark.django_db
def test_order_component_tree(tech, scenario):
    _, m, comp, other_comp, _, _, order = scenario
    resp = tech.get(f"/api/service-orders/{order.id}/component-tree/")
    assert resp.status_code == 200
    codes = {n["code"] for n in resp.data}
    assert {"motor_m1", "prop_m1"} <= codes


@pytest.mark.django_db
def test_order_component_tree_without_catalog_model_400(tech):
    cli = Customer.objects.create(name="C")
    order = ServiceOrder.objects.create(customer=cli)  # sin equipo
    resp = tech.get(f"/api/service-orders/{order.id}/component-tree/")
    assert resp.status_code == 400


@pytest.mark.django_db
def test_order_compatible_products(tech, scenario):
    _, m, comp, _, _, prod, order = scenario
    resp = tech.get(f"/api/service-orders/{order.id}/compatible-products/?component={comp.id}")
    assert resp.status_code == 200
    assert resp.data["equipment_model"]["id"] == m.id
    assert resp.data["component"]["path"] == "Motor"
    assert [p["sku"] for p in resp.data["products"]] == ["MOT-1"]
    assert resp.data["products"][0]["available_quantity"] is not None
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `docker compose exec backend pytest apps/service_orders/tests/test_structured_parts.py -k "tree or compatible" -v`
Expected: FAIL (404).

- [ ] **Step 3: Implementar las acciones**

En `backend/apps/service_orders/views.py`, dentro de `ServiceOrderViewSet`, agregar (con `from rest_framework.exceptions import ValidationError` ya importado):

```python
    @action(detail=True, methods=["get"], url_path="component-tree")
    def component_tree(self, request, pk=None):
        from apps.equipment.catalog_serializers import serialize_component_tree

        order = self.get_object()
        equipment = order.equipment
        model = getattr(equipment, "catalog_model", None) if equipment else None
        if model is None:
            raise ValidationError(
                {"detail": "El equipo de la orden no tiene un modelo técnico asignado."}
            )
        components = model.components.filter(is_active=True)
        return Response(serialize_component_tree(components))

    @action(detail=True, methods=["get"], url_path="compatible-products")
    def compatible_products(self, request, pk=None):
        from apps.equipment.models import EquipmentComponent
        from apps.inventory.models import ProductCompatibility

        order = self.get_object()
        equipment = order.equipment
        model = getattr(equipment, "catalog_model", None) if equipment else None
        if model is None:
            raise ValidationError(
                {"detail": "El equipo de la orden no tiene un modelo técnico asignado."}
            )
        component_id = _int_param(request.query_params, "component")
        if component_id is None:
            raise ValidationError({"component": "Este parámetro es obligatorio."})
        try:
            component = model.components.get(id=component_id)
        except EquipmentComponent.DoesNotExist:
            raise ValidationError(
                {"component": "El componente no pertenece al modelo del equipo."}
            )
        compat = (
            ProductCompatibility.objects.filter(
                equipment_model=model, component=component, product__is_active=True
            )
            .select_related("product")
        )
        products = [
            {
                "id": c.product.id,
                "sku": c.product.sku,
                "name": c.product.name,
                "stock_quantity": str(c.product.stock_quantity),
                "reserved_quantity": str(c.product.reserved_quantity),
                "available_quantity": str(c.product.available_quantity),
                "sale_price": str(c.product.sale_price),
                "location": c.product.location,
                "is_primary": c.is_primary,
            }
            for c in compat
        ]
        return Response(
            {
                "equipment_model": {"id": model.id, "name": model.name},
                "component": {
                    "id": component.id,
                    "name": component.name,
                    "path": component.path,
                },
                "products": products,
            }
        )
```

- [ ] **Step 4: Correr los tests**

Run: `docker compose exec backend pytest apps/service_orders/tests/test_structured_parts.py -v`
Expected: PASS (todos, incl. los 3 nuevos).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/service_orders/views.py backend/apps/service_orders/tests/test_structured_parts.py
git commit -m "feat(service-orders): endpoints component-tree y compatible-products en la orden

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Regenerar tipos OpenAPI

**Files:**
- Modify: `frontend/src/lib/api/schema.d.ts` (generado)

**Interfaces:**
- Consumes: todos los endpoints/serializers de Tasks 1–6 mergeados en el backend.
- Produces: schema regenerado con los CRUD de modelos/componentes/compatibilidades y los campos nuevos de orden/pieza.

- [ ] **Step 1: Asegurar backend actualizado**

Run: `docker compose up -d backend && docker compose restart backend`
(en Windows el bind-mount no siempre recarga solo).

- [ ] **Step 2: Regenerar los tipos**

Run: `docker compose exec frontend npx openapi-typescript http://backend:8000/api/schema/ -o src/lib/api/schema.d.ts`
Expected: escribe `schema.d.ts` sin errores.

- [ ] **Step 3: Verificar campos nuevos**

Run: `docker compose exec frontend grep -n "equipment_catalog_model\|component_path\|product-compatibilities\|component-tree" src/lib/api/schema.d.ts`
Expected: coincidencias (paths y campos nuevos presentes).

- [ ] **Step 4: Typecheck del frontend**

Run: `docker compose exec frontend npm run typecheck`
Expected: PASS (la regeneración no debe romper el frontend existente).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api/schema.d.ts
git commit -m "chore(api): regenera tipos OpenAPI con catálogo técnico y despiece

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Verificación de regresión de la Etapa 2

**Files:** ninguno (verificación).

- [ ] **Step 1: Suites afectadas completas**

Run: `docker compose exec backend pytest apps/equipment apps/inventory apps/service_orders -q`
Expected: PASS (todas — nuevas + existentes; el modo manual y las reservas/consumo no cambian).

- [ ] **Step 2: Migraciones al día**

Run: `docker compose exec backend python manage.py makemigrations --check --dry-run`
Expected: "No changes detected" (esta etapa no toca modelos).

Si algo falla, reportar antes de cerrar la etapa.

## Notas / decisiones

- **Serializers de catálogo en archivo aparte** (`catalog_serializers.py`) para no engrosar `equipment/serializers.py` y mantener cohesión; `service_orders` reutiliza `serialize_component_tree` importándolo.
- **`compatible_products` construye el payload a mano** (no un ModelSerializer) porque la respuesta es un objeto compuesto con `available_quantity` (propiedad) — igual criterio que otros endpoints custom del repo (movimientos de inventario).
- **`compatible_with_equipment` sin modelo técnico → `qs.none()`** (sin resultados), coherente con "el equipo no tiene modelo técnico".
- La validación estructurada vive en `ServiceOrderPartSerializer.validate` para cubrir tanto `add-part` como el CRUD de piezas.
- Sin cambios de modelo → sin migraciones nuevas en esta etapa.
