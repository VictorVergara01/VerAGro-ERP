# Spec — Módulo de Checklists y Diagnóstico Veragro ERP

**Fecha:** 2026-06-03
**Estado:** Aprobado
**Sub-proyecto:** 7 — Módulo de Checklists (`apps.checklists`)

## 1. Contexto y alcance

Séptimo sub-proyecto, sobre `master`. Implementa checklists reutilizables por tipo de equipo y
su llenado en cada orden de servicio (doc §5.8, API §7.8). Se integra con `service_orders`:
los ítems marcados `requires_replacement` con un producto recomendado generan piezas requeridas
en la orden.

### Dentro del alcance
- Modelos `ChecklistTemplate`, `ChecklistTemplateItem`, `ServiceChecklist`,
  `ServiceChecklistItem` (doc §5.8).
- Seed: plantilla **"Checklist DJI Agras T50"** (tipo *Drone agrícola*) con los 16 ítems del doc.
- API: CRUD de plantillas y sus ítems; instanciar/listar checklist en una orden
  (`/api/service-orders/{id}/checklist/`); llenar checklist y sus ítems
  (`/api/service-checklists/`, `/api/service-checklist-items/`).
- **Integración**: al llenar un ítem `requires_replacement` con `recommended_product`, se crea
  (si no existe) un `ServiceOrderPart` `required` en la orden (decisión 2a).
- Permisos: plantillas `RoleWriteOrReadOnly("admin")`; checklists de orden
  `RoleWriteOrReadOnly("admin","technician")`.
- Tests TDD + verificación en vivo.

### Fuera del alcance (diferido)
- Cotizaciones / Facturación (§5.9) → sub-proyecto 8.
- Fotos/adjuntos por ítem y endpoints `/api/mobile/...` → frontend/móvil.
- Reserva automática de las piezas auto-agregadas (se crean `required`; el técnico corre
  `reserve-parts` como siempre).

## 2. Decisiones tomadas

| Decisión | Elección | Razón |
|---|---|---|
| Permisos de plantillas | `RoleWriteOrReadOnly("admin")` (1a) | Son configuración reutilizable; técnicos leen y llenan. |
| Pieza recomendada | Auto-agregar `ServiceOrderPart` `required` si no existe (2a) | Integra checklist→piezas→reserva sin duplicar (por producto). |
| Match tipo de equipo | Validación **suave** (3a): se sugiere por `?equipment_type=`, se permite cualquier plantilla | Flexible; no bloquea casos reales. |
| Snapshot vs FK | `ServiceChecklistItem.template_item` FK PROTECT (nombre se lee del ítem de plantilla) | Fiel al doc; PROTECT evita borrar un ítem de plantilla en uso. |
| Duplicados | `ServiceChecklist` unique (service_order, checklist_template) | Una plantilla se instancia una sola vez por orden. |
| on_delete | items→template/checklist CASCADE; service_checklist→template PROTECT; checklist→service_order CASCADE; template_item PROTECT; recommended_product SET_NULL | La plantilla/orden agrupa sus ítems; no se borra plantilla/producto en uso. |

## 3. Modelos (`backend/apps/checklists/models.py`, TimeStampedModel)

### ChecklistTemplate
- `name` CharField(255)
- `equipment_type` FK→equipment.EquipmentType PROTECT null=True blank=True
  related_name="checklist_templates"
- `description` TextField blank
- `is_active` Bool default True
- Meta.ordering=("name",); __str__→name

### ChecklistTemplateItem
- `template` FK→ChecklistTemplate CASCADE related_name="items"
- `name` CharField(255); `description` TextField blank
- `order` PositiveIntegerField default 0
- `is_required` Bool default True
- Meta.ordering=("order","id"); __str__→name

### ServiceChecklist
- `service_order` FK→service_orders.ServiceOrder CASCADE related_name="checklists"
- `checklist_template` FK→ChecklistTemplate PROTECT related_name="service_checklists"
- `completed_by` FK→users.User SET_NULL null/blank related_name="+"
- `completed_at` DateTimeField null/blank
- Meta.unique_together=(("service_order","checklist_template"),); ordering=("id",)

### ServiceChecklistItem
- `service_checklist` FK→ServiceChecklist CASCADE related_name="items"
- `template_item` FK→ChecklistTemplateItem PROTECT related_name="+"
- `status` CharField(30) choices=[ok, fail, requires_replacement, not_applicable, pending],
  default `pending`
- `notes` TextField blank
- `recommended_product` FK→inventory.Product SET_NULL null/blank related_name="+"
- `priority` CharField(20) choices=[low, medium, high, critical], blank, default ""
- Meta.ordering=("template_item__order","id")

### Migraciones
- `checklists.0001` crea los 4 modelos. Depende de `equipment`, `service_orders`, `inventory`,
  `users`.
- `checklists.0002` (data) siembra la plantilla DJI Agras T50 (tipo *Drone agrícola* vía
  get_or_create por nombre) + 16 ítems (order 1..16, is_required=True). Idempotente.

## 4. Servicios (`backend/apps/checklists/services.py`)
- `instantiate_checklist(*, service_order, template, user=None)`: valida no-duplicado
  (unique) → 400 si ya existe; crea `ServiceChecklist` y un `ServiceChecklistItem` (status
  `pending`) por cada ítem **activo** de la plantilla. Devuelve el checklist.
- `apply_recommended_parts(checklist, user=None)`: por cada ítem `requires_replacement` con
  `recommended_product`, si no existe ya un `ServiceOrderPart` de ese producto en la orden, lo
  crea (`required`, `unit_cost=average_cost`, `unit_price=sale_price`); luego
  `service_orders.services.recalculate_totals(order)`. Idempotente. Import local de
  service_orders (dependencia unidireccional checklists→service_orders).

## 5. Permisos
- `ChecklistTemplateViewSet`, `ChecklistTemplateItemViewSet`: `RoleWriteOrReadOnly("admin")`.
- `ServiceChecklistViewSet`, `ServiceChecklistItemViewSet` y la acción `checklist` de
  service-orders: `RoleWriteOrReadOnly("admin","technician")`.
- Lectura para cualquier autenticado.

## 6. API

### Plantillas (SimpleRouter)
- `/api/checklists/templates/` CRUD. Filtro `?equipment_type=` (→400 no numérico),
  `?include_inactive`. SearchFilter `name`. Soft-delete vía `is_active=False` en destroy.
  Creación con `items` anidados (writable) opcional.
- `/api/checklists/template-items/` CRUD. Filtro `?template=` (→400 no numérico).

### Checklist en la orden (acción en `ServiceOrderViewSet`, import local de checklists)
- `GET /api/service-orders/{id}/checklist/`: lista los `ServiceChecklist` de la orden (con ítems).
- `POST /api/service-orders/{id}/checklist/`: body `{checklist_template}`; instancia
  (`instantiate_checklist`); 201 con el checklist creado. Permiso admin/technician.

### Llenado (SimpleRouter)
- `/api/service-checklists/` ViewSet (retrieve/list/update). Filtro `?service_order=`.
  - `PATCH`: acepta `items` anidados `[{id, status, notes, priority, recommended_product}]`
    para llenado masivo; tras guardar corre `apply_recommended_parts`.
  - `@action complete (POST)`: setea `completed_by=user`, `completed_at=now`.
- `/api/service-checklist-items/` ViewSet (retrieve/list/update). Filtro `?service_checklist=`.
  - `PATCH` de un ítem; tras guardar corre `apply_recommended_parts(checklist)`.

## 7. Serializers
- `ChecklistTemplateItemSerializer`: fields del ítem; `template` required=False (anidado).
- `ChecklistTemplateSerializer`: `items` anidados (read; write en create).
- `ServiceChecklistItemSerializer`: `status`, `notes`, `priority`, `recommended_product` +
  read-only `item_name` (source=`template_item.name`), `item_order`, `is_required`,
  `recommended_product_sku`. `template_item` requerido al crear (vía instanciación).
- `ServiceChecklistSerializer`: `service_order`, `checklist_template`, `completed_by`,
  `completed_at` (read-only), `items` anidados; `template_name` read-only. Update soporta
  escritura anidada de `items` (match por `id`).

## 8. Pruebas (TDD)
- **Seed/migración**: existe la plantilla "Checklist DJI Agras T50" con 16 ítems tras migrar.
- **Modelos**: defaults (item status pending, is_required True); unique (service_order,
  template) → IntegrityError; CASCADE de ítems; ordering por `order`.
- **Servicios**: `instantiate_checklist` crea checklist + N ítems pending (solo activos);
  duplicado → ValidationError; `apply_recommended_parts` crea ServiceOrderPart para
  requires_replacement+producto, no duplica, recalcula total de la orden.
- **API**: CRUD de plantillas (admin 201, technician 403 en escritura de plantilla, lectura ok);
  template-items filtro por template; instanciar checklist en orden (POST → 201 con ítems
  pending); listar checklist de la orden; PATCH masivo de ítems (status/priority);
  item requires_replacement+recommended_product agrega pieza a la orden (verificable en
  `/service-orders/{id}/` parts); `complete` setea completed_at; permisos (technician puede
  llenar checklist 200, no crear plantilla 403; readonly/sales/inventory 403 en escritura);
  filtros no numéricos → 400.

## 9. Verificación
- `makemigrations checklists` (0001) + data migration (0002) creadas/committeadas; `migrate`
  limpio; `check` sin issues; `makemigrations --check` sin cambios; schema OpenAPI válido
  (`--fail-on-warn`).
- Suite completa en verde (168 previos + nuevos).
- En vivo: crear orden, instanciar checklist DJI T50 (16 ítems), marcar un ítem
  requires_replacement con producto → ver la pieza requerida aparecer en la orden, `complete`,
  docs Swagger.

## 10. Criterio de aceptación
- Plantillas CRUD (admin) con ítems; seed DJI Agras T50 (16 ítems).
- Instanciar checklist en una orden crea ítems `pending` desde la plantilla; sin duplicados.
- Llenar ítems (status/notes/priority/recommended_product); `requires_replacement`+producto
  agrega pieza requerida a la orden (sin duplicar) y recalcula su total.
- `complete` marca completado (by/at).
- Permisos por rol; OpenAPI documenta los endpoints; suite en verde.

## 11. Siguientes sub-proyectos
Cotizaciones/Facturación (§5.9; implementa quote/invoice y el descuento por factura) → Reportes
→ Frontend. Ver doc §13.
