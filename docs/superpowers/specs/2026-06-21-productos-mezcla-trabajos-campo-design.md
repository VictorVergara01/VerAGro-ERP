# Productos y calculadora de mezcla por dosis/hectárea — Diseño

**Fecha:** 2026-06-21
**Estado:** Aprobado por el usuario; listo para plan de implementación.
**Alcance:** Backend (`field_jobs`: modelo de productos + cálculo) · Frontend web · App móvil. Se hace por fases (backend → web → móvil), cada una con su plan.

---

## 1. Contexto y problema

En fumigación con drones se aplican **varios productos** (medicamentos/químicos) por trabajo,
cada uno con su **dosis por hectárea**, y a veces son **líquidos** y a veces **granulados**.
Hoy el `FieldJob` tiene un solo campo de texto `applied_product` y la calculadora de mezcla
actual trabaja por "dosis por litro", que no es como el piloto piensa.

Se quiere: cargar una **lista de productos con dosis/ha**, y que el sistema calcule cuánto
**químico líquido** y cuánta **agua** por tanque (mixer de **200 L** por defecto, editable),
más los **granulados** aparte.

Decisiones acordadas:
- El **caldo por hectárea** (litros de mezcla rociados por ha) lo ingresa el usuario.
- **Agua = caldo total − químico líquido.** Los **granulados van aparte** (no restan agua).
- El campo `technician` de los trabajos se muestra como **"Piloto"** (ya aplicado en un commit previo).

## 2. Modelo de datos (backend `apps/field_jobs/`)

### 2.1 Nuevo modelo `FieldJobProduct`

Hereda `TimeStampedModel`.

| Campo | Tipo | Notas |
|---|---|---|
| `field_job` | FK `FieldJob`, CASCADE, `related_name="products"` | |
| `name` | `CharField(150)` | Nombre del producto/medicamento |
| `dose_per_hectare` | `Decimal(10,4)` | Dosis por hectárea |
| `unit` | `CharField(10)` choices | `L/ha`, `mL/ha`, `cc/ha` (líquidos); `kg/ha`, `g/ha` (sólidos) |

`Meta.ordering = ("id",)`.

Clasificación líquido/sólido por unidad: líquidas = `L/ha, mL/ha, cc/ha`; sólidas = `kg/ha, g/ha`.

### 2.2 Reutilización de campos existentes en `FieldJob`

- `water_per_hectare` pasa a significar **"Caldo/ha (L)"** (solo relabel en UI; el nombre del
  campo no cambia, sin migración).
- `tank_volume_liters` = capacidad del tanque/mixer (default UI **200**).
- `applied_product` (texto único) queda **legacy**: se quita del formulario; en el detalle se
  muestra solo si un trabajo antiguo lo tiene. No se borra la columna (sin migración destructiva).

### 2.3 `CompanyProfile.drone_tank_volume_liters`

Cambiar el default de `30` a **`200`** (migración de alteración de default). Editable en
Configuración → Empresa como hoy.

## 3. Cálculo de mezcla

Función pura en `apps/field_jobs/services.py` que **reemplaza** la actual `calculate_spray_mix`
(modelo "dosis por litro") por el modelo "dosis por hectárea":

```
calculate_mix(*, hectares, caldo_per_hectare, tank_volume_liters, products) -> dict
  products: [{"name", "dose_per_hectare", "unit"}]
```

### 3.1 Lógica

Conversión a base: líquidos → **litros** (`L/ha`=×1, `mL/ha`=÷1000, `cc/ha`=÷1000);
sólidos → **kilogramos** (`kg/ha`=×1, `g/ha`=÷1000).

```
total_caldo        = hectares × caldo_per_hectare           # litros de mezcla
por producto:
  total            = dose_per_hectare × hectares            # en su unidad
  total_base       = convertido a L (líquido) o kg (sólido)
liquid_chemical_L  = Σ total_base de productos líquidos
water_L            = max(0, total_caldo − liquid_chemical_L)
tanks_needed       = ceil(total_caldo / tank_volume_liters)
full_tanks         = tanks completos de capacidad
last_tank_liters   = total_caldo − full_tanks × tank_volume_liters   # 0 si exacto
# Reparto por tanque (proporcional al volumen del tanque sobre el caldo total):
por tanque completo (fracción = tank_volume_liters / total_caldo):
  cada producto    = total_base × fracción
  agua             = tank_volume_liters − Σ(líquidos del tanque)
último tanque parcial (fracción = last_tank_liters / total_caldo): idem
```

### 3.2 Respuesta

```
{
  "total_caldo_liters", "liquid_chemical_liters", "water_liters",
  "tanks_needed", "full_tanks", "last_tank_liters",
  "products_total": [{"name", "quantity", "unit"}],   # totales del trabajo (L o kg)
  "per_full_tank":  [{"name", "quantity", "unit"}],   # carga de un tanque completo
  "water_per_full_tank",
  "last_tank":      [{"name", "quantity", "unit"}],   # carga del tanque parcial (si hay)
  "water_last_tank"
}
```

`quantity` se reporta en **L** (líquidos) o **kg** (sólidos), redondeado a 3 decimales; `unit`
es `"L"` o `"kg"`. Si hay un solo tanque (caldo ≤ capacidad), `full_tanks=0` y todo va en
`last_tank` (= los totales).

### 3.3 Ejemplo (multi-tanque)

50 ha · caldo 8 L/ha · tanque 200 L · productos: Glifosato 1.5 L/ha, Coadyuvante 200 mL/ha,
Urea 2 kg/ha.
- total_caldo = 400 L → **2 tanques completos**, sin parcial.
- Totales: Glifosato 75 L, Coadyuvante 10 L, Urea 100 kg.
- Químico líquido = 85 L → **Agua = 400 − 85 = 315 L**.
- Por tanque (200 L, fracción 0.5): Glifosato 37.5 L, Coadyuvante 5 L, Urea 50 kg, **Agua 157.5 L**.

Caso chico (10 ha, caldo 8, tanque 200): total_caldo 80 → 1 tanque (parcial 80 L), agua 63 L
con Glifosato 15 L + Coadyuvante 2 L líquidos y Urea 20 kg aparte.

### 3.4 Endpoint

Revisar la acción existente `POST /api/field-jobs/calculate-mix/` al nuevo cuerpo:
`{hectares, caldo_per_hectare, tank_volume_liters, products:[{name, dose_per_hectare, unit}]}`.
Sigue sin requerir rol especial (solo autenticado). Validaciones: `hectares>0`,
`caldo_per_hectare>0`, `tank_volume_liters>0`, `products` no vacío, cada `dose_per_hectare>0`.

## 4. Serializer (escritura anidada de productos)

`FieldJobSerializer` gana un campo anidado **`products`** (`FieldJobProductSerializer`, many,
campos `id, name, dose_per_hectare, unit`). En `create`/`update` del serializer: tras guardar
el `FieldJob`, **reemplazar** el conjunto de productos por los enviados (borrar los existentes y
crear los nuevos; simple y suficiente para el volumen). El detalle (`GET`) devuelve `products`.

## 5. Frontend web (`features/field-jobs/`)

- **`FieldJobFormModal`**: quitar el `TextInput` "Producto aplicado"; agregar una **lista
  dinámica de productos** (filas: Nombre, Dosis/ha `NumberInput`, Unidad `Select` con las 5
  opciones) con "+ Agregar producto" y quitar por fila. Relabel "Agua/ha" → **"Caldo/ha (L)"**;
  "Tanque (L)" con prefill 200. El submit incluye `products`. El botón "Calcular mezcla" abre el
  modal con el nuevo desglose.
- **`SprayMixModal`** (web): reescribir al nuevo modelo (lee del trabajo: hectáreas, caldo/ha,
  tanque, productos; o entrada manual). Muestra: totales por producto, **químico líquido**,
  **agua**, **granulados**, nº de tanques, y **por tanque** (cada producto + agua para completar).
- **`FieldJobDetailPage`**: card "Productos aplicados" con la lista (nombre · dosis/ha · unidad).

## 6. App móvil (`features/field-jobs/`)

- **`FieldJobFormModal`** (móvil): misma lista dinámica de productos (usar `LineCard` +
  `AddRowButton` + `Picker` de unidad), relabel caldo/ha, tanque 200; submit con `products`.
- **`SprayCalculatorScreen`**: reescribir al nuevo modelo (dosis/ha, líquido/sólido, caldo/ha,
  tanque) con prefill del trabajo; mostrar el desglose por tanque.
- **`FieldJobDetailScreen`**: card de productos aplicados.

## 7. Tests

### 7.1 Backend (pytest)
- `calculate_mix`: el ejemplo multi-tanque (agua=caldo−líquido; granulado aparte en kg;
  reparto por tanque); caso de un solo tanque; conversión de unidades (mL/cc→L, g→kg);
  validaciones (400 en hectáreas/caldo/tanque ≤0, productos vacío, dosis≤0).
- Serializer anidado: crear un `FieldJob` con `products` los persiste; editar reemplaza la lista;
  el detalle devuelve `products`.
- `applied_product` legacy sigue aceptándose/mostrándose si viene.

### 7.2 Web (vitest)
- El form agrega/quita filas de producto; el modal de mezcla muestra el desglose (mock del hook).

### 7.3 Móvil
Sin framework de tests: `npm run typecheck` + verificación manual en Expo.

## 8. Fuera de alcance (follow-ups)

- Catálogo de productos reutilizable (hoy el nombre es texto libre por trabajo).
- Descuento de inventario por el químico aplicado.
- Persistir el resultado del cálculo (hoy se calcula on-demand; los productos sí se guardan).
- Conversión a unidades por acre u otras.
