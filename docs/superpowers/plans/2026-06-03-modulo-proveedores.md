# Módulo de Proveedores Veragro ERP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el módulo de Proveedores del ERP Veragro: modelo Supplier, relación SupplierProduct (con consulta directa e inversa, marcar preferido, sin duplicados), el campo Product.main_supplier en inventario, y la API correspondiente.

**Architecture:** App `apps.suppliers` siguiendo el patrón de los módulos previos (models → serializers → views → urls → tests). Reutiliza `RoleWriteOrReadOnly("admin","inventory")` de `apps.core`. Relación SupplierProduct con unique_together. Se añade `Product.main_supplier` (FK) en `apps.inventory` en una migración separada para respetar el orden inventory→suppliers→inventory. Sin dependencias nuevas.

**Tech Stack:** Python 3.12, Django 5.1, DRF, simplejwt, PostgreSQL, pytest-django, Docker Compose.

---

## Convenciones

- Todo en Docker: `docker compose up -d db redis` y `docker compose run --rm backend <cmd>`.
- Rama: `feat/modulo-proveedores` (ya creada).
- Commits en español con trailer:
  `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "...\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"`
- Base existente: `apps.core.models.TimeStampedModel`; `apps.core.permissions.RoleWriteOrReadOnly(*roles)`;
  `apps.inventory.models.Product`. `config/urls.py` incluye admin, schema, docs, `api/auth/`,
  y `api/` para customers, equipment, inventory. La app `apps.suppliers` existe vacía
  (`__init__.py`, `apps.py`, `migrations/__init__.py`).

---

## Task 1: Modelos Supplier y SupplierProduct

**Files:**
- Create: `backend/apps/suppliers/models.py`
- Create: `backend/apps/suppliers/tests/__init__.py`
- Create: `backend/apps/suppliers/tests/test_models.py`

- [ ] **Step 1: Crear `backend/apps/suppliers/tests/__init__.py`** (vacío)

- [ ] **Step 2: Escribir `backend/apps/suppliers/tests/test_models.py`**

```python
from decimal import Decimal

import pytest
from django.db import IntegrityError

from apps.inventory.models import Product
from apps.suppliers.models import Supplier, SupplierProduct


@pytest.mark.django_db
def test_supplier_str_and_default_active():
    s = Supplier.objects.create(name="Proveedor Uno")
    assert str(s) == "Proveedor Uno"
    assert s.is_active is True


@pytest.mark.django_db
def test_supplier_product_defaults():
    s = Supplier.objects.create(name="S")
    p = Product.objects.create(sku="SP-1", name="Pieza")
    sp = SupplierProduct.objects.create(supplier=s, product=p)
    assert sp.currency == "USD"
    assert sp.is_preferred is False
    assert sp.last_cost == Decimal("0")


@pytest.mark.django_db
def test_supplier_product_unique_together():
    s = Supplier.objects.create(name="S")
    p = Product.objects.create(sku="SP-2", name="Pieza")
    SupplierProduct.objects.create(supplier=s, product=p)
    with pytest.raises(IntegrityError):
        SupplierProduct.objects.create(supplier=s, product=p)
```

- [ ] **Step 3: Ejecutar y verificar que falla**

```bash
docker compose up -d db redis
docker compose run --rm backend pytest apps/suppliers/tests/test_models.py -v
```
Expected: FAIL (ModuleNotFoundError: apps.suppliers.models).

- [ ] **Step 4: Implementar `backend/apps/suppliers/models.py`**

```python
from django.db import models

from apps.core.models import TimeStampedModel


class Supplier(TimeStampedModel):
    name = models.CharField(max_length=255)
    legal_name = models.CharField(max_length=255, blank=True)
    country = models.CharField(max_length=100, blank=True)
    phone = models.CharField(max_length=50, blank=True)
    whatsapp = models.CharField(max_length=50, blank=True)
    email = models.EmailField(blank=True)
    website = models.URLField(blank=True)
    contact_person = models.CharField(max_length=255, blank=True)
    address = models.TextField(blank=True)
    estimated_delivery_days = models.PositiveIntegerField(null=True, blank=True)
    payment_terms = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("name",)

    def __str__(self):
        return self.name


class SupplierProduct(TimeStampedModel):
    supplier = models.ForeignKey(
        Supplier, on_delete=models.CASCADE, related_name="supplier_products"
    )
    product = models.ForeignKey(
        "inventory.Product",
        on_delete=models.CASCADE,
        related_name="supplier_products",
    )
    supplier_sku = models.CharField(max_length=100, blank=True)
    last_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    currency = models.CharField(max_length=10, default="USD")
    minimum_order_quantity = models.DecimalField(
        max_digits=12, decimal_places=2, default=0
    )
    estimated_delivery_days = models.PositiveIntegerField(null=True, blank=True)
    is_preferred = models.BooleanField(default=False)
    notes = models.TextField(blank=True)

    class Meta:
        unique_together = (("supplier", "product"),)
        ordering = ("supplier_id", "product_id")

    def __str__(self):
        return f"{self.supplier} · {self.product}"
```

- [ ] **Step 5: Migraciones y tests**

```bash
docker compose run --rm backend python manage.py makemigrations suppliers
docker compose run --rm backend pytest apps/suppliers/tests/test_models.py -v
docker compose run --rm backend python manage.py check
```
Expected: migración `suppliers/0001_initial.py` creada (committearla); 3 tests PASS; check sin issues.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/suppliers
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: modelos Supplier y SupplierProduct

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Campo Product.main_supplier (inventario)

**Files:**
- Modify: `backend/apps/inventory/models.py`
- Create: `backend/apps/inventory/tests/test_main_supplier.py`
- (Se generará una nueva migración en `backend/apps/inventory/migrations/`)

- [ ] **Step 1: Escribir `backend/apps/inventory/tests/test_main_supplier.py`**

```python
import pytest

from apps.inventory.models import Product
from apps.suppliers.models import Supplier


@pytest.mark.django_db
def test_product_main_supplier_assignable():
    s = Supplier.objects.create(name="Prov Principal")
    p = Product.objects.create(sku="MS-1", name="Pieza")
    p.main_supplier = s
    p.save(update_fields=["main_supplier"])
    p.refresh_from_db()
    assert p.main_supplier == s
    assert list(s.main_for_products.all()) == [p]


@pytest.mark.django_db
def test_product_main_supplier_set_null_on_supplier_delete():
    s = Supplier.objects.create(name="Prov")
    p = Product.objects.create(sku="MS-2", name="Pieza", main_supplier=s)
    s.delete()  # hard delete
    p.refresh_from_db()
    assert p.main_supplier is None  # SET_NULL
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
docker compose run --rm backend pytest apps/inventory/tests/test_main_supplier.py -v
```
Expected: FAIL (Product no tiene atributo main_supplier).

- [ ] **Step 3: Modificar `backend/apps/inventory/models.py`**

En el modelo `Product`, añadir el campo `main_supplier` justo DESPUÉS del campo
`is_active = models.BooleanField(default=True)` (antes de `class Meta`):

```python
    main_supplier = models.ForeignKey(
        "suppliers.Supplier",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="main_for_products",
    )
```

- [ ] **Step 4: Generar la migración de inventario y correr tests**

```bash
docker compose run --rm backend python manage.py makemigrations inventory
docker compose run --rm backend pytest apps/inventory/tests/test_main_supplier.py -v
docker compose run --rm backend python manage.py check
```
Expected: nueva migración `inventory/000X_product_main_supplier.py` (depende de suppliers.0001);
2 tests PASS; check sin issues. Committear la migración.

- [ ] **Step 5: Verificar que no se rompió el resto de inventario**

```bash
docker compose run --rm backend pytest apps/inventory -q
```
Expected: todos los tests de inventario siguen verdes.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/inventory
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: campo Product.main_supplier (FK a Supplier)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Serializers

**Files:**
- Create: `backend/apps/suppliers/serializers.py`
- Create: `backend/apps/suppliers/tests/test_serializers.py`

- [ ] **Step 1: Escribir `backend/apps/suppliers/tests/test_serializers.py`**

```python
import pytest

from apps.inventory.models import Product
from apps.suppliers.models import Supplier, SupplierProduct
from apps.suppliers.serializers import (
    SupplierProductSerializer,
    SupplierSerializer,
)


@pytest.mark.django_db
def test_supplier_serializer_roundtrip():
    s = SupplierSerializer(data={"name": "Prov X", "email": "a@b.com"})
    assert s.is_valid(), s.errors
    obj = s.save()
    assert obj.name == "Prov X"


@pytest.mark.django_db
def test_supplier_product_serializer_exposes_readonly_names():
    s = Supplier.objects.create(name="ProvName")
    p = Product.objects.create(sku="SER-1", name="PieceName")
    sp = SupplierProduct.objects.create(supplier=s, product=p)
    data = SupplierProductSerializer(sp).data
    assert data["product_sku"] == "SER-1"
    assert data["supplier_name"] == "ProvName"


@pytest.mark.django_db
def test_supplier_product_serializer_duplicate_rejected():
    s = Supplier.objects.create(name="S")
    p = Product.objects.create(sku="SER-2", name="P")
    SupplierProduct.objects.create(supplier=s, product=p)
    ser = SupplierProductSerializer(
        data={"supplier": s.id, "product": p.id}
    )
    assert ser.is_valid() is False  # UniqueTogetherValidator
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
docker compose run --rm backend pytest apps/suppliers/tests/test_serializers.py -v
```
Expected: FAIL (no existe apps.suppliers.serializers).

- [ ] **Step 3: Implementar `backend/apps/suppliers/serializers.py`**

```python
from rest_framework import serializers

from .models import Supplier, SupplierProduct


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at")


class SupplierProductSerializer(serializers.ModelSerializer):
    product_sku = serializers.CharField(source="product.sku", read_only=True)
    supplier_name = serializers.CharField(source="supplier.name", read_only=True)

    class Meta:
        model = SupplierProduct
        fields = (
            "id",
            "supplier",
            "product",
            "supplier_sku",
            "last_cost",
            "currency",
            "minimum_order_quantity",
            "estimated_delivery_days",
            "is_preferred",
            "notes",
            "product_sku",
            "supplier_name",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")
```

Nota: DRF añade automáticamente un `UniqueTogetherValidator` para (supplier, product) por la
restricción `unique_together` del modelo, por lo que un duplicado falla la validación.

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
docker compose run --rm backend pytest apps/suppliers/tests/test_serializers.py -v
```
Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/suppliers
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: serializers de proveedores y relación proveedor-producto

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Views, URLs, admin

**Files:**
- Create: `backend/apps/suppliers/views.py`
- Create: `backend/apps/suppliers/urls.py`
- Create: `backend/apps/suppliers/admin.py`
- Modify: `backend/config/urls.py`
- Create: `backend/apps/suppliers/tests/test_api.py`

- [ ] **Step 1: Escribir `backend/apps/suppliers/tests/test_api.py`**

```python
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.inventory.models import Product
from apps.suppliers.models import Supplier, SupplierProduct

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
def test_create_supplier(inv_client):
    resp = inv_client.post(
        "/api/suppliers/", {"name": "Prov Uno"}, format="json"
    )
    assert resp.status_code == 201
    assert resp.data["name"] == "Prov Uno"


@pytest.mark.django_db
def test_search_supplier_by_name(inv_client):
    Supplier.objects.create(name="DronesPanama")
    Supplier.objects.create(name="Otro")
    resp = inv_client.get("/api/suppliers/?search=Drones")
    names = [s["name"] for s in resp.data["results"]]
    assert names == ["DronesPanama"]


@pytest.mark.django_db
def test_soft_delete_supplier(inv_client):
    s = Supplier.objects.create(name="Borrar")
    resp = inv_client.delete(f"/api/suppliers/{s.id}/")
    assert resp.status_code == 204
    s.refresh_from_db()
    assert s.is_active is False


@pytest.mark.django_db
def test_list_excludes_inactive(inv_client):
    Supplier.objects.create(name="Activo")
    Supplier.objects.create(name="Inactivo", is_active=False)
    resp = inv_client.get("/api/suppliers/")
    names = [s["name"] for s in resp.data["results"]]
    assert "Activo" in names and "Inactivo" not in names


@pytest.mark.django_db
def test_nested_products_get_and_post(inv_client):
    s = Supplier.objects.create(name="S")
    p = Product.objects.create(sku="N-1", name="Pieza")
    # POST crea la relación con supplier desde la URL
    resp = inv_client.post(
        f"/api/suppliers/{s.id}/products/",
        {"product": p.id, "last_cost": "12.50"},
        format="json",
    )
    assert resp.status_code == 201
    assert SupplierProduct.objects.filter(supplier=s, product=p).count() == 1
    # GET lista las relaciones del proveedor
    resp_get = inv_client.get(f"/api/suppliers/{s.id}/products/")
    assert resp_get.status_code == 200
    assert len(resp_get.data) == 1


@pytest.mark.django_db
def test_purchase_history_placeholder(inv_client):
    s = Supplier.objects.create(name="S")
    resp = inv_client.get(f"/api/suppliers/{s.id}/purchase-history/")
    assert resp.status_code == 200
    assert resp.data == []


@pytest.mark.django_db
def test_supplier_products_filter_by_product(inv_client):
    s1 = Supplier.objects.create(name="S1")
    s2 = Supplier.objects.create(name="S2")
    p = Product.objects.create(sku="F-1", name="Pieza")
    p2 = Product.objects.create(sku="F-2", name="Otra")
    SupplierProduct.objects.create(supplier=s1, product=p)
    SupplierProduct.objects.create(supplier=s2, product=p)
    SupplierProduct.objects.create(supplier=s1, product=p2)
    resp = inv_client.get(f"/api/supplier-products/?product={p.id}")
    supplier_ids = sorted(sp["supplier"] for sp in resp.data["results"])
    assert supplier_ids == sorted([s1.id, s2.id])


@pytest.mark.django_db
def test_supplier_products_filter_invalid_returns_400(inv_client):
    resp = inv_client.get("/api/supplier-products/?product=abc")
    assert resp.status_code == 400


@pytest.mark.django_db
def test_supplier_product_mark_preferred(inv_client):
    s = Supplier.objects.create(name="S")
    p = Product.objects.create(sku="PR-1", name="Pieza")
    sp = SupplierProduct.objects.create(supplier=s, product=p)
    resp = inv_client.patch(
        f"/api/supplier-products/{sp.id}/", {"is_preferred": True}, format="json"
    )
    assert resp.status_code == 200
    sp.refresh_from_db()
    assert sp.is_preferred is True


@pytest.mark.django_db
def test_supplier_product_duplicate_returns_400(inv_client):
    s = Supplier.objects.create(name="S")
    p = Product.objects.create(sku="D-1", name="Pieza")
    SupplierProduct.objects.create(supplier=s, product=p)
    resp = inv_client.post(
        "/api/supplier-products/",
        {"supplier": s.id, "product": p.id},
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_supplier_product_delete(inv_client):
    s = Supplier.objects.create(name="S")
    p = Product.objects.create(sku="DEL-1", name="Pieza")
    sp = SupplierProduct.objects.create(supplier=s, product=p)
    resp = inv_client.delete(f"/api/supplier-products/{sp.id}/")
    assert resp.status_code == 204
    assert SupplierProduct.objects.filter(id=sp.id).count() == 0


@pytest.mark.django_db
def test_requires_authentication():
    client = APIClient()
    resp = client.get("/api/suppliers/")
    assert resp.status_code == 401


@pytest.mark.django_db
def test_technician_cannot_write():
    client = _client("technician")
    resp = client.post("/api/suppliers/", {"name": "X"}, format="json")
    assert resp.status_code == 403


@pytest.mark.django_db
def test_readonly_cannot_write():
    client = _client("readonly")
    resp = client.post("/api/suppliers/", {"name": "X"}, format="json")
    assert resp.status_code == 403
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
docker compose run --rm backend pytest apps/suppliers/tests/test_api.py -v
```
Expected: FAIL (rutas 404).

- [ ] **Step 3: Crear `backend/apps/suppliers/views.py`**

```python
from rest_framework import filters, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.core.permissions import RoleWriteOrReadOnly

from .models import Supplier, SupplierProduct
from .serializers import SupplierProductSerializer, SupplierSerializer

SuppliersWrite = RoleWriteOrReadOnly("admin", "inventory")


class SupplierViewSet(viewsets.ModelViewSet):
    serializer_class = SupplierSerializer
    permission_classes = [SuppliersWrite]
    filter_backends = [filters.SearchFilter]
    search_fields = ["name", "legal_name", "email", "contact_person"]

    def get_queryset(self):
        qs = Supplier.objects.all()
        include_inactive = self.request.query_params.get("include_inactive", "")
        if include_inactive.lower() not in ("1", "true", "yes", "on"):
            qs = qs.filter(is_active=True)
        return qs

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active", "updated_at"])

    @action(detail=True, methods=["get", "post"])
    def products(self, request, pk=None):
        supplier = self.get_object()
        if request.method == "POST":
            data = {**request.data, "supplier": supplier.id}
            serializer = SupplierProductSerializer(data=data)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data, status=201)
        qs = supplier.supplier_products.all()
        return Response(SupplierProductSerializer(qs, many=True).data)

    @action(detail=True, methods=["get"], url_path="purchase-history")
    def purchase_history(self, request, pk=None):
        self.get_object()
        return Response([])  # TODO: conectar con módulo purchasing


class SupplierProductViewSet(viewsets.ModelViewSet):
    serializer_class = SupplierProductSerializer
    permission_classes = [SuppliersWrite]

    def get_queryset(self):
        qs = SupplierProduct.objects.all()
        params = self.request.query_params
        supplier = params.get("supplier")
        if supplier:
            try:
                qs = qs.filter(supplier_id=int(supplier))
            except (TypeError, ValueError):
                raise ValidationError({"supplier": "Debe ser un id numérico."})
        product = params.get("product")
        if product:
            try:
                qs = qs.filter(product_id=int(product))
            except (TypeError, ValueError):
                raise ValidationError({"product": "Debe ser un id numérico."})
        is_preferred = params.get("is_preferred")
        if is_preferred is not None:
            qs = qs.filter(is_preferred=is_preferred.lower() in ("1", "true", "yes", "on"))
        return qs
```

- [ ] **Step 4: Crear `backend/apps/suppliers/urls.py`**

```python
from rest_framework.routers import SimpleRouter

from .views import SupplierProductViewSet, SupplierViewSet

router = SimpleRouter()
router.register(r"suppliers", SupplierViewSet, basename="supplier")
router.register(r"supplier-products", SupplierProductViewSet, basename="supplier-product")

urlpatterns = router.urls
```

- [ ] **Step 5: Crear `backend/apps/suppliers/admin.py`**

```python
from django.contrib import admin

from .models import Supplier, SupplierProduct


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = ("name", "country", "contact_person", "is_active")
    list_filter = ("is_active", "country")
    search_fields = ("name", "legal_name", "email", "contact_person")


@admin.register(SupplierProduct)
class SupplierProductAdmin(admin.ModelAdmin):
    list_display = ("supplier", "product", "last_cost", "currency", "is_preferred")
    list_filter = ("is_preferred", "currency")
    search_fields = ("supplier__name", "product__sku", "product__name", "supplier_sku")
```

- [ ] **Step 6: Modificar `backend/config/urls.py`**

El archivo termina con:
```python
    path("api/", include("apps.equipment.urls")),
    path("api/", include("apps.inventory.urls")),
]
```
Añadir suppliers después de inventory, dejando:
```python
    path("api/", include("apps.equipment.urls")),
    path("api/", include("apps.inventory.urls")),
    path("api/", include("apps.suppliers.urls")),
]
```
(Usar Edit; `include` ya está importado.)

- [ ] **Step 7: Tests del módulo**

```bash
docker compose run --rm backend pytest apps/suppliers -v
```
Expected: TODOS pasan (3 models + 3 serializers + 14 api = 20).

- [ ] **Step 8: Suite completa + checks**

```bash
docker compose run --rm backend pytest -q
docker compose run --rm backend python manage.py check
docker compose run --rm backend python manage.py makemigrations --check --dry-run
```
Expected: 89 (previo) + 2 (main_supplier, Task 2) + 20 (suppliers) = 111 passed; check sin issues;
"No changes detected". Reportar el conteo exacto observado.

- [ ] **Step 9: Commit**

```bash
git add backend/apps/suppliers backend/config/urls.py
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat: API de proveedores (CRUD, nested products, supplier-products, purchase-history)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Verificación integral

**Files:** ninguno (verificación end-to-end).

- [ ] **Step 1: Suite completa**

```bash
docker compose run --rm backend pytest -q
```
Expected: 111 passed.

- [ ] **Step 2: Levantar stack y migrar**

```bash
docker compose up -d --build
docker compose exec backend python manage.py migrate
```
Expected: migraciones de suppliers + la de inventory (main_supplier) aplicadas en orden.

- [ ] **Step 3: Token admin**

```bash
ACCESS=$(curl.exe -s -X POST http://localhost:8000/api/auth/login/ -H "Content-Type: application/json" -d '{"email":"admin@veragro.com","password":"Admin12345"}' | python -c "import sys,json;print(json.load(sys.stdin)['access'])")
```

- [ ] **Step 4: Crear proveedor, asociar producto, consulta inversa, marcar preferido**

```bash
# Proveedor
SID=$(curl.exe -s -X POST http://localhost:8000/api/suppliers/ -H "Authorization: Bearer $ACCESS" -H "Content-Type: application/json" -d '{"name":"DJI Supplier"}' | python -c "import sys,json;print(json.load(sys.stdin)['id'])")
# Producto (crear uno para asociar)
PID=$(curl.exe -s -X POST http://localhost:8000/api/inventory/products/ -H "Authorization: Bearer $ACCESS" -H "Content-Type: application/json" -d '{"sku":"PROV-PIEZA","name":"Pieza Prov"}' | python -c "import sys,json;print(json.load(sys.stdin)['id'])")
# Asociar (nested)
curl.exe -s -X POST http://localhost:8000/api/suppliers/$SID/products/ -H "Authorization: Bearer $ACCESS" -H "Content-Type: application/json" -d "{\"product\":$PID,\"last_cost\":\"18.00\"}"
# Consulta inversa: qué proveedores venden la pieza
curl.exe -s "http://localhost:8000/api/supplier-products/?product=$PID" -H "Authorization: Bearer $ACCESS"
```
Expected: relación creada (201); la consulta inversa devuelve la relación con ese supplier.

- [ ] **Step 5: Asignar main_supplier al producto vía PATCH de inventario**

```bash
curl.exe -s -X PATCH http://localhost:8000/api/inventory/products/$PID/ -H "Authorization: Bearer $ACCESS" -H "Content-Type: application/json" -d "{\"main_supplier\":$SID}" | python -c "import sys,json;print('main_supplier:',json.load(sys.stdin)['main_supplier'])"
```
Expected: el producto queda con `main_supplier` = SID.

- [ ] **Step 6: OpenAPI**

Abrir `http://localhost:8000/api/docs/` y comprobar que aparecen `/api/suppliers/`,
`/api/suppliers/{id}/products/`, `/api/suppliers/{id}/purchase-history/` y
`/api/supplier-products/`.

- [ ] **Step 7: Commit final (si hubo ajustes)**

```bash
git add -A
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "chore: verificación integral del módulo de proveedores

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Resultado esperado

- CRUD de proveedores con búsqueda/soft-delete.
- Relaciones proveedor-producto: nested GET/POST, CRUD filtrable (directa e inversa), marcar
  preferido vía PATCH, sin duplicados, eliminar.
- `Product.main_supplier` asignable vía la API de inventario.
- Permisos por rol (admin/inventory escriben; resto lee).
- purchase-history placeholder `[]`.
- ~111 tests en verde; OpenAPI actualizado.

Cumple el spec `2026-06-03-modulo-proveedores-design.md`. Deja la base para Compras (usará
Supplier, alimentará movimientos purchase_in y last_cost de SupplierProduct).
