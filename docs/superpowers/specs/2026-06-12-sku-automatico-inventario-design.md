# SKU automático en inventario — Diseño

**Fecha:** 2026-06-12
**Módulo:** inventario (con refactor menor en compras)

## Problema

Al crear un producto desde el formulario de inventario, el SKU es un campo
obligatorio que el usuario debe escribir a mano
(`frontend/src/features/inventory/ProductFormModal.tsx:74,134` y
`backend/apps/inventory/models.py:22`). Se busca que el SKU se genere
automáticamente para que el usuario no tenga que inventarlo, sin perder la
posibilidad de definir uno manual cuando haga falta.

Nota: el módulo de compras ya genera SKUs automáticos con el patrón
`SKU-{pk:06d}` en `backend/apps/purchasing/serializers.py:23-35`, pero esa
lógica está duplicada y aislada de inventario.

## Comportamiento deseado

"Auto pero editable":

- Si el usuario deja el SKU vacío al guardar, el backend lo genera.
- Si el usuario escribe un SKU, se respeta tal cual.

**Formato del SKU autogenerado:** `SKU-000042` — prefijo fijo `SKU-` +
correlativo del `pk` con relleno de ceros a 6 dígitos. Es el mismo patrón que
ya usa compras, de modo que todo el sistema queda consistente.

## Diseño

### Backend — `backend/apps/inventory/`

1. **`services.py`** — nueva función fuente única del formato:

   ```python
   def generate_product_sku(pk: int) -> str:
       return f"SKU-{pk:06d}"
   ```

2. **`serializers.py` → `ProductSerializer`:**
   - El campo `sku` deja de ser requerido: `required=False, allow_blank=True`
     (declarándolo explícitamente, ya que el `Meta` usa `fields = "__all__"`).
   - En `create()`:
     - Si `sku` viene con valor → se usa tal cual (comportamiento actual).
     - Si viene vacío → se inserta un valor temporal único
       (`TMP-{uuid4().hex[:12]}`) para no violar la restricción `unique` en la
       inserción, se guarda, y luego se setea
       `generate_product_sku(product.pk)` con `save(update_fields=["sku"])`.
   - Se mantiene la llamada existente a `apply_margin(product)` tras crear.

3. **`purchasing/serializers.py`:** refactor de `create_product_from_payload`
   para reutilizar `generate_product_sku` en lugar de la cadena literal
   `f"SKU-{product.pk:06d}"`. Sin cambio de comportamiento; solo deja una sola
   fuente de verdad del formato.

### Frontend — `frontend/src/features/inventory/ProductFormModal.tsx`

- Quitar la validación obligatoria de `sku` en `useForm` (línea 74).
- En el `TextInput` de SKU (línea 134): quitar `withAsterisk` y agregar
  `placeholder="Déjalo vacío para generar automáticamente"`.
- En edición se sigue mostrando el SKU existente y editable, igual que hoy.

### Modelo / DB

Sin cambios. `Product.sku` sigue siendo `CharField(max_length=50, unique=True)`.
Nunca queda realmente vacío tras guardar: o lo escribe el usuario o lo genera el
backend. No se requiere migración.

## Edge cases

- **Unicidad:** garantizada por el `pk`, que es único. El valor temporal
  `TMP-<uuid>` evita colisiones durante la inserción de productos sin SKU
  guardados de forma concurrente.
- **SKU manual duplicado:** lo rechaza la restricción `unique` con error de
  validación, igual que hoy.
- **Edición vaciando el SKU:** queda fuera del alcance de este cambio; el campo
  se mantiene editable como hoy. (Si más adelante se quiere regenerar al
  vaciar, se aplicaría la misma función `generate_product_sku`.)

## Tests

En `backend/apps/inventory/tests/`:

- Crear producto vía API **sin** SKU → la respuesta trae `sku == "SKU-NNNNNN"`
  correspondiente a su `pk`.
- Crear producto vía API **con** SKU manual → se respeta el valor enviado.
- Crear dos productos sin SKU → ambos reciben SKUs distintos y válidos.

En `backend/apps/purchasing/tests/`:

- Verificar que la creación de producto desde una línea de OC sigue produciendo
  el mismo formato `SKU-NNNNNN` tras el refactor (los tests existentes en
  `test_new_product.py` deben seguir pasando).

## Fuera de alcance

- Cambiar el formato del SKU en compras o en importación/exportación.
- Regenerar SKUs de productos existentes.
- Prefijos por categoría u otros esquemas de numeración.
