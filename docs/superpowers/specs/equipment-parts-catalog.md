# Catálogo técnico de equipos y despiece interactivo

**Fecha:** 2026-07-27
**Rama:** V3.0 (sobre la cascada Modelo→Categoría→Pieza ya entregada, commits `de565af..f281e3f`)
**Estado:** Spec para revisión (antes del plan por etapas)

## Problema

Hoy la relación equipo↔pieza es débil y de texto libre:

- `Equipment` guarda `brand` y `model` como texto.
- `Product` tiene `compatible_equipment_types` (M2M a `EquipmentType`) y `compatible_models` (texto libre).
- El modal para agregar piezas consulta el inventario general (la cascada actual filtra por `EquipmentType`, pero no sabe **en qué componente** del equipo va la pieza).
- La orden **no** guarda en qué componente exacto se instaló la pieza.

No existe una noción estructurada de "modelo técnico" ni un árbol de componentes (conjuntos y posiciones reemplazables), por lo que no se puede ofrecer un despiece tipo catálogo electrónico ("Sistema de propulsión → Brazo M1 → Motor → piezas compatibles").

## Objetivos

1. Modelar un **catálogo técnico**: `EquipmentModel` (modelo normalizado) + `EquipmentComponent` (árbol jerárquico de conjuntos y posiciones).
2. Relacionar el inventario con ese árbol mediante `ProductCompatibility` (pieza ↔ modelo ↔ componente exacto), permitiendo que una pieza sea compatible con varios modelos y varias posiciones.
3. Que una unidad física (`Equipment`) pueda asociarse a un `EquipmentModel` (`catalog_model`).
4. Que `ServiceOrderPart` registre el **componente** donde se instala la pieza.
5. Exponer endpoints para: árbol de componentes de un modelo, árbol desde una orden, y productos compatibles con un componente (con stock/reservado/disponible/precio/ubicación).
6. Validar la compatibilidad **en backend** (no confiar en el filtro del frontend), con dos modos: **estructurado** (con `component`, compatibilidad obligatoria) y **manual heredado** (sin `component`, permitido para no romper el flujo actual).
7. Una pestaña **Despiece** en la orden con árbol (Mantine Tree) + diagrama SVG 2D inline sincronizados + panel de productos compatibles con botón "agregar a la orden".
8. Seed idempotente de dos modelos: **DJI Agras T50** y **DJI D12500iE**, con sus árboles.

## No objetivos (YAGNI / restricciones del encargo)

- Sin 3D. Sin librerías pesadas nuevas sin justificación.
- No reescribir inventario ni órdenes de servicio; no tocar la lógica atómica de stock salvo lo mínimo (añadir `component` opcional).
- No eliminar campos heredados (`brand`, `model`, `compatible_models`, `compatible_equipment_types`) en esta fase.
- No inventar números de pieza OEM ni especificaciones de DJI; no usar imágenes de manuales (SVG esquemáticos originales).
- No autoasignar productos a componentes por coincidencia de texto; las compatibilidades se registran manualmente.
- No implementar el despiece en la app móvil en esta fase (solo backend + web).
- No tocar Nginx/infra.

## Modelo de datos

Se añade una **capa de catálogo** sin romper lo existente. Todos heredan de `apps.core.models.TimeStampedModel`.

### `equipment.EquipmentModel`

Modelo técnico normalizado (DJI Agras T50, DJI D12500iE, …).

Campos: `equipment_type` (FK PROTECT → `EquipmentType`, related_name `equipment_models`), `brand`, `name`, `model_code`, `revision` (blank), `description` (blank), `diagram_type` (choices `svg`/`image`, default `svg`), `diagram_file` (FileField opcional, `equipment_models/diagrams/`), `is_active` (default True).

- **Unicidad:** `UniqueConstraint(brand, model_code, revision)` para evitar modelos duplicados.
- **Orden:** `("brand", "name")`.
- `__str__` → `"{brand} {name}"`.

### `equipment.Equipment.catalog_model`

Nuevo FK opcional: `catalog_model = FK(EquipmentModel, PROTECT, null=True, blank=True, related_name="equipment_units")`. Se conservan `brand` y `model`. Cuando existe `catalog_model`, el frontend prioriza los datos normalizados.

### `equipment.EquipmentComponent`

Árbol jerárquico de componentes de un modelo.

Campos: `equipment_model` (FK CASCADE, related_name `components`), `parent` (FK self CASCADE null/blank, related_name `children`), `code`, `name`, `component_type` (choices `assembly`=Conjunto / `position`=Posición reemplazable, default `position`), `diagram_key` (blank — liga con las zonas del SVG), `position` (blank), `description` (blank), `sort_order` (PositiveInteger default 0), `is_active` (default True).

Reglas (validadas en `clean()`/serializer/servicio):
- `parent`, si existe, debe pertenecer al mismo `equipment_model`.
- Sin ciclos (un componente no puede ser su propio ancestro).
- `code` único dentro del modelo → `UniqueConstraint(equipment_model, code)`.
- **Orden:** `("sort_order", "name")`.
- Propiedad `path` → ruta completa `"Sistema de propulsión > Brazo M1 > Motor"` (recorre `parent` hacia la raíz).

### `inventory.ProductCompatibility`

Tabla intermedia estructurada inventario↔modelo↔componente.

Campos: `product` (FK CASCADE, related_name `compatibilities`), `equipment_model` (FK CASCADE → `equipment.EquipmentModel`, related_name `product_compatibilities`), `component` (FK CASCADE → `equipment.EquipmentComponent`, related_name `product_compatibilities`), `is_primary` (default False), `notes` (blank).

- **Unicidad:** `UniqueConstraint(product, equipment_model, component)`.
- **Validación:** `component.equipment_model_id == equipment_model_id` (el componente pertenece al modelo indicado).
- Una pieza puede tener varias filas: varios modelos, varios componentes del mismo modelo (p. ej. Motor M1 y Motor M3).

### `service_orders.ServiceOrderPart.component`

Nuevo FK opcional: `component = FK("equipment.EquipmentComponent", PROTECT, null=True, blank=True, related_name="service_order_parts")`. Opcional para no romper órdenes antiguas ni el modo manual.

### Índices

- `EquipmentComponent`: índice en `equipment_model` y en `parent` (consultas de árbol/filtros).
- `ProductCompatibility`: índices en `product`, `equipment_model`, `component`.

## Validaciones de negocio (agregar pieza)

Al agregar una pieza vía `add-part` / `ServiceOrderPartSerializer`:

**Modo estructurado** (llega `component`):
1. La orden debe tener `equipment`.
2. El equipo debe tener `catalog_model`.
3. El `component` debe pertenecer al `catalog_model` del equipo.
4. Debe existir `ProductCompatibility(product, equipment_model=catalog_model, component)`.
5. Si algo falla → **400** con mensaje claro en español (por campo).

**Modo manual heredado** (no llega `component`): se permite tal cual hoy (defaults de costo/precio desde el producto). El frontend nuevo prioriza el modo estructurado, pero el `AddPartModal` manual sigue disponible.

La validación vive en backend (serializer + un helper de servicio), no solo en el frontend. Las reservas, el consumo al finalizar y la liberación al borrar **no cambian** (solo se guarda `component` de más).

## Serializers

Nuevos/actualizados (evitando N+1 con `select_related`/`prefetch_related`/`Prefetch`):

- `EquipmentModelSerializer` — CRUD del modelo técnico.
- `EquipmentComponentSerializer` — plano, con `path` (SerializerMethodField) y `equipment_model`.
- `EquipmentComponentTreeSerializer` — anidado recursivo (`children`).
- `ProductCompatibilitySerializer` — con `component_path`, `component_name`, `equipment_model_name` de solo lectura; valida modelo↔componente.
- `CompatibleProductSerializer` — respuesta del endpoint de productos compatibles (sku, name, stock_quantity, reserved_quantity, available_quantity, sale_price, location, is_primary).
- `EquipmentSerializer` — añadir `catalog_model` (escribible) + `catalog_model_name`/`catalog_model_code`/`catalog_model_brand` (solo lectura).
- `ServiceOrderSerializer` — añadir `equipment_catalog_model` + `equipment_catalog_model_name` (derivados de `equipment.catalog_model`).
- `ServiceOrderPartSerializer` — añadir `component`, `component_name`, `component_code`, `component_path` (solo lectura los `_name/_code/_path`).

## Endpoints

Coherentes con la arquitectura actual (SimpleRouter + acciones `@action`, `RoleWriteOrReadOnly`, soft-delete `is_active`).

### Catálogo de modelos (`equipment`)
```
GET/POST         /api/equipment/models/
GET/PATCH/DELETE /api/equipment/models/{id}/          (DELETE = soft: is_active=False)
GET              /api/equipment/models/{id}/component-tree/   (árbol anidado)
```
Filtros de lista: `?equipment_type=`, `?include_inactive=`.

### Componentes (`equipment`)
```
GET/POST         /api/equipment/components/
GET/PATCH/DELETE /api/equipment/components/{id}/       (DELETE = soft)
```
Filtros: `?equipment_model=`, `?parent=`.

### Compatibilidades (`inventory`)
```
GET/POST         /api/inventory/product-compatibilities/
GET/PATCH/DELETE /api/inventory/product-compatibilities/{id}/  (DELETE = duro; es relación)
```
Filtros: `?product=`, `?equipment_model=`, `?component=`.

### Orientados a la orden (`service_orders`)
```
GET  /api/service-orders/{id}/component-tree/
     → árbol del modelo de order.equipment.catalog_model.
       Si no hay equipo o no hay catalog_model → 400/estructura con mensaje claro.
GET  /api/service-orders/{id}/compatible-products/?component=25
     → { equipment_model:{id,name}, component:{id,name,path}, products:[...] }
POST /api/service-orders/{id}/add-part/   (extendido para aceptar `component`)
```

### Filtro general de productos (`inventory`, extendiendo lo actual)
```
GET /api/inventory/products/?equipment_model=1
GET /api/inventory/products/?component=25
GET /api/inventory/products/?compatible_with_equipment=50   (id de unidad física → resuelve catalog_model)
```
No rompe `?category=`, `?equipment_type=`, `?search=`, `?include_inactive=` (se combinan con AND; `.distinct()` donde haya joins M2M).

## Flujo de usuario (frontend web)

Nueva pestaña **Despiece** en `ServiceOrderDetailPage`, orden: **Despiece | Piezas | Checklist**.

Componentes nuevos (subcarpeta cohesiva `frontend/src/features/service-orders/components/`):
- `InteractivePartsTab.tsx` — orquesta: carga el árbol de la orden, estado de carga/errores (equipo sin modelo técnico), mantiene el componente seleccionado, consulta productos compatibles (TanStack Query con key `["so-compatible", serviceOrderId, componentId]`), agrega piezas y refresca orden/productos/inventario/compatibles; respeta órdenes terminales y permisos.
- `EquipmentComponentTree.tsx` — Mantine Tree: expandir/contraer, resaltar selección, iconos distintos para conjunto/posición, seleccionar hojas y conjuntos; si un conjunto no tiene productos directos, muestra hijos sin error.
- `EquipmentDiagram.tsx` — SVG 2D inline (dos diagramas esquemáticos originales: vista superior del T50, vista frontal/lateral del D12500iE); zonas ligadas por `diagram_key`; clic/toque/hover/resaltado; accesible (`role="button"`, `aria-label`, foco visible, Enter/Espacio). Al elegir una zona general, selecciona el conjunto relacionado en el árbol.
- `CompatibleProductsPanel.tsx` — tarjetas/filas con SKU, nombre, existencia, reservado, disponible, precio, ubicación, indicador de compatibilidad principal, cantidad y botón "Agregar a la orden" (usa `add-part` enviando `component`). Estados: disponible / sin existencia / parcialmente disponible / inactivo. No duplica lógica de inventario.
- `ComponentBreadcrumb.tsx` — muestra la ruta del componente seleccionado.

**Layout escritorio:** 3 columnas (Componentes | Diagrama | Piezas compatibles). **Responsive** (tablet/teléfono): apilado árbol/selector → diagrama → piezas. Mouse, táctil y teclado razonable.

**AddPartModal (heredado):** se conserva la búsqueda manual; cuando la orden tiene modelo técnico, prioriza compatibles y ofrece "Mostrar todos los productos"; indica visualmente productos sin compatibilidad registrada.

**Formulario de producto:** sección "Compatibilidad técnica" (modal/panel separado) para seleccionar modelo técnico, uno o varios componentes, marcar principal, notas, eliminar y ver ruta. `compatible_models` se mantiene como heredado.

**Formulario de equipo:** seleccionar `Tipo` → filtra `Modelo técnico` por tipo → al elegir, rellena marca/modelo textual **si están vacíos** (sin sobrescribir). Compatible con equipos sin `catalog_model`. El detalle del equipo muestra tipo, modelo técnico, marca, código, serie e historial.

## Permisos (matriz existente, sin matriz paralela)

- **Lectura:** cualquier autenticado (`RoleWriteOrReadOnly`, métodos seguros).
- **Escritura de catálogo técnico** (`EquipmentModel`, `EquipmentComponent`): `roles.LOOKUPS_WRITE` (admins + inventory), consistente con `EquipmentType`/categorías.
- **Escritura de compatibilidades** (`ProductCompatibility`): `roles.INVENTORY_WRITE`.
- **Agregar piezas a la orden**: `roles.SERVICE_WRITE` (sin cambios).
- Reutilizar `apps.core.roles` y `apps.core.permissions`.

## Migraciones

- Migraciones aditivas y seguras: nuevos modelos + campos `Equipment.catalog_model` y `ServiceOrderPart.component`, **todos null/blank** (no obligatorios). Sin borrar ni volver obligatorio nada existente.
- Índices y `UniqueConstraint` sobre datos nuevos (no rompen datos actuales).
- **Datos iniciales:** management command idempotente `seed_equipment_catalog` (get_or_create por claves naturales) que crea los `EquipmentType` necesarios (Dron agrícola / Generador), los dos `EquipmentModel` (T50, D12500iE) y sus árboles de `EquipmentComponent`. Reejecutable sin duplicar. **No** crea `ProductCompatibility` automáticas. Documentado en la spec/plan.

Árboles iniciales: los del encargo (T50: propulsión con brazos M1–M4 [motor/ESC/cable/hélice], pulverización, eléctrico, navegación y seguridad, estructura, esparcimiento; D12500iE: motor, combustible, eléctrico, refrigeración, panel de control, estructura). `diagram_key` en los conjuntos/posiciones que el SVG resalta (p. ej. `t50_arm_m1`, `t50_spray_system`, `d12500_engine`).

## Rendimiento

- Árbol completo en pocas consultas (una carga de componentes del modelo + armado en memoria, no un request por nodo).
- Productos compatibles: consulta al cambiar el componente, cacheada por `serviceOrderId + componentId` (TanStack Query).
- `select_related`/`prefetch_related`/`Prefetch` en serializers de orden, piezas y compatibilidades. `.distinct()` en filtros con join M2M.

## Compatibilidad heredada

- Órdenes, productos y equipos históricos siguen funcionando (campos nuevos opcionales).
- Modo manual de `add-part` intacto. `AddPartModal` manual disponible.
- Campos `brand`/`model`/`compatible_models`/`compatible_equipment_types` se conservan.

## Fases futuras (fuera de alcance)

- Despiece en la app móvil.
- Migración/deprecación real de `compatible_models` y `compatible_equipment_types` una vez poblado el catálogo.
- Diagramas SVG más ricos o por-imagen (`diagram_type="image"`).
- Herramienta de import masivo de compatibilidades.

## Riesgos

- **Alcance grande:** mitigado con ejecución por etapas y checkpoints.
- **Regresión en el flujo de piezas/reservas:** mitigado manteniendo el modo manual y probando reserva/consumo/liberación con y sin `component`.
- **N+1 en árbol/orden:** mitigado con prefetch y armado en memoria; pruebas de conteo de queries donde sea barato.
- **Complejidad del SVG interactivo/accesibilidad:** mitigado con dos diagramas esquemáticos simples y pruebas de sincronización árbol↔SVG.
- **Regeneración OpenAPI:** endpoints custom (component-tree, compatible-products) requieren tipos locales para respuestas no representadas por el schema; usar generados donde se pueda.

## Criterios de aceptación

Los 22 del encargo, resumidos: se registran T50 y D12500iE con árboles editables; un equipo se asocia a un modelo; un producto se asocia a uno o varios componentes; la orden obtiene su árbol automáticamente; selección SVG↔árbol sincronizada en ambos sentidos; solo aparecen piezas compatibles con el componente; se agrega una pieza compatible guardando su componente; el backend rechaza compatibilidades incorrectas; reservas/consumo/liberación siguen funcionando; órdenes/productos/equipos antiguos siguen funcionando; el modal manual sigue disponible; toda la suite (existente + nueva) en verde; `npm run typecheck && npm test && npm run build` sin errores; UX en escritorio/tablet/teléfono.

## Estrategia por etapas (checkpoints)

El plan se organizará en 5 etapas independientes y testeables:

1. **Modelos + admin + migraciones + seed** (backend, sin API nueva).
2. **API**: serializers, viewsets, endpoints de árbol/compatibilidad/orden, validación en `add-part`, filtros de productos + pruebas backend + regen OpenAPI.
3. **Formularios admin web**: modelo técnico en equipos, compatibilidades en productos (usando tipos generados).
4. **Orden interactiva**: pestaña Despiece (árbol + SVG + panel), agregar a la orden, responsive + pruebas frontend.
5. **Validación final**: suite backend completa + `typecheck`/`test`/`build`, README, y entrega (resumen, migraciones, endpoints, componentes, resultados, decisiones, limitaciones, pasos de prueba manual, ejemplos T50/motor M1).
