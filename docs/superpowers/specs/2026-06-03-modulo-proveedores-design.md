# Spec — Módulo de Proveedores Veragro ERP

**Fecha:** 2026-06-03
**Estado:** Aprobado
**Sub-proyecto:** 4 — Módulo de Proveedores (`apps.suppliers`)

## 1. Contexto y alcance

Cuarto sub-proyecto, sobre `master` (fundación + clientes + equipos + inventario).
Implementa proveedores y la relación proveedor↔producto (doc §5.5, API §7.5), y añade el
campo diferido `Product.main_supplier` al inventario.

### Dentro del alcance
- Modelo `Supplier` (campos doc §5.5, soft-delete).
- Modelo `SupplierProduct` (relación con unique_together).
- Campo `Product.main_supplier` (FK a Supplier) en `apps.inventory`.
- API: CRUD de proveedores, nested `/suppliers/{id}/products/` (GET/POST),
  `SupplierProductViewSet` CRUD filtrable (`/api/supplier-products/`),
  `/suppliers/{id}/purchase-history/` placeholder.
- Permisos `RoleWriteOrReadOnly("admin","inventory")`.
- Tests TDD + verificación.

### Fuera del alcance (diferido)
- Historial real de compras por proveedor (módulo purchasing) → endpoint placeholder `[]`.
- Costeo de compras (módulo purchasing).
- Enforcement de unicidad de `is_preferred` (un solo preferido por producto) → follow-up.
- Frontend.

## 2. Decisiones tomadas

| Decisión | Elección | Razón |
|---|---|---|
| Proveedor preferido | Ambos: `Product.main_supplier` (FK) + `SupplierProduct.is_preferred` (flag) | Fiel al doc; FK es atajo al principal, flag marca relaciones preferidas. |
| Consulta inversa | Endpoint filtrable `/api/supplier-products/` (CRUD) + nested `/suppliers/{id}/products/` | Cubre "qué proveedor vende cada pieza" y la gestión por proveedor. CRUD permite editar/borrar relaciones (marcar preferido, actualizar costo). |
| Permisos | `RoleWriteOrReadOnly("admin","inventory")` | Rol natural (doc §5.1). Lectura para todos los autenticados. |
| on_delete | SupplierProduct: CASCADE en supplier y product (registro de relación). `Product.main_supplier`: SET_NULL. | La relación carece de sentido sin sus extremos; el producto sobrevive a la baja de su proveedor principal. |
| Soft-delete de Supplier | `is_active=False` | Consistencia con clientes/inventario. |

## 3. Modelos

### Supplier (`backend/apps/suppliers/models.py`, TimeStampedModel)
- `name` CharField(255)
- `legal_name` CharField(255) blank
- `country` CharField(100) blank
- `phone` CharField(50) blank; `whatsapp` CharField(50) blank
- `email` EmailField blank; `website` URLField blank
- `contact_person` CharField(255) blank
- `address` TextField blank
- `estimated_delivery_days` PositiveIntegerField null=True, blank=True
- `payment_terms` CharField(255) blank
- `notes` TextField blank
- `is_active` Bool default True
- Meta.ordering=("name",); __str__→name

### SupplierProduct (TimeStampedModel)
- `supplier` FK→Supplier on_delete=CASCADE related_name="supplier_products"
- `product` FK→inventory.Product on_delete=CASCADE related_name="supplier_products"
- `supplier_sku` CharField(100) blank
- `last_cost` DecimalField(12,2) default 0
- `currency` CharField(10) default "USD"
- `minimum_order_quantity` DecimalField(12,2) default 0
- `estimated_delivery_days` PositiveIntegerField null=True, blank=True
- `is_preferred` Bool default False
- `notes` TextField blank
- Meta: unique_together=(("supplier","product"),); ordering=("supplier_id","product_id")
- __str__ → f"{supplier} · {product}"

### Inventario: Product.main_supplier (nueva migración en apps.inventory)
- `main_supplier` FK→suppliers.Supplier, null=True, blank=True, on_delete=SET_NULL,
  related_name="main_for_products".

### Orden de migraciones (sin ciclo)
1. `inventory.0001` (existe).
2. `suppliers.0001` — crea Supplier y SupplierProduct (FK product → inventory). Depende de
   inventory.0001.
3. `inventory.000X` — añade `main_supplier`. Depende de suppliers.0001.
Generar en dos pasos: primero `makemigrations suppliers`, luego añadir el campo y
`makemigrations inventory`.

## 4. Permisos
`RoleWriteOrReadOnly("admin","inventory")` para `SupplierViewSet`, sus acciones de escritura
(`products` POST) y `SupplierProductViewSet`. Lectura (`GET`, purchase-history) accesible a
cualquier autenticado.

## 5. API (SimpleRouter, incluida en config/urls.py bajo /api/)

- `SupplierViewSet` → `/api/suppliers/`:
  - CRUD; SearchFilter en `name`, `legal_name`, `email`, `contact_person`.
  - get_queryset: filtra `is_active=True` salvo `?include_inactive` truthy.
  - perform_destroy: soft-delete (`is_active=False`, update_fields incluye updated_at).
  - `@action products` (GET, POST) → `/suppliers/{id}/products/`: GET lista las
    SupplierProduct del proveedor; POST crea una (supplier fijado desde la URL). Permiso de
    escritura aplica al POST.
  - `@action purchase_history` (GET) → `/suppliers/{id}/purchase-history/`: devuelve `[]`
    (TODO: conectar módulo purchasing).
- `SupplierProductViewSet` → `/api/supplier-products/`:
  - ModelViewSet (CRUD), permission RoleWriteOrReadOnly("admin","inventory").
  - get_queryset: filtros opcionales `?supplier=`, `?product=`, `?is_preferred=`
    (validar enteros → 400 si no numérico; is_preferred acepta true/false).

## 6. Serializers
- `SupplierSerializer`: ModelSerializer fields="__all__", read_only (id, created_at, updated_at).
- `SupplierProductSerializer`: ModelSerializer; expone `supplier`, `product`, `supplier_sku`,
  `last_cost`, `currency`, `minimum_order_quantity`, `estimated_delivery_days`,
  `is_preferred`, `notes`, además `product_sku` y `supplier_name` read-only (usabilidad).
  La unicidad (supplier, product) la valida DRF vía UniqueTogetherValidator (default por el
  modelo) → 400 ante duplicado. En el POST anidado, `supplier` se inyecta desde la URL.

## 7. Pruebas (TDD)
- **Modelos** (`tests/test_models.py`): Supplier str + is_active default; SupplierProduct
  unique_together (crear duplicado lanza IntegrityError); Product.main_supplier asignable y
  reverse `supplier.main_for_products`.
- **API** (`tests/test_api.py`):
  - Suppliers: crear (201), búsqueda por name, soft-delete (DELETE→is_active False), lista
    excluye inactivos por defecto, 401 sin auth, technician 403, readonly 403, inventory 201.
  - Nested: GET `/suppliers/{id}/products/` lista; POST crea relación (supplier desde URL).
  - SupplierProduct: filtro por product (inversa) devuelve relaciones de esa pieza; filtro
    por supplier; filtro inválido no numérico → 400; PATCH is_preferred=True; crear duplicado
    (mismo supplier+product) → 400; DELETE relación.
  - purchase-history → `[]`.

## 8. Verificación
- `makemigrations suppliers` y `makemigrations inventory` creadas y committeadas; migrate
  limpio (orden correcto).
- `manage.py check` sin issues; `makemigrations --check` sin cambios.
- Suite completa en verde (inventario 89 + proveedores nuevos).
- En vivo: crear proveedor, asociar producto (nested POST), consulta inversa por product,
  marcar is_preferred, asignar main_supplier a un producto vía PATCH de inventario, docs.

## 9. Criterio de aceptación
- CRUD de proveedores con búsqueda/soft-delete.
- Relaciones proveedor-producto: crear (nested y directo), consultar (directa e inversa),
  editar (marcar preferido, costo), eliminar; sin duplicados.
- `Product.main_supplier` asignable.
- Permisos por rol (admin/inventory escriben; resto lee).
- purchase-history placeholder responde `[]`.
- OpenAPI documenta los endpoints; suite en verde.

## 10. Siguientes sub-proyectos
Compras (costeo proporcional; usa Supplier y alimenta movimientos purchase_in y last_cost) →
Órdenes de Servicio (reserve/deduct de inventario) → Checklists → Cotizaciones/Facturación →
Reportes → Frontend. Ver doc §13.
