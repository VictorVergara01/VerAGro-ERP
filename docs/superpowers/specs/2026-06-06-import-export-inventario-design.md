# Importar / Exportar inventario (CSV)

**Fecha:** 2026-06-06
**Módulo:** `apps.inventory` (backend) + `features/inventory` (web)
**Estado:** aprobado, pendiente de plan

## Objetivo

Permitir la **carga inicial del catálogo** de productos mediante un CSV y **exportar**
el catálogo actual a CSV. Es una herramienta de alta masiva para arrancar (o agregar
muchos productos de golpe), no un editor en masa de productos existentes.

## Decisiones (acordadas con el usuario)

- **Uso principal:** carga inicial del catálogo. El stock del archivo es la cantidad inicial.
- **Formato:** CSV. UTF-8 **con BOM** (`utf-8-sig`) para que Excel en español respete
  acentos; separador coma (`,`).
- **Manejo de errores:** *best-effort*. Las filas válidas se importan; las inválidas se
  reportan (fila + SKU + motivo) sin abortar el resto.
- **Categoría y proveedor:** van por **nombre** en el CSV; si no existen, **se crean**.
- **Solo crea, no edita:** si el SKU ya existe, la fila se **salta** (no pisa datos de un
  producto existente). El modo "actualizar existentes" (upsert) es un follow-up.

## Backend

### Endpoints (en `ProductViewSet`, permiso `RoleWriteOrReadOnly("admin","inventory")`)

Ambos van como `@action` del viewset de productos. Los costos son sensibles, por eso
también el export queda restringido a `admin`/`inventory` (no lectura para todos).

- **`GET /api/inventory/products/export/`**
  - Devuelve `text/csv` como adjunto (`Content-Disposition: attachment; filename="inventario.csv"`).
  - Escribe BOM + encabezados + una fila por producto (todos, activos e inactivos).
  - Las columnas exportadas son las mismas que acepta el import (ver abajo) **más**
    columnas informativas de solo lectura: `reservado`, `disponible`. Si el catálogo está
    vacío, baja solo los encabezados → sirve de **plantilla**.

- **`POST /api/inventory/products/import/`**
  - `MultiPartParser`; recibe el archivo en el campo `file`.
  - Procesa fila por fila (best-effort) y responde JSON:
    ```json
    {
      "creados": 12,
      "saltados": 3,
      "errores": [
        {"fila": 4, "sku": "BQ-9", "motivo": "El SKU ya existe."},
        {"fila": 7, "sku": "", "motivo": "El nombre es obligatorio."}
      ]
    }
    ```
  - `fila` es el número de fila del CSV contando el encabezado (la primera fila de datos
    es la fila 2), para que el usuario la ubique fácil en Excel.

### Columnas del CSV (import + export)

| Columna           | Obligatoria | Notas |
|-------------------|-------------|-------|
| `sku`             | no          | Si va vacío se autogenera `SKU-NNNNNN` (mismo patrón que compras). Si viene y ya existe → fila saltada. |
| `nombre`          | **sí**      | Sin nombre → fila inválida. |
| `descripcion`     | no          | |
| `codigo_barras`   | no          | |
| `categoria`       | no          | Por nombre; se crea si no existe. Vacío → sin categoría. |
| `marca`           | no          | |
| `modelo`          | no          | |
| `unidad`          | no          | unidad de medida |
| `ubicacion`       | no          | |
| `stock_inicial`   | no          | Decimal ≥ 0, default 0. Genera movimiento de apertura si > 0. |
| `stock_minimo`    | no          | Decimal ≥ 0, default 0. |
| `costo`           | no          | Decimal ≥ 0, default 0. Es el `average_cost` / `unit_cost` del movimiento de apertura. |
| `precio_venta`    | no          | Si viene, se respeta (precio manual). Si vacío, se calcula del margen efectivo. |
| `margen_%`        | no          | `default_margin_percentage` del producto. Default 0. |
| `proveedor`       | no          | Por nombre; se crea si no existe. Vacío → sin proveedor principal. |
| `activo`          | no          | "sí/no", "true/false", "1/0". Default sí. |

Columnas solo-lectura en export (ignoradas en import): `reservado`, `disponible`.
Columnas desconocidas en el archivo se ignoran.

### Lógica de import (por fila)

1. Parsear/normalizar la fila. Si falta `nombre` → error "El nombre es obligatorio.".
2. Si `sku` viene y ya existe un `Product` con ese SKU → saltar ("El SKU ya existe.").
3. Resolver `categoria` (get_or_create por nombre, case-insensitive trim) y `proveedor`
   (get_or_create por nombre) si vienen.
4. Validar/convertir números (`stock_inicial`, `stock_minimo`, `costo`, `precio_venta`,
   `margen_%`). Número mal escrito → error con el nombre de la columna.
5. Crear el `Product` (stock_quantity = 0 de entrada; el stock entra por el movimiento):
   - `average_cost = costo`, `last_purchase_cost = costo`.
   - Si `precio_venta` vino, setearlo; si no, calcularlo con la lógica de margen efectivo
     existente (`apply_margin`).
6. Si `stock_inicial > 0`: generar un movimiento de apertura reutilizando el servicio de
   ajustes (`apply_adjustment(product, "adjustment_in", stock_inicial, unit_cost=costo,
   notes="Carga inicial", user=request.user)`), que ya sube el stock atómicamente y deja
   rastro en el kardex. (Con stock 0 no se crea movimiento.)
7. Contar como creado.

Cada fila se procesa de forma independiente; un error en una no afecta a las demás
(best-effort). El alta de cada producto + su movimiento va en su propia transacción para
que una fila que falle a media no deje un producto sin su movimiento.

### Servicio

La lógica de parseo/alta vive en `apps/inventory/import_export.py` (no en la vista):
- `export_products_csv() -> str|bytes` (genera el contenido).
- `import_products_csv(file, user) -> dict` (devuelve el resumen).

Así la vista queda delgada y la lógica es testeable sin HTTP.

## Frontend (`features/inventory`)

En la barra de herramientas de `InventoryPage` (lista de productos), dos botones:

- **"Exportar CSV"** → descarga con **fetch autenticado** (el endpoint exige JWT; no sirve
  `window.open`), creando un blob y disparando la descarga. Mismo patrón que el PDF de
  facturas (`features/billing/documents.ts`).
- **"Importar CSV"** → abre `ImportModal`:
  - Selector de archivo (`.csv`) + enlace "descargar plantilla" (llama al export).
  - Al subir, `POST` multipart; muestra el resumen: **creados**, **saltados**, y una tabla
    de **errores** (fila · SKU · motivo). Botón "Cerrar" invalida `['products']` para
    refrescar la lista.

Hooks nuevos en `features/inventory/api.ts`: `useExportProducts()` (descarga) y
`useImportProducts()` (mutación multipart, como la subida de fotos del móvil:
`fetch` + `FormData` + Bearer, porque openapi-fetch no maneja bien multipart).

## Pruebas

**Backend** (pytest):
- Export con productos → CSV con BOM, encabezados correctos y una fila por producto.
- Import feliz → crea productos, crea categoría y proveedor nuevos, y genera el movimiento
  de apertura (stock e `InventoryMovement` correctos).
- Import mixto → filas válidas entran; fila sin nombre y fila con número inválido se
  reportan en `errores`; el resto se crea.
- SKU duplicado (ya existe en BD) → fila en `saltados` con motivo, producto no duplicado.
- `precio_venta` vacío → precio calculado del margen; `precio_venta` presente → respetado.

**Frontend** (Vitest):
- typecheck.
- Test del `ImportModal`: dado un resumen simulado, renderiza creados/saltados y la tabla
  de errores.

## Fuera de alcance (follow-ups)

- Modo **upsert** ("actualizar existentes" por SKU) con checkbox explícito.
- Equipos compatibles (M2M `compatible_equipment_types`) en el CSV.
- Import/export de inventario en la **app móvil** (esto es solo web).
- Excel (.xlsx) nativo; hoy CSV (Excel lo abre igual).
