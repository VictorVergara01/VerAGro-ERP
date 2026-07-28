# Piezas por modelo: menú Modelo → Categoría → Pieza

**Fecha:** 2026-07-27
**Rama:** V3.0

## Problema

Al agregar piezas a una orden de servicio (taller), hoy se elige el producto desde
un `Select` plano con **todo** el inventario. Con varios modelos de equipo (Agras T50,
Generador DJI D12500 iE, …) el técnico no tiene forma guiada de encontrar la pieza que
corresponde al equipo de la orden. Se quiere un menú interactivo en cascada:

> **Modelo:** Agras T50 → **Categoría:** Tanque de fumigación → **Pieza:** Impeller pump motor

## Decisiones de diseño (acordadas)

1. **Pieza ↔ Modelo = muchos-a-muchos.** Una pieza puede ser compatible con varios
   modelos. Se reutiliza la relación existente `Product.compatible_equipment_types`.
2. **Categoría = global reutilizable.** "Tanque de fumigación", "electrónica", etc. son
   categorías generales compartidas entre modelos. Se reutiliza `ProductCategory`.
3. **Filtro con escape.** En la orden, el menú por defecto muestra solo piezas marcadas
   compatibles con el modelo del equipo de la orden, pero ofrece un toggle "Ver todas las
   piezas" por si una pieza aún no está etiquetada.
4. **Alcance = ambos lados.** Etiquetado en inventario + menú en la orden.
5. **Paso categoría = chips/botones visuales.**

## Contexto: qué ya existe

- `Product.compatible_equipment_types` (M2M → `equipment.EquipmentType`): la relación
  pieza↔modelo. Ya se edita en `ProductFormModal` como MultiSelect "Equipos compatibles".
- `Product.category` (FK → `ProductCategory`): ya se edita en la ficha.
- `Product.compatible_models` (TextField de texto libre): **redundante y confuso**; se elimina.
- `ProductViewSet.get_queryset` ya filtra por `?category=<id>`.
- `AddPartModal` (frontend) es hoy un `Select` plano sobre `useProducts({})`.
- El serializer de `ServiceOrder` expone `equipment` y `equipment_name`, pero **no** el
  tipo/modelo del equipo.

El grueso del trabajo es frontend + un filtro nuevo en backend. La estructura de datos
prácticamente ya existe.

## Parte 1 — Backend

### 1.1 Filtro por modelo en `ProductViewSet`
En `apps/inventory/views.py`, `get_queryset`: agregar soporte para el query param
`equipment_type`:

```python
equipment_type = params.get("equipment_type")
if equipment_type:
    try:
        qs = qs.filter(compatible_equipment_types__id=int(equipment_type))
    except (TypeError, ValueError):
        raise ValidationError({"equipment_type": "Debe ser un id numérico."})
```

Se combina (AND) con el filtro `category` existente. Usar `.distinct()` si el join M2M
puede duplicar filas.

### 1.2 Exponer el modelo en el serializer de la orden
En `apps/service_orders/serializers.py`, agregar campos read-only:

```python
equipment_type = serializers.IntegerField(
    source="equipment.equipment_type_id", read_only=True
)
equipment_type_name = serializers.CharField(
    source="equipment.equipment_type.name", read_only=True
)
```

Añadirlos a `fields`. Cuando la orden no tiene equipo, ambos quedan nulos.

### 1.3 Regenerar tipos OpenAPI
Paso habitual del proyecto tras tocar serializers/params.

## Parte 2 — Frontend: menú interactivo (`AddPartModal`)

Rediseñar de `Select` plano a selector en cascada de 3 pasos.

**Props:** `AddPartModal` recibe además `equipmentType` y `equipmentTypeName` de la orden
(desde `ServiceOrderDetailPage`, que ya carga la orden).

**Paso 1 — Modelo:** `Select` de `EquipmentType` (usa `useEquipmentTypes`),
preseleccionado con el modelo de la orden. Al lado, toggle **"Ver todas las piezas"**:
- apagado (default) → filtra por el modelo elegido.
- encendido → quita el filtro de modelo (escape acordado).

**Paso 2 — Categoría:** **chips/botones** con solo las categorías que tienen piezas para
el modelo elegido. Derivadas en memoria del resultado de piezas del modelo. Opcional: sin
categoría seleccionada se ven todas las piezas del modelo. Un chip activo se puede
desactivar para volver a "todas".

**Paso 3 — Pieza:** `Select` buscable ya acotado, con label `SKU · nombre · (stock disp.)`.

Debajo, sin cambios: **cantidad / precio unitario / notas**.

**Estrategia de datos (cascada fluida, 1 request por cambio de modelo):**
- Al elegir modelo (o al abrir, con el modelo de la orden): `useProducts({ equipmentType, pageSize: 200 })`.
- De ese resultado se derivan las categorías (Paso 2) y se filtran las piezas (Paso 3) en memoria.
- Cambiar de chip de categoría es instantáneo (filtro en memoria).
- Toggle "ver todas" → re-consulta sin `equipmentType`.
- Extender `ProductListParams`/`useProducts` en `inventory/api.ts` para enviar
  `equipment_type`.

**Casos borde:**
- Orden sin equipo → sin modelo preseleccionado; el usuario elige modelo o usa "ver todas".
- Modelo sin piezas etiquetadas → estado vacío que invita a usar "ver todas las piezas".

## Parte 3 — Frontend: ficha de producto (`ProductFormModal`)

Pulido del etiquetado (ya casi completo):
- Renombrar el `MultiSelect` "Equipos compatibles" → **"Modelos compatibles"** (es la
  relación real que alimenta el menú).
- **Eliminar** el `Textarea` de texto libre "Modelos compatibles" (`compatible_models`).
  Quitar el campo del form/estado. (El campo del modelo puede quedar en la BD sin uso, o
  eliminarse en una migración de limpieza — decidir en el plan; por defecto solo se retira
  de la UI para evitar pérdida de datos.)

## Testing

- **Backend:** test de `ProductViewSet` con `?equipment_type=<id>` (incluye y excluye
  correctamente); test del serializer de orden exponiendo `equipment_type[_name]`.
- **Frontend:** test de `AddPartModal` — preselección del modelo de la orden, derivación de
  chips de categoría, filtrado de piezas por chip, y toggle "ver todas". Actualizar
  `ProductFormModal.test.tsx` por el renombrado/eliminación de campos.

## Fuera de alcance (YAGNI)

- Secciones/subsistemas específicos por modelo (se decidió categoría global).
- Aplicar el menú a Trabajos de campo (`field_jobs`): usan consumibles agroquímicos de
  texto libre, no repuestos.
- Jerarquías de categorías anidadas.
