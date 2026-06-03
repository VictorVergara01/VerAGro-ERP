# Módulo de Inventario Veragro ERP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el módulo de Inventario del ERP Veragro: categorías, productos (con stock read-only que solo cambia por movimientos), movimientos de inventario, ajustes manuales atómicos con guard de stock negativo, y endpoints de movimientos/low-stock/categorías.

**Architecture:** App `apps.inventory` siguiendo el patrón de `apps.customers`/`apps.equipment` (models → serializers → services → views → urls → tests). La lógica de stock vive en `services.py` (transacción atómica). Stock/reserved son read-only en el CRUD: todo cambio de stock pasa por un `InventoryMovement`. Reutiliza `RoleWriteOrReadOnly` de `apps.core` y `equipment.EquipmentType` (M2M). Sin dependencias nuevas.

**Tech Stack:** Python 3.12, Django 5.1, DRF, simplejwt, PostgreSQL, pytest-django, Docker Compose.

---

## Convenciones

- Todo en Docker: `docker compose up -d db redis` y `docker compose run --rm backend <cmd>`.
- Rama: `feat/modulo-inventario` (ya creada).
- Commits en español, cada uno con trailer:
  `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "...\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"`
- Base existente: `apps.core.models.TimeStampedModel`; `apps.core.permissions.RoleWriteOrReadOnly(*roles)`;
  `apps.equipment.models.EquipmentType`; `apps.users.models.User`. `config/urls.py` ya incluye
  admin, schema, docs, `api/auth/`, `api/` (customers) y `api/` (equipment). La app
  `apps.inventory` existe vacía (solo `__init__.py`, `apps.py`, `migrations/__init__.py`).
- IMPORTANTE: los nombres de categoría se eligen libremente en tests (no hay seed en inventario).

---

## Task 1: Modelos ProductCategory, Product e InventoryMovement

**Files:**
- Create: `backend/apps/inventory/models.py`
- Create: `backend/apps/inventory/tests/__init__.py`
- Create: `backend/apps/inventory/tests/test_models.py`

- [ ] **Step 1: Crear `backend/apps/inventory/tests/__init__.py`** (vacío)

- [ ] **Step 2: Escribir `backend/apps/inventory/tests/test_models.py`**

```python
from decimal import Decimal

import pytest

from apps.equipment.models import EquipmentType
from apps.inventory.models import InventoryMovement, Product, ProductCategory


@pytest.mark.django_db
def test_category_str():
    c = ProductCategory.objects.create(name="Hélices")
    assert str(c) == "Hélices"
    assert c.is_active is True


@pytest.mark.django_db
def test_product_available_quantity():
    p = Product.objects.create(
        sku="SKU-1", name="Hélice T50",
        stock_quantity=Decimal("10"), reserved_quantity=Decimal("3"),
    )
    assert p.available_quantity == Decimal("7")
    assert str(p) == "Hélice T50"
    assert p.is_active is True


@pytest.mark.django_db
def test_product_compatible_equipment_types_m2m():
    t = EquipmentType.objects.create(name="TipoTestInv")
    p = Product.objects.create(sku="SKU-2", name="Bomba X")
    p.compatible_equipment_types.add(t)
    assert list(p.compatible_equipment_types.all()) == [t]
    assert list(t.compatible_products.all()) == [p]


@pytest.mark.django_db
def test_inventory_movement_str():
    p = Product.objects.create(sku="SKU-3", name="Filtro")
    m = InventoryMovement.objects.create(
        product=p, movement_type="adjustment_in", quantity=Decimal("5")
    )
    assert "adjustment_in" in str(m)
    assert m.created_at is not None
```

- [ ] **Step 3: Ejecutar y verificar que falla**

```bash
docker compose up -d db redis
docker compose run --rm backend pytest apps/inventory/tests/test_models.py -v
```
Expected: FAIL (ModuleNotFoundError: apps.inventory.models).

- [ ] **Step 4: Implementar `backend/apps/inventory/models.py`**

```python
from django.db import models

from apps.core.models import TimeStampedModel


class ProductCategory(TimeStampedModel):
    name = models.CharField(max_length=100, unique=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("name",)
        verbose_name_plural = "Product categories"

    def __str__(self):
        return self.name


class Product(TimeStampedModel):
    sku = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    barcode = models.CharField(max_length=100, blank=True)
    category = models.ForeignKey(
        ProductCategory,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="products",
    )
    brand = models.CharField(max_length=100, blank=True)
    model = models.CharField(max_length=100, blank=True)
    unit_of_measure = models.CharField(max_length=50, blank=True)
    location = models.CharField(max_length=100, blank=True)
    compatible_equipment_types = models.ManyToManyField(
        "equipment.EquipmentType",
        blank=True,
        related_name="compatible_products",
    )
    compatible_models = models.TextField(blank=True)
    stock_quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    reserved_quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    minimum_stock = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    average_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    last_purchase_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    sale_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    default_margin_percentage = models.DecimalField(
        max_digits=12, decimal_places=2, default=0
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("name",)

    def __str__(self):
        return self.name

    @property
    def available_quantity(self):
        return self.stock_quantity - self.reserved_quantity


class InventoryMovement(TimeStampedModel):
    class MovementType(models.TextChoices):
        PURCHASE_IN = "purchase_in", "Entrada por compra"
        SERVICE_OUT = "service_out", "Salida por servicio"
        RESERVATION = "reservation", "Reserva"
        RESERVATION_RELEASE = "reservation_release", "Liberación de reserva"
        ADJUSTMENT_IN = "adjustment_in", "Ajuste positivo"
        ADJUSTMENT_OUT = "adjustment_out", "Ajuste negativo"
        RETURN_IN = "return_in", "Devolución"
        DAMAGED_OUT = "damaged_out", "Baja por daño"

    product = models.ForeignKey(
        Product, on_delete=models.PROTECT, related_name="movements"
    )
    movement_type = models.CharField(max_length=30, choices=MovementType.choices)
    quantity = models.DecimalField(max_digits=12, decimal_places=2)
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    reference_type = models.CharField(max_length=50, blank=True)
    reference_id = models.PositiveIntegerField(null=True, blank=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        "users.User", on_delete=models.SET_NULL, null=True, blank=True
    )

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.movement_type} {self.quantity} x {self.product}"
```

- [ ] **Step 5: Migraciones y tests**

```bash
docker compose run --rm backend python manage.py makemigrations inventory
docker compose run --rm backend pytest apps/inventory/tests/test_models.py -v
docker compose run --rm backend python manage.py check
```
Expected: migración `0001_initial.py` creada (committearla); 4 tests PASS; check sin issues.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/inventory
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: modelos ProductCategory, Product e InventoryMovement

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Servicio apply_adjustment

**Files:**
- Create: `backend/apps/inventory/services.py`
- Create: `backend/apps/inventory/tests/test_services.py`

- [ ] **Step 1: Escribir `backend/apps/inventory/tests/test_services.py`**

```python
from decimal import Decimal

import pytest
from rest_framework.exceptions import ValidationError

from apps.inventory.models import InventoryMovement, Product
from apps.inventory.services import apply_adjustment


@pytest.mark.django_db
def test_adjustment_in_increases_stock():
    p = Product.objects.create(sku="A1", name="P", stock_quantity=Decimal("5"))
    m = apply_adjustment(
        product=p, movement_type="adjustment_in", quantity=Decimal("3")
    )
    p.refresh_from_db()
    assert p.stock_quantity == Decimal("8")
    assert m.movement_type == "adjustment_in"
    assert InventoryMovement.objects.filter(product=p).count() == 1


@pytest.mark.django_db
def test_adjustment_out_decreases_stock():
    p = Product.objects.create(sku="A2", name="P", stock_quantity=Decimal("5"))
    apply_adjustment(product=p, movement_type="adjustment_out", quantity=Decimal("2"))
    p.refresh_from_db()
    assert p.stock_quantity == Decimal("3")


@pytest.mark.django_db
def test_adjustment_out_cannot_go_negative():
    p = Product.objects.create(sku="A3", name="P", stock_quantity=Decimal("1"))
    with pytest.raises(ValidationError):
        apply_adjustment(
            product=p, movement_type="adjustment_out", quantity=Decimal("5")
        )
    p.refresh_from_db()
    assert p.stock_quantity == Decimal("1")  # intacto
    assert InventoryMovement.objects.filter(product=p).count() == 0


@pytest.mark.django_db
def test_non_adjustment_type_rejected():
    p = Product.objects.create(sku="A4", name="P", stock_quantity=Decimal("1"))
    with pytest.raises(ValidationError):
        apply_adjustment(
            product=p, movement_type="purchase_in", quantity=Decimal("1")
        )


@pytest.mark.django_db
def test_non_positive_quantity_rejected():
    p = Product.objects.create(sku="A5", name="P", stock_quantity=Decimal("1"))
    with pytest.raises(ValidationError):
        apply_adjustment(
            product=p, movement_type="adjustment_in", quantity=Decimal("0")
        )
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
docker compose run --rm backend pytest apps/inventory/tests/test_services.py -v
```
Expected: FAIL (no existe apps.inventory.services).

- [ ] **Step 3: Implementar `backend/apps/inventory/services.py`**

```python
from decimal import Decimal

from django.db import transaction
from rest_framework.exceptions import ValidationError

from .models import InventoryMovement, Product

ADJUSTMENT_TYPES = {"adjustment_in", "adjustment_out"}


@transaction.atomic
def apply_adjustment(*, product, movement_type, quantity, unit_cost=0, notes="", user=None):
    """Aplica un ajuste manual de stock de forma atómica.

    Solo admite adjustment_in / adjustment_out. quantity debe ser > 0.
    adjustment_out no puede dejar el stock negativo. Crea el InventoryMovement
    y actualiza stock_quantity en la misma transacción.
    """
    if movement_type not in ADJUSTMENT_TYPES:
        raise ValidationError(
            {"movement_type": "Solo se permiten ajustes (adjustment_in/adjustment_out)."}
        )
    quantity = Decimal(quantity)
    if quantity <= 0:
        raise ValidationError({"quantity": "La cantidad debe ser mayor que cero."})

    locked = Product.objects.select_for_update().get(pk=product.pk)

    if movement_type == "adjustment_out":
        if quantity > locked.stock_quantity:
            raise ValidationError(
                {"quantity": "El ajuste dejaría el stock en negativo."}
            )
        locked.stock_quantity = locked.stock_quantity - quantity
    else:  # adjustment_in
        locked.stock_quantity = locked.stock_quantity + quantity

    locked.save(update_fields=["stock_quantity", "updated_at"])

    return InventoryMovement.objects.create(
        product=locked,
        movement_type=movement_type,
        quantity=quantity,
        unit_cost=unit_cost or 0,
        notes=notes or "",
        created_by=user,
    )
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
docker compose run --rm backend pytest apps/inventory/tests/test_services.py -v
```
Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/inventory
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: servicio apply_adjustment con guard de stock negativo

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Serializers

**Files:**
- Create: `backend/apps/inventory/serializers.py`
- Create: `backend/apps/inventory/tests/test_serializers.py`

- [ ] **Step 1: Escribir `backend/apps/inventory/tests/test_serializers.py`**

```python
from decimal import Decimal

import pytest

from apps.inventory.models import Product
from apps.inventory.serializers import AdjustmentSerializer, ProductSerializer


@pytest.mark.django_db
def test_product_serializer_exposes_available_quantity():
    p = Product.objects.create(
        sku="S1", name="P", stock_quantity=Decimal("10"), reserved_quantity=Decimal("4")
    )
    data = ProductSerializer(p).data
    assert Decimal(str(data["available_quantity"])) == Decimal("6")


@pytest.mark.django_db
def test_product_serializer_stock_is_read_only():
    s = ProductSerializer(
        data={"sku": "S2", "name": "P", "stock_quantity": "99"}
    )
    assert s.is_valid(), s.errors
    obj = s.save()
    assert obj.stock_quantity == Decimal("0")  # ignorado: read-only


@pytest.mark.django_db
def test_adjustment_serializer_rejects_non_adjustment_type():
    # El ChoiceField solo admite adjustment_in/out; purchase_in es inválido de entrada.
    p = Product.objects.create(sku="S3", name="P")
    s = AdjustmentSerializer(
        data={"product": p.id, "movement_type": "purchase_in", "quantity": "1"}
    )
    assert s.is_valid() is False
    assert "movement_type" in s.errors
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
docker compose run --rm backend pytest apps/inventory/tests/test_serializers.py -v
```
Expected: FAIL (no existe apps.inventory.serializers).

- [ ] **Step 3: Implementar `backend/apps/inventory/serializers.py`**

```python
from rest_framework import serializers

from .models import InventoryMovement, Product, ProductCategory
from .services import apply_adjustment


class ProductCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductCategory
        fields = ("id", "name")


class ProductSerializer(serializers.ModelSerializer):
    available_quantity = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True
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


class InventoryMovementSerializer(serializers.ModelSerializer):
    class Meta:
        model = InventoryMovement
        fields = (
            "id",
            "product",
            "movement_type",
            "quantity",
            "unit_cost",
            "reference_type",
            "reference_id",
            "notes",
            "created_by",
            "created_at",
        )


class AdjustmentSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    movement_type = serializers.ChoiceField(
        choices=["adjustment_in", "adjustment_out"]
    )
    quantity = serializers.DecimalField(max_digits=12, decimal_places=2)
    unit_cost = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, default=0
    )
    notes = serializers.CharField(required=False, allow_blank=True, default="")

    def create(self, validated_data):
        request = self.context.get("request")
        user = getattr(request, "user", None) if request else None
        return apply_adjustment(
            product=validated_data["product"],
            movement_type=validated_data["movement_type"],
            quantity=validated_data["quantity"],
            unit_cost=validated_data.get("unit_cost", 0),
            notes=validated_data.get("notes", ""),
            user=user,
        )

    def to_representation(self, instance):
        return InventoryMovementSerializer(instance).data
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
docker compose run --rm backend pytest apps/inventory/tests/test_serializers.py -v
```
Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/inventory
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: serializers de inventario (product, categoría, movimiento, ajuste)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Views, URLs, admin (CRUD, movements, adjustments, low-stock, categories)

**Files:**
- Create: `backend/apps/inventory/views.py`
- Create: `backend/apps/inventory/urls.py`
- Create: `backend/apps/inventory/admin.py`
- Modify: `backend/config/urls.py`
- Create: `backend/apps/inventory/tests/test_api.py`

- [ ] **Step 1: Escribir `backend/apps/inventory/tests/test_api.py`**

```python
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.inventory.models import InventoryMovement, Product, ProductCategory

User = get_user_model()


def _client(role):
    user = User.objects.create_user(
        email=f"{role}@veragro.com", password="x", full_name=role, role=role
    )
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture
def inv_client(db):
    return _client("inventory")


@pytest.mark.django_db
def test_create_product(inv_client):
    resp = inv_client.post(
        "/api/inventory/products/", {"sku": "P-1", "name": "Hélice"}, format="json"
    )
    assert resp.status_code == 201
    assert resp.data["sku"] == "P-1"


@pytest.mark.django_db
def test_stock_quantity_read_only_on_create(inv_client):
    resp = inv_client.post(
        "/api/inventory/products/",
        {"sku": "P-2", "name": "X", "stock_quantity": "50"},
        format="json",
    )
    assert resp.status_code == 201
    assert Decimal(str(resp.data["stock_quantity"])) == Decimal("0")


@pytest.mark.django_db
def test_search_by_sku(inv_client):
    Product.objects.create(sku="ABC-1", name="Uno")
    Product.objects.create(sku="XYZ-2", name="Dos")
    resp = inv_client.get("/api/inventory/products/?search=ABC")
    skus = [p["sku"] for p in resp.data["results"]]
    assert skus == ["ABC-1"]


@pytest.mark.django_db
def test_filter_by_category(inv_client):
    cat = ProductCategory.objects.create(name="Motores")
    Product.objects.create(sku="C-1", name="ConCat", category=cat)
    Product.objects.create(sku="C-2", name="SinCat")
    resp = inv_client.get(f"/api/inventory/products/?category={cat.id}")
    names = [p["name"] for p in resp.data["results"]]
    assert names == ["ConCat"]


@pytest.mark.django_db
def test_invalid_category_filter_returns_400(inv_client):
    resp = inv_client.get("/api/inventory/products/?category=abc")
    assert resp.status_code == 400


@pytest.mark.django_db
def test_soft_delete(inv_client):
    p = Product.objects.create(sku="D-1", name="Borrar")
    resp = inv_client.delete(f"/api/inventory/products/{p.id}/")
    assert resp.status_code == 204
    p.refresh_from_db()
    assert p.is_active is False


@pytest.mark.django_db
def test_list_excludes_inactive_by_default(inv_client):
    Product.objects.create(sku="L-1", name="Activo")
    Product.objects.create(sku="L-2", name="Inactivo", is_active=False)
    resp = inv_client.get("/api/inventory/products/")
    names = [p["name"] for p in resp.data["results"]]
    assert "Activo" in names and "Inactivo" not in names


@pytest.mark.django_db
def test_adjustment_endpoint_increases_stock(inv_client):
    p = Product.objects.create(sku="ADJ-1", name="P", stock_quantity=Decimal("2"))
    resp = inv_client.post(
        "/api/inventory/adjustments/",
        {"product": p.id, "movement_type": "adjustment_in", "quantity": "3"},
        format="json",
    )
    assert resp.status_code == 201
    p.refresh_from_db()
    assert p.stock_quantity == Decimal("5")
    assert InventoryMovement.objects.filter(product=p).count() == 1


@pytest.mark.django_db
def test_adjustment_out_insufficient_returns_400(inv_client):
    p = Product.objects.create(sku="ADJ-2", name="P", stock_quantity=Decimal("1"))
    resp = inv_client.post(
        "/api/inventory/adjustments/",
        {"product": p.id, "movement_type": "adjustment_out", "quantity": "5"},
        format="json",
    )
    assert resp.status_code == 400
    p.refresh_from_db()
    assert p.stock_quantity == Decimal("1")


@pytest.mark.django_db
def test_product_movements_list(inv_client):
    p = Product.objects.create(sku="MV-1", name="P", stock_quantity=Decimal("0"))
    inv_client.post(
        "/api/inventory/adjustments/",
        {"product": p.id, "movement_type": "adjustment_in", "quantity": "4"},
        format="json",
    )
    resp = inv_client.get(f"/api/inventory/products/{p.id}/movements/")
    assert resp.status_code == 200
    assert len(resp.data) == 1
    assert resp.data[0]["movement_type"] == "adjustment_in"


@pytest.mark.django_db
def test_low_stock(inv_client):
    Product.objects.create(sku="LS-1", name="Bajo", stock_quantity=Decimal("1"), minimum_stock=Decimal("5"))
    Product.objects.create(sku="LS-2", name="Ok", stock_quantity=Decimal("10"), minimum_stock=Decimal("5"))
    resp = inv_client.get("/api/inventory/low-stock/")
    names = [p["name"] for p in resp.data]
    assert "Bajo" in names and "Ok" not in names


@pytest.mark.django_db
def test_categories_readonly(inv_client):
    ProductCategory.objects.create(name="Consumibles")
    resp = inv_client.get("/api/inventory/categories/")
    assert resp.status_code == 200
    names = [c["name"] for c in resp.data]
    assert "Consumibles" in names
    resp_post = inv_client.post("/api/inventory/categories/", {"name": "Nueva"}, format="json")
    assert resp_post.status_code == 405


@pytest.mark.django_db
def test_requires_authentication():
    client = APIClient()
    resp = client.get("/api/inventory/products/")
    assert resp.status_code == 401


@pytest.mark.django_db
def test_technician_cannot_write():
    client = _client("technician")
    resp = client.post(
        "/api/inventory/products/", {"sku": "T-1", "name": "X"}, format="json"
    )
    assert resp.status_code == 403


@pytest.mark.django_db
def test_readonly_cannot_write():
    client = _client("readonly")
    resp = client.post(
        "/api/inventory/products/", {"sku": "R-1", "name": "X"}, format="json"
    )
    assert resp.status_code == 403
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
docker compose run --rm backend pytest apps/inventory/tests/test_api.py -v
```
Expected: FAIL (rutas 404).

- [ ] **Step 3: Crear `backend/apps/inventory/views.py`**

```python
from django.db.models import F
from rest_framework import filters, mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.generics import CreateAPIView, ListAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.permissions import RoleWriteOrReadOnly

from .models import Product, ProductCategory
from .serializers import (
    AdjustmentSerializer,
    InventoryMovementSerializer,
    ProductCategorySerializer,
    ProductSerializer,
)

InventoryWrite = RoleWriteOrReadOnly("admin", "inventory")


class ProductViewSet(viewsets.ModelViewSet):
    """CRUD de productos. stock/reserved son read-only: cambian vía ajustes/movimientos."""

    serializer_class = ProductSerializer
    permission_classes = [InventoryWrite]
    filter_backends = [filters.SearchFilter]
    search_fields = ["sku", "name", "barcode", "brand", "model"]

    def get_queryset(self):
        qs = Product.objects.all()
        params = self.request.query_params
        include_inactive = params.get("include_inactive", "")
        if include_inactive.lower() not in ("1", "true", "yes", "on"):
            qs = qs.filter(is_active=True)
        category = params.get("category")
        if category:
            try:
                qs = qs.filter(category_id=int(category))
            except (TypeError, ValueError):
                raise ValidationError({"category": "Debe ser un id numérico."})
        return qs

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active", "updated_at"])

    @action(detail=True, methods=["get"])
    def movements(self, request, pk=None):
        product = self.get_object()
        qs = product.movements.all()
        return Response(InventoryMovementSerializer(qs, many=True).data)


class AdjustmentCreateView(CreateAPIView):
    serializer_class = AdjustmentSerializer
    permission_classes = [InventoryWrite]


class LowStockListView(ListAPIView):
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        return (
            Product.objects.filter(is_active=True)
            .annotate(available=F("stock_quantity") - F("reserved_quantity"))
            .filter(available__lte=F("minimum_stock"))
        )


class CategoryViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = ProductCategorySerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        return ProductCategory.objects.filter(is_active=True)
```

- [ ] **Step 4: Crear `backend/apps/inventory/urls.py`**

```python
from django.urls import path
from rest_framework.routers import SimpleRouter

from .views import (
    AdjustmentCreateView,
    CategoryViewSet,
    LowStockListView,
    ProductViewSet,
)

router = SimpleRouter()
router.register(r"inventory/products", ProductViewSet, basename="product")
router.register(r"inventory/categories", CategoryViewSet, basename="product-category")

urlpatterns = [
    path("inventory/adjustments/", AdjustmentCreateView.as_view(), name="inventory-adjustment"),
    path("inventory/low-stock/", LowStockListView.as_view(), name="inventory-low-stock"),
] + router.urls
```

Nota de orden: las rutas fijas `inventory/adjustments/` e `inventory/low-stock/` van ANTES
de las del router para que no las capture `inventory/products/{pk}` (en realidad no colisionan
porque el prefijo es distinto, pero las declaramos primero por claridad).

- [ ] **Step 5: Crear `backend/apps/inventory/admin.py`**

```python
from django.contrib import admin

from .models import InventoryMovement, Product, ProductCategory


@admin.register(ProductCategory)
class ProductCategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active")
    search_fields = ("name",)


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("sku", "name", "category", "stock_quantity", "reserved_quantity", "is_active")
    list_filter = ("is_active", "category")
    search_fields = ("sku", "name", "barcode", "brand", "model")


@admin.register(InventoryMovement)
class InventoryMovementAdmin(admin.ModelAdmin):
    list_display = ("product", "movement_type", "quantity", "unit_cost", "created_at")
    list_filter = ("movement_type",)
    search_fields = ("product__sku", "product__name")
```

- [ ] **Step 6: Modificar `backend/config/urls.py`**

El archivo termina con:
```python
    path("api/", include("apps.customers.urls")),
    path("api/", include("apps.equipment.urls")),
]
```
Añadir inventory después de equipment, dejando:
```python
    path("api/", include("apps.customers.urls")),
    path("api/", include("apps.equipment.urls")),
    path("api/", include("apps.inventory.urls")),
]
```
(Usar Edit; `include` ya está importado.)

- [ ] **Step 7: Tests del módulo**

```bash
docker compose run --rm backend pytest apps/inventory -v
```
Expected: TODOS pasan (4 models + 5 services + 3 serializers + 15 api = 27).

- [ ] **Step 8: Suite completa + checks**

```bash
docker compose run --rm backend pytest -q
docker compose run --rm backend python manage.py check
docker compose run --rm backend python manage.py makemigrations --check --dry-run
```
Expected: 58 (previo) + 27 (inventario) = 85 passed; check sin issues; "No changes detected".
Reportar el conteo exacto observado.

- [ ] **Step 9: Commit**

```bash
git add backend/apps/inventory backend/config/urls.py
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: API de inventario (productos, ajustes, movimientos, low-stock, categorías)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Verificación integral

**Files:** ninguno (verificación end-to-end).

- [ ] **Step 1: Suite completa**

```bash
docker compose run --rm backend pytest -q
```
Expected: 85 passed.

- [ ] **Step 2: Levantar stack y migrar**

```bash
docker compose up -d --build
docker compose exec backend python manage.py migrate
```
Expected: migraciones de inventory aplicadas.

- [ ] **Step 3: Token admin (usuario ya existe de verificaciones previas)**

```bash
ACCESS=$(curl.exe -s -X POST http://localhost:8000/api/auth/login/ -H "Content-Type: application/json" -d '{"email":"admin@veragro.com","password":"Admin12345"}' | python -c "import sys,json;print(json.load(sys.stdin)['access'])")
```
(Si no existe el usuario, crearlo con createsuperuser --noinput y las env vars
DJANGO_SUPERUSER_EMAIL/PASSWORD/FULL_NAME como en módulos previos.)

- [ ] **Step 4: Crear categoría (admin), producto, y ajustar stock**

```bash
# Categoría se crea por admin de Django o shell; vía API categories es read-only.
docker compose exec backend python manage.py shell -c "from apps.inventory.models import ProductCategory; ProductCategory.objects.get_or_create(name='Hélices')"
curl.exe -s -X POST http://localhost:8000/api/inventory/products/ -H "Authorization: Bearer $ACCESS" -H "Content-Type: application/json" -d '{"sku":"HEL-T50","name":"Hélice T50","minimum_stock":"5"}'
# Ajuste de entrada:
PID=$(curl.exe -s "http://localhost:8000/api/inventory/products/?search=HEL-T50" -H "Authorization: Bearer $ACCESS" | python -c "import sys,json;print(json.load(sys.stdin)['results'][0]['id'])")
curl.exe -s -X POST http://localhost:8000/api/inventory/adjustments/ -H "Authorization: Bearer $ACCESS" -H "Content-Type: application/json" -d "{\"product\":$PID,\"movement_type\":\"adjustment_in\",\"quantity\":\"10\"}"
curl.exe -s "http://localhost:8000/api/inventory/products/$PID/movements/" -H "Authorization: Bearer $ACCESS"
```
Expected: producto 201; ajuste 201; movements lista con 1 entrada. El producto pasa a
stock 10; como minimum_stock=5, ya no aparece en low-stock.

- [ ] **Step 5: low-stock y categorías**

```bash
curl.exe -s "http://localhost:8000/api/inventory/low-stock/" -H "Authorization: Bearer $ACCESS"
curl.exe -s "http://localhost:8000/api/inventory/categories/" -H "Authorization: Bearer $ACCESS"
```
Expected: low-stock no incluye HEL-T50 (stock 10 ≥ 5); categories incluye "Hélices".

- [ ] **Step 6: OpenAPI**

Abrir `http://localhost:8000/api/docs/` y comprobar que aparecen
`/api/inventory/products/`, `/api/inventory/adjustments/`, `/api/inventory/low-stock/`,
`/api/inventory/categories/` y `/api/inventory/products/{id}/movements/`.

- [ ] **Step 7: Commit final (si hubo ajustes)**

```bash
git add -A
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "chore: verificación integral del módulo de inventario

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Resultado esperado

- CRUD de productos con búsqueda/filtros/soft-delete; stock/reserved no editables por CRUD.
- Ajustes atómicos que crean movimiento y actualizan stock, sin permitir negativo.
- `/movements/`, `/low-stock/`, `/categories/` operativos.
- Permisos por rol (admin/inventory escriben; resto lee).
- ~85 tests en verde; OpenAPI actualizado.

Cumple el spec `2026-06-02-modulo-inventario-design.md`. Deja la base para Proveedores
(añadirá Supplier y `Product.main_supplier`) y Compras (alimentará movimientos purchase_in).
