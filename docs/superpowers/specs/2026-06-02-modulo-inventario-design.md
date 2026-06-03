# Spec — Módulo de Inventario Veragro ERP

**Fecha:** 2026-06-02
**Estado:** Aprobado
**Sub-proyecto:** 3 — Módulo de Inventario (`apps.inventory`)

## 1. Contexto y alcance

Tercer sub-proyecto del ERP Veragro, sobre `master` (fundación + clientes + equipos).
Implementa el módulo de inventario del documento (§5.4, API §7.4): productos/piezas,
categorías, movimientos de inventario y ajustes manuales de stock.

Acoplamientos que condicionan el alcance:
- Reservar/descontar piezas dependen del módulo de **Órdenes de Servicio** (inexistente) →
  diferido. El modelo `InventoryMovement` sí define **todos** los tipos de movimiento ahora.
- `main_supplier_id` apunta a **Proveedores** (inexistente) → ese campo se difiere a ese
  sub-proyecto.

### Dentro del alcance
- Modelo `ProductCategory` (lookup, admin-managed) + endpoint read-only.
- Modelo `Product` con campos del doc §5.4 (menos `main_supplier_id`).
- Modelo `InventoryMovement` (todos los tipos).
- Lógica de ajustes de stock en `services.py` (atómica, con guard de stock negativo).
- API: CRUD de productos (búsqueda, filtros, soft-delete), `/movements/`, `/adjustments/`,
  `/low-stock/`, `/categories/`.
- Tests TDD + verificación.

### Fuera del alcance (diferido)
- Reservar/descontar por orden de servicio (módulo service_orders).
- `main_supplier_id` (módulo suppliers).
- Costeo de compras / landed cost (módulo purchasing).
- CRUD de categorías vía API (solo admin + endpoint read-only).
- Frontend.

## 2. Decisiones tomadas

| Decisión | Elección | Razón |
|---|---|---|
| Categoría | Modelo `ProductCategory` (FK), admin-managed, endpoint read-only | Consistente con `EquipmentType`; consistencia de datos y filtrado fiable. Sin seed (las define el negocio). |
| Operaciones de stock | Ajustes manuales + movimientos; reserve/deduct diferidos | Autocontenido y útil; reserve/deduct dependen de service_orders. |
| Permisos | `RoleWriteOrReadOnly("admin","inventory")` | Rol natural del módulo (doc §5.1). Lectura para todos los autenticados. |
| Cantidades y costos | DecimalField(12,2) | Soporta consumibles fraccionables (litros) y dinero con precisión. |
| `compatible_equipment_types` | M2M → `equipment.EquipmentType` | Reutiliza el modelo existente; cruce inventario↔equipos limpio. |
| Soft-delete de producto | `is_active=False` (como Clientes) | El doc da a Product `is_active`; consistencia con Clientes. |
| `main_supplier_id` | Diferido | Suppliers no existe aún. |

## 3. Modelos (`backend/apps/inventory/models.py`)

### ProductCategory (TimeStampedModel)
- `name` CharField(100) unique; `is_active` Bool default True; Meta.ordering=("name",); __str__→name.

### Product (TimeStampedModel)
- `sku` CharField(50) unique
- `name` CharField(255); `description` TextField blank; `barcode` CharField(100) blank
- `category` FK→ProductCategory, on_delete=PROTECT, null=True, blank=True, related_name="products"
- `brand` CharField(100) blank; `model` CharField(100) blank
- `unit_of_measure` CharField(50) blank; `location` CharField(100) blank
- `compatible_equipment_types` M2M→equipment.EquipmentType, blank, related_name="compatible_products"
- `compatible_models` TextField blank
- `stock_quantity` Decimal(12,2) default 0
- `reserved_quantity` Decimal(12,2) default 0
- `minimum_stock` Decimal(12,2) default 0
- `average_cost` Decimal(12,2) default 0
- `last_purchase_cost` Decimal(12,2) default 0
- `sale_price` Decimal(12,2) default 0
- `default_margin_percentage` Decimal(12,2) default 0
- `is_active` Bool default True
- Meta.ordering=("name",); __str__→name
- `@property available_quantity` → `stock_quantity - reserved_quantity`

### InventoryMovement (TimeStampedModel)
- `product` FK→Product, on_delete=PROTECT, related_name="movements"
- `movement_type` CharField choices (TextChoices): purchase_in, service_out, reservation,
  reservation_release, adjustment_in, adjustment_out, return_in, damaged_out
- `quantity` Decimal(12,2)
- `unit_cost` Decimal(12,2) default 0
- `reference_type` CharField(50) blank; `reference_id` PositiveIntegerField null=True, blank=True
- `notes` TextField blank
- `created_by` FK→users.User, on_delete=SET_NULL, null=True, blank=True
- Meta.ordering=("-created_at",); __str__ → f"{movement_type} {quantity} x {product}"

## 4. Lógica de negocio (`backend/apps/inventory/services.py`)

```python
ADJUSTMENT_TYPES = {"adjustment_in", "adjustment_out"}

def apply_adjustment(*, product, movement_type, quantity, unit_cost=0, notes="", user=None):
    # Validaciones: movement_type en ADJUSTMENT_TYPES; quantity > 0.
    # adjustment_out: si quantity > product.stock_quantity -> ValidationError (no negativo).
    # Transacción atómica: actualiza stock_quantity (+/-), guarda, crea InventoryMovement.
    # Devuelve el InventoryMovement creado.
```
- Usa `django.db.transaction.atomic` y `select_for_update` sobre el producto.
- `quantity` debe ser > 0; el signo lo determina el tipo.
- Lanza `rest_framework.exceptions.ValidationError` (o django ValidationError) ante reglas
  rotas; el endpoint la traduce a 400.

## 5. Permisos
- `ProductViewSet` y el endpoint de ajustes: `RoleWriteOrReadOnly("admin", "inventory")`.
- `categories/`, `low-stock/`, `products/{id}/movements/`: lectura, `IsAuthenticated`.

## 6. API (bajo `/api/inventory/`, SimpleRouter, incluido en config/urls.py)

- `ProductViewSet` → `/api/inventory/products/`:
  - CRUD; SearchFilter en `sku`, `name`, `barcode`, `brand`, `model`.
  - get_queryset: filtra `is_active=True` salvo `?include_inactive` truthy; filtro opcional
    `?category=<id>` (con guard a 400 si no es numérico).
  - perform_destroy: soft-delete (`is_active=False`, update_fields).
  - `@action GET movements` → `/products/{id}/movements/`: lista de movimientos del producto.
- `AdjustmentCreateView` → `POST /api/inventory/adjustments/`: serializer valida y llama a
  `apply_adjustment(..., user=request.user)`; responde 201 con el movimiento.
- `LowStockListView` → `GET /api/inventory/low-stock/`: productos activos con
  `available_quantity <= minimum_stock` (annotate `available = F(stock)-F(reserved)`,
  filter `available__lte=F(minimum_stock)`).
- `CategoryListView`/ViewSet read-only → `GET /api/inventory/categories/`: categorías activas.

### Serializers
- `ProductSerializer`: ModelSerializer, fields="__all__", read_only (id, created_at,
  updated_at, stock_quantity, reserved_quantity); expone `available_quantity` (read-only).
  Nota: `stock_quantity`/`reserved_quantity` son read-only en la API → solo cambian vía
  movimientos/ajustes (no se editan a mano por el CRUD).
- `ProductCategorySerializer`: (id, name).
- `InventoryMovementSerializer`: lectura de movimientos (id, product, movement_type,
  quantity, unit_cost, reference_type, reference_id, notes, created_by, created_at).
- `AdjustmentSerializer`: input (product, movement_type, quantity, unit_cost?, notes?);
  `create()` delega en `apply_adjustment`.

## 7. Pruebas (TDD)
- **Modelos**: Product `available_quantity` (= stock-reserved); str; M2M con EquipmentType;
  ProductCategory str.
- **Servicio** (`tests/test_services.py`): adjustment_in suma stock + crea movimiento;
  adjustment_out resta; out > stock → ValidationError (stock intacto); tipo no-ajuste →
  ValidationError; quantity<=0 → ValidationError.
- **API** (`tests/test_api.py`): crear producto; stock_quantity read-only en CRUD (enviar
  stock en POST no lo fija); búsqueda por sku; filtro por category; soft-delete; ajuste in
  vía endpoint (stock sube, movimiento creado, 201); ajuste out insuficiente → 400;
  `/products/{id}/movements/` lista; `/low-stock/` devuelve los bajo mínimo y excluye los ok;
  `/categories/` read-only (POST→405); permisos (inventory crea 201; technician 403;
  readonly 403; lectura 200); 401 sin auth.

## 8. Verificación
- makemigrations (modelos) creadas y committeadas; migrate limpio.
- `manage.py check` sin issues; `makemigrations --check` sin cambios.
- Suite completa en verde (equipos 58 + inventario nuevos).
- En vivo: crear categoría (admin), crear producto, POST ajuste, ver movimientos, low-stock,
  docs muestran los endpoints.

## 9. Criterio de aceptación
- CRUD de productos con búsqueda/filtros/soft-delete; stock/reserved no editables por CRUD.
- Ajustes crean movimiento y actualizan stock atómicamente; no permiten stock negativo.
- low-stock y movements operativos; categorías read-only.
- Permisos por rol (admin/inventory escriben; resto lee).
- OpenAPI documenta los endpoints; suite en verde.

## 10. Siguientes sub-proyectos
Proveedores (añade Supplier/SupplierProduct y `Product.main_supplier`) → Compras (costeo
proporcional, alimenta movimientos purchase_in) → Órdenes de Servicio (reserve/deduct) →
Checklists → Cotizaciones/Facturación → Reportes → Frontend. Ver doc §13.
