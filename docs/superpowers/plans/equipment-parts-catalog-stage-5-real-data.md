# Catálogo técnico — Etapa 5: Datos reales del DJI Agras T50

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el árbol genérico sembrado del T50 por su **estructura real** (12 categorías del Excel del usuario) e importar las **337 piezas reales** (SKU + número OEM + nombre) con sus compatibilidades, más un campo `part_number` en `Product` y el diagrama SVG del T50 remapeado a las categorías reales.

**Architecture:** Un comando `manage.py import_agras_t50_parts <ruta.xlsx>` lee la hoja maestra *"T50 Todas las Partes"* con openpyxl y hace *upsert* idempotente por SKU de: 12 componentes (planos, bajo el modelo T50, con códigos estables), 337 productos (`sku`/`part_number`/`name`) y 337 `ProductCompatibility`. El seed deja de sembrar el árbol genérico del T50 (el importador es la fuente de verdad); el D12500iE se mantiene. El diagrama SVG del T50 se redibuja con zonas = las 12 categorías reales.

**Tech Stack:** Django 5.1, DRF, PostgreSQL, openpyxl (nuevo), React 19 + Mantine 9, pytest, Vitest.

## Global Constraints

- Backend en Docker; tests `docker compose exec backend pytest <ruta>` desde la raíz `C:\Users\victo\Proyectos\VerAgro-ERP`. Frontend `docker compose exec frontend ...`. Contenedores arriba: `docker compose up -d`.
- Migraciones aditivas: `part_number` es opcional (`blank=True, default=""`); no rompe datos.
- El Excel real vive en `data/catalogo/Agras T50 Repuestos.xlsx` (22 MB, gitignored — NO commitear). El importador recibe la ruta por argumento.
- **No inventar** números OEM: si una fila no trae `Numero de Pieza`, el producto queda con `part_number=""`.
- Mapeo Categoría→componente por diccionario explícito (case-insensitive, trim). Categoría no mapeada → se crea con code slugificado y se avisa por stdout.
- Rama `V3.0`. Commits en español, imperativo, footer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Spec: `docs/superpowers/specs/equipment-parts-catalog.md`. Estructura del Excel: hoja `T50 Todas las Partes`, columnas `SKU | Numero de Pieza | Nombre de Pieza | Modelo | Categoria` (337 filas, SKU único T50-001…, 12 categorías).

### Contrato compartido — las 12 categorías del T50 (Excel → code → nombre)

Usar EXACTAMENTE este mapeo en el importador (clave = string del Excel, normalizado a minúsculas y sin espacios extremos):

```
"protector frontal"       -> ("protector_frontal",   "Protector frontal")
"m1-m2 brazos"            -> ("brazos_m1_m2",        "Brazos M1-M2")
"m3-m4 brazo"             -> ("brazos_m3_m4",        "Brazos M3-M4")
"chasis frontal"          -> ("chasis_frontal",      "Chasis frontal")
"chasis intermedio"       -> ("chasis_intermedio",   "Chasis intermedio")
"chasis trasero"          -> ("chasis_trasero",      "Chasis trasero")
"tren de aterrizaje"      -> ("tren_aterrizaje",     "Tren de aterrizaje")
"cableado de chasis"      -> ("cableado_chasis",     "Cableado de chasis")
"modulo de distribucion"  -> ("modulo_distribucion", "Módulo de distribución")
"tanque de fumigacion"    -> ("tanque_fumigacion",   "Tanque de fumigación")
"sistema centrifugo"      -> ("sistema_centrifugo",  "Sistema centrífugo")
"helices"                 -> ("helices",             "Hélices")
```

`diagram_key = code` para cada uno.

---

### Task 1: Campo `Product.part_number` + exponerlo en el despiece

**Files:**
- Modify: `backend/apps/inventory/models.py`
- Modify: `backend/apps/service_orders/views.py` (payload de `compatible-products`)
- Modify: `frontend/src/features/service-orders/despieceTypes.ts` (tipo `CompatibleProduct`)
- Modify: `frontend/src/features/service-orders/components/CompatibleProductsPanel.tsx`
- Create: `backend/apps/inventory/tests/test_part_number.py`
- Migration: autogenerada

**Interfaces:**
- Produces: `Product.part_number` (CharField blank); el endpoint `compatible-products` incluye `part_number` en cada producto; la tarjeta del panel lo muestra (mono) cuando existe.

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/apps/inventory/tests/test_part_number.py`:

```python
import pytest
from apps.inventory.models import Product


@pytest.mark.django_db
def test_product_part_number_optional_default_blank():
    p = Product.objects.create(sku="PN-1", name="Pieza")
    assert p.part_number == ""
    p2 = Product.objects.create(sku="PN-2", name="Pieza OEM", part_number="YC.JG.MY001043")
    assert p2.part_number == "YC.JG.MY001043"
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `docker compose exec backend pytest apps/inventory/tests/test_part_number.py -v`
Expected: FAIL (`part_number` no existe).

- [ ] **Step 3: Agregar el campo**

En `backend/apps/inventory/models.py`, en `Product`, tras `barcode`:

```python
    part_number = models.CharField(max_length=100, blank=True, default="")
```

- [ ] **Step 4: Migración**

Run: `docker compose exec backend python manage.py makemigrations inventory`
Run: `docker compose exec backend python manage.py migrate`

- [ ] **Step 5: Exponer en el payload de compatible-products**

En `backend/apps/service_orders/views.py`, en la acción `compatible_products`, dentro del dict por producto (junto a `"sku"`), agregar:

```python
                "part_number": c.product.part_number,
```

- [ ] **Step 6: Frontend — tipo y tarjeta**

En `frontend/src/features/service-orders/despieceTypes.ts`, en `CompatibleProduct`, agregar `part_number: string;`.

En `frontend/src/features/service-orders/components/CompatibleProductsPanel.tsx`, en `ProductRow`, bajo la línea de datos (`Disp. … Ubic. …`), agregar el número OEM si existe:

```tsx
          {product.part_number && (
            <Text size="xs" c="dimmed" ff="monospace">
              N.º pieza: {product.part_number}
            </Text>
          )}
```

- [ ] **Step 7: Verificar**

Run: `docker compose exec backend pytest apps/inventory/tests/test_part_number.py -v` → PASS.
Run: `docker compose exec frontend npm run typecheck` → PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/apps/inventory/models.py backend/apps/inventory/migrations/ backend/apps/service_orders/views.py backend/apps/inventory/tests/test_part_number.py frontend/src/features/service-orders/despieceTypes.ts frontend/src/features/service-orders/components/CompatibleProductsPanel.tsx
git commit -m "feat(inventory): agrega part_number (OEM) al producto y al despiece

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: El seed deja de sembrar el árbol genérico del T50

**Files:**
- Modify: `backend/apps/equipment/management/commands/seed_equipment_catalog.py`
- Modify: `backend/apps/equipment/tests/test_seed_catalog.py`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `seed_equipment_catalog` crea el modelo T50 (sin componentes) y el D12500iE con su árbol. El árbol del T50 pasa a venir del importador (Task 3). Idempotente.

- [ ] **Step 1: Ajustar el test del seed**

En `backend/apps/equipment/tests/test_seed_catalog.py`, `test_seed_creates_both_models_and_trees`: quitar las aserciones sobre los componentes del T50 (roots `propulsion/spray/...` y `motor_m1`). Dejar que verifique: existe el modelo T50 (`model_code="T50"`, `name="DJI Agras T50"`), existe el modelo D12500iE **con** su árbol (`code="engine"` presente), y que el T50 **no** tiene componentes tras el seed:

```python
    assert not EquipmentComponent.objects.filter(equipment_model=t50).exists()
```

Mantener `test_seed_is_idempotent` (sigue válido).

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `docker compose exec backend pytest apps/equipment/tests/test_seed_catalog.py -v`
Expected: FAIL (el seed aún crea el árbol genérico del T50).

- [ ] **Step 3: Quitar el árbol genérico del T50 del comando**

En `backend/apps/equipment/management/commands/seed_equipment_catalog.py`:
- Eliminar la constante `T50_TREE` (todo el literal) y la llamada `_build(t50, T50_TREE)`.
- Conservar la creación del `EquipmentModel` T50 (`get_or_create` por brand/model_code) y todo lo del D12500iE (`D12500_TREE` + `_build(d125, D12500_TREE)`).
- Ajustar el mensaje final a algo como `"Modelos sembrados (T50 sin árbol: usar import_agras_t50_parts; D12500iE con árbol)."`.

- [ ] **Step 4: Correr los tests**

Run: `docker compose exec backend pytest apps/equipment/tests/test_seed_catalog.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/equipment/management/commands/seed_equipment_catalog.py backend/apps/equipment/tests/test_seed_catalog.py
git commit -m "refactor(equipment): el seed ya no genera el árbol genérico del T50 (viene del importador)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Importador `import_agras_t50_parts`

**Files:**
- Modify: `backend/requirements.txt` (agregar `openpyxl`)
- Create: `backend/apps/equipment/management/commands/import_agras_t50_parts.py`
- Create: `backend/apps/equipment/tests/test_import_t50.py`

**Interfaces:**
- Consumes: `EquipmentModel` (T50), `EquipmentComponent`, `inventory.Product`, `inventory.ProductCompatibility`.
- Produces: comando `manage.py import_agras_t50_parts <ruta.xlsx>` idempotente: crea/actualiza los 12 componentes (planos, code del contrato), 337 `Product` (sku, part_number, name), y una `ProductCompatibility` por fila (product↔T50↔componente). Reejecutable por SKU sin duplicar. Reporta conteos por stdout.

- [ ] **Step 1: Agregar openpyxl a requirements y reconstruir**

En `backend/requirements.txt` agregar una línea `openpyxl==3.1.5`.
Run: `docker compose build backend && docker compose up -d backend`
Expected: imagen reconstruida con openpyxl.

- [ ] **Step 2: Escribir los tests que fallan**

Crear `backend/apps/equipment/tests/test_import_t50.py`. Genera un xlsx mínimo en un tmp_path con la hoja maestra y prueba el import:

```python
import pytest
from django.core.management import call_command
from openpyxl import Workbook

from apps.equipment.models import EquipmentType, EquipmentModel, EquipmentComponent
from apps.inventory.models import Product, ProductCompatibility


def _make_xlsx(path):
    wb = Workbook()
    ws = wb.active
    ws.title = "T50 Todas las Partes"
    ws.append(["SKU", "Numero de Pieza", "Nombre de Pieza", "Modelo", "Categoria"])
    ws.append(["T50-001", "BC.AG.SS000543", "Impeller Pump Motor", "Agras T50", "Tanque de Fumigacion"])
    ws.append(["T50-002", "YC.WJ.L00870", "Screw M30", "Agras T50", "Tanque de Fumigacion"])
    ws.append(["T50-003", "YC.JG.ZS005016", "Upper Propeller (CCW)", "Agras T50", "Helices"])
    ws.append(["T50-004", "", "Sin OEM", "Agras T50", "M1-M2 Brazos"])
    wb.save(path)


@pytest.fixture
def t50(db):
    t, _ = EquipmentType.objects.get_or_create(name="Drone agrícola")
    return EquipmentModel.objects.create(
        equipment_type=t, brand="DJI", name="DJI Agras T50", model_code="T50"
    )


@pytest.mark.django_db
def test_import_creates_components_products_compatibilities(t50, tmp_path):
    xlsx = tmp_path / "t50.xlsx"
    _make_xlsx(str(xlsx))
    call_command("import_agras_t50_parts", str(xlsx))

    # Componentes por categoría (planos, bajo el T50)
    codes = set(
        EquipmentComponent.objects.filter(equipment_model=t50).values_list("code", flat=True)
    )
    assert {"tanque_fumigacion", "helices", "brazos_m1_m2"} <= codes
    # Productos
    p = Product.objects.get(sku="T50-001")
    assert p.name == "Impeller Pump Motor"
    assert p.part_number == "BC.AG.SS000543"
    # Sin OEM → part_number vacío
    assert Product.objects.get(sku="T50-004").part_number == ""
    # Compatibilidad al componente correcto
    comp = EquipmentComponent.objects.get(equipment_model=t50, code="tanque_fumigacion")
    assert ProductCompatibility.objects.filter(product=p, equipment_model=t50, component=comp).exists()
    assert ProductCompatibility.objects.count() == 4


@pytest.mark.django_db
def test_import_is_idempotent(t50, tmp_path):
    xlsx = tmp_path / "t50.xlsx"
    _make_xlsx(str(xlsx))
    call_command("import_agras_t50_parts", str(xlsx))
    n_comp = EquipmentComponent.objects.count()
    n_prod = Product.objects.count()
    n_compat = ProductCompatibility.objects.count()
    call_command("import_agras_t50_parts", str(xlsx))  # 2ª vez
    assert EquipmentComponent.objects.count() == n_comp
    assert Product.objects.count() == n_prod
    assert ProductCompatibility.objects.count() == n_compat


@pytest.mark.django_db
def test_import_requires_model(tmp_path):
    # Sin el modelo T50 sembrado, el comando falla claro.
    from django.core.management.base import CommandError
    xlsx = tmp_path / "t50.xlsx"
    _make_xlsx(str(xlsx))
    with pytest.raises(CommandError):
        call_command("import_agras_t50_parts", str(xlsx))
```

- [ ] **Step 3: Correr los tests para verificar que fallan**

Run: `docker compose exec backend pytest apps/equipment/tests/test_import_t50.py -v`
Expected: FAIL (CommandError: Unknown command).

- [ ] **Step 4: Implementar el comando**

Crear `backend/apps/equipment/management/commands/import_agras_t50_parts.py`:

```python
"""Importa los repuestos reales del DJI Agras T50 desde el Excel maestro.

Idempotente (upsert por SKU). Crea los 12 componentes (planos, bajo el modelo
T50), los productos (sku/part_number/name) y una ProductCompatibility por fila.
NO inventa números OEM: si la fila no trae 'Numero de Pieza', part_number queda vacío.
"""
import re

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from openpyxl import load_workbook

from apps.equipment.models import EquipmentModel, EquipmentComponent
from apps.inventory.models import Product, ProductCompatibility

SHEET = "T50 Todas las Partes"

# Excel (normalizado) -> (code, nombre visible)
CATEGORY_MAP = {
    "protector frontal": ("protector_frontal", "Protector frontal"),
    "m1-m2 brazos": ("brazos_m1_m2", "Brazos M1-M2"),
    "m3-m4 brazo": ("brazos_m3_m4", "Brazos M3-M4"),
    "chasis frontal": ("chasis_frontal", "Chasis frontal"),
    "chasis intermedio": ("chasis_intermedio", "Chasis intermedio"),
    "chasis trasero": ("chasis_trasero", "Chasis trasero"),
    "tren de aterrizaje": ("tren_aterrizaje", "Tren de aterrizaje"),
    "cableado de chasis": ("cableado_chasis", "Cableado de chasis"),
    "modulo de distribucion": ("modulo_distribucion", "Módulo de distribución"),
    "tanque de fumigacion": ("tanque_fumigacion", "Tanque de fumigación"),
    "sistema centrifugo": ("sistema_centrifugo", "Sistema centrífugo"),
    "helices": ("helices", "Hélices"),
}


def _slug(text):
    return re.sub(r"[^a-z0-9]+", "_", text.strip().lower()).strip("_")


class Command(BaseCommand):
    help = "Importa los repuestos reales del DJI Agras T50 desde el Excel maestro."

    def add_arguments(self, parser):
        parser.add_argument("xlsx", help="Ruta al archivo .xlsx")

    @transaction.atomic
    def handle(self, *args, **options):
        try:
            model = EquipmentModel.objects.get(model_code="T50")
        except EquipmentModel.DoesNotExist:
            raise CommandError(
                "No existe el modelo técnico T50. Corre primero seed_equipment_catalog."
            )

        wb = load_workbook(options["xlsx"], read_only=True, data_only=True)
        if SHEET not in wb.sheetnames:
            raise CommandError(f"El archivo no tiene la hoja '{SHEET}'.")
        ws = wb[SHEET]

        comp_cache = {}   # code -> EquipmentComponent
        n_comp = n_prod = n_compat = 0
        order = 0

        def get_component(categoria):
            nonlocal n_comp, order
            key = (categoria or "").strip().lower()
            if key in CATEGORY_MAP:
                code, name = CATEGORY_MAP[key]
            else:
                code, name = _slug(categoria or "sin_categoria"), (categoria or "Sin categoría")
                self.stdout.write(self.style.WARNING(f"Categoría no mapeada: {categoria!r} -> {code}"))
            if code not in comp_cache:
                comp, created = EquipmentComponent.objects.get_or_create(
                    equipment_model=model,
                    code=code,
                    defaults={
                        "name": name,
                        "component_type": EquipmentComponent.ComponentType.ASSEMBLY,
                        "diagram_key": code,
                        "sort_order": order,
                    },
                )
                order += 1
                if created:
                    n_comp += 1
                comp_cache[code] = comp
            return comp_cache[code]

        rows = ws.iter_rows(min_row=2, values_only=True)
        for row in rows:
            if not row or all(v in (None, "") for v in row[:5]):
                continue
            sku = (str(row[0]).strip() if row[0] is not None else "")
            part_number = (str(row[1]).strip() if row[1] is not None else "")
            name = (str(row[2]).strip() if row[2] is not None else "")
            categoria = row[4] if len(row) > 4 else None
            if not sku or not name:
                continue

            component = get_component(categoria)
            product, created = Product.objects.get_or_create(
                sku=sku,
                defaults={"name": name, "part_number": part_number},
            )
            if not created:
                changed = False
                if product.name != name:
                    product.name = name; changed = True
                if product.part_number != part_number:
                    product.part_number = part_number; changed = True
                if changed:
                    product.save(update_fields=["name", "part_number", "updated_at"])
            else:
                n_prod += 1

            _, c_created = ProductCompatibility.objects.get_or_create(
                product=product, equipment_model=model, component=component
            )
            if c_created:
                n_compat += 1

        self.stdout.write(self.style.SUCCESS(
            f"Import T50 OK: {n_comp} componentes, {n_prod} productos, {n_compat} compatibilidades nuevas."
        ))
```

- [ ] **Step 5: Correr los tests**

Run: `docker compose exec backend pytest apps/equipment/tests/test_import_t50.py -v`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/requirements.txt backend/apps/equipment/management/commands/import_agras_t50_parts.py backend/apps/equipment/tests/test_import_t50.py
git commit -m "feat(equipment): importador idempotente de repuestos reales del T50 (xlsx)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Remapear el diagrama SVG del T50 a las 12 categorías

**Files:**
- Modify: `frontend/src/features/service-orders/components/EquipmentDiagram.tsx`
- Modify: `frontend/src/features/service-orders/components/EquipmentDiagram.test.tsx`

**Interfaces:**
- Consumes: nada de red.
- Produces: el diagrama del T50 tiene zonas cuyos `data-key` son los 12 códigos reales (`protector_frontal`, `brazos_m1_m2`, `brazos_m3_m4`, `chasis_frontal`, `chasis_intermedio`, `chasis_trasero`, `tren_aterrizaje`, `cableado_chasis`, `modulo_distribucion`, `tanque_fumigacion`, `sistema_centrifugo`, `helices`). Vista superior esquemática original; zonas accesibles (role/tabIndex/aria-label/aria-pressed/teclado) como ya estaban.

- [ ] **Step 1: Ajustar el test**

En `frontend/src/features/service-orders/components/EquipmentDiagram.test.tsx`, actualizar las aserciones del T50 a las zonas reales: p. ej. clic en la zona **Tanque de fumigación** llama `onZoneSelect("tanque_fumigacion")`; `selectedKeys={new Set(["brazos_m1_m2"])}` marca esa zona con `aria-pressed="true"`; Enter en **Hélices** → `onZoneSelect("helices")`. Mantener el test del modelo sin diagrama.

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `docker compose exec frontend npx vitest run src/features/service-orders/components/EquipmentDiagram.test.tsx`
Expected: FAIL (las zonas viejas `arm_m1`/`spray` ya no existen con esos keys reales).

- [ ] **Step 3: Redibujar el `T50Diagram`**

Reemplazar la función `T50Diagram` en `EquipmentDiagram.tsx` por una vista superior esquemática cuyas zonas sean las 12 categorías reales. Mantener el helper `Zone`, `ZONE_CSS` y el resto del archivo. Layout sugerido (viewBox `0 0 380 380`, todo con `className="zone-fill"` y `<text>` mono con el nombre corto):

- **`protector_frontal`**: arco/rect en el frente (arriba-centro).
- **`brazos_m1_m2`** y **`brazos_m3_m4`**: dos grupos de brazos a izquierda y derecha (líneas diagonales + círculos de motor); M1-M2 a un lado, M3-M4 al otro.
- **`helices`**: anillos/aspas en las puntas de los brazos (o una zona propia junto a los motores).
- **`sistema_centrifugo`**: rect bajo el tanque.
- **`tanque_fumigacion`**: rect grande central.
- **`chasis_frontal` / `chasis_intermedio` / `chasis_trasero`**: tres bandas del cuerpo central (frontal arriba, intermedio medio, trasero abajo).
- **`modulo_distribucion`**: rect pequeño en el cuerpo.
- **`cableado_chasis`**: línea/rect fino cruzando el cuerpo.
- **`tren_aterrizaje`**: dos arcos/patas bajo el cuerpo.

Cada zona = un `<Zone zoneKey=... label=...>` con sus formas. **Ampliar el área clicable**: cada zona debe incluir una forma con relleno real (rect/circle/path) suficientemente grande — no solo líneas finas — para que el clic registre en toda la zona (corrige el follow-up del hit-area fino). Ejemplo de patrón por zona:

```tsx
      <Zone zoneKey="tanque_fumigacion" label="Tanque de fumigación" {...props}>
        <rect x={150} y={150} width={80} height={70} rx={10} className="zone-fill" />
        <text x={190} y={188} textAnchor="middle">TANQUE</text>
      </Zone>
```

(Los `label` deben ser legibles: "Protector frontal", "Brazos M1-M2", "Brazos M3-M4", "Chasis frontal", "Chasis intermedio", "Chasis trasero", "Tren de aterrizaje", "Cableado de chasis", "Módulo de distribución", "Tanque de fumigación", "Sistema centrífugo", "Hélices".)

- [ ] **Step 4: Correr el test**

Run: `docker compose exec frontend npx vitest run src/features/service-orders/components/EquipmentDiagram.test.tsx`
Expected: PASS. Ajustar queries mínimas si hace falta (role button por `aria-label`), sin debilitar aserciones.

- [ ] **Step 5: Typecheck + lint + commit**

Run: `docker compose exec frontend npm run typecheck` → PASS. `npm run lint` → sin errores nuevos.

```bash
git add frontend/src/features/service-orders/components/EquipmentDiagram.tsx frontend/src/features/service-orders/components/EquipmentDiagram.test.tsx
git commit -m "feat(service-orders): remapea el diagrama del T50 a las 12 categorías reales

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Verificación — import real + regresión + navegador

**Files:** ninguno (verificación; incluye limpieza de datos demo en dev).

- [ ] **Step 1: Regenerar tipos OpenAPI (part_number en el schema)**

Run: `docker compose restart backend && sleep 4`
Run: `docker compose exec frontend npx openapi-typescript http://backend:8000/api/schema/ -o src/lib/api/schema.d.ts`
Commit si cambió: `git add frontend/src/lib/api/schema.d.ts && git commit -m "chore(api): regenera tipos OpenAPI con part_number"` (footer estándar).

- [ ] **Step 2: Limpiar el árbol genérico previo del T50 en dev y cargar datos reales**

Los componentes genéricos sembrados antes (propulsion/arm_m1/…) y sus compatibilidades demo siguen en la BD de dev. Limpiarlos y correr seed + import:

```bash
docker compose exec -T backend python manage.py shell -c "
from apps.equipment.models import EquipmentModel, EquipmentComponent
t50 = EquipmentModel.objects.filter(model_code='T50').first()
if t50:
    EquipmentComponent.objects.filter(equipment_model=t50).delete()  # cascade a ProductCompatibility
    print('componentes T50 previos eliminados')
"
docker compose exec -T backend python manage.py seed_equipment_catalog
docker compose exec -T backend python manage.py import_agras_t50_parts "/app/../data/catalogo/Agras T50 Repuestos.xlsx"
```

(El contenedor monta `./backend` en `/app`; `data/` NO está montado. Copiar el xlsx a una ruta montada antes de importar: `cp "data/catalogo/Agras T50 Repuestos.xlsx" backend/_t50.xlsx` y usar `/app/_t50.xlsx`, luego `rm backend/_t50.xlsx`.)
Expected: "Import T50 OK: 12 componentes, 337 productos, 337 compatibilidades nuevas."

- [ ] **Step 3: Regresión backend + frontend**

Run: `docker compose exec backend pytest apps/equipment apps/inventory apps/service_orders -q` → PASS.
Run: `docker compose exec frontend npx vitest run` → PASS.
Run: `docker compose exec frontend npm run build` → OK.

- [ ] **Step 4: Verificación en navegador**

Con el frontend reiniciado (Windows/HMR): `docker compose restart frontend`. Abrir la orden **OS-000027** (Agras T50) → pestaña **Despiece**: el árbol muestra las 12 categorías reales; clic en **Tanque de fumigación** → aparecen sus ~54 piezas reales (incl. *Impeller Pump Motor*) con su número OEM; el diagrama resalta la zona correcta. Confirmar responsive.

Nota: la orden demo tenía compatibilidades al viejo `motor_m1` (eliminado); sus piezas demo (DEMO-*) ya no aplican. Se puede re-sembrar una compatibilidad demo o usar directamente las reales.

Si algo falla, reportar antes de cerrar la etapa.

## Notas / decisiones

- **El importador es la fuente de verdad del árbol del T50** (12 categorías planas reales); el seed solo garantiza el modelo. El D12500iE sigue con su árbol sembrado (aún sin datos reales).
- **`data/catalogo/*.xlsx` gitignored** (binario grande con imágenes). Agregar `data/catalogo/*.xlsx` a `.gitignore` si no está.
- **Imágenes de piezas**: las hojas de detalle del Excel las traen embebidas; su ingesta (attach por `part_number`) queda como follow-up.
- **D12500iE**: cuando el usuario pase su Excel, se replica el patrón (un importador análogo o uno genérico parametrizado por modelo).
- El hit-area amplio del diagrama (Task 4) **cierra el follow-up** del clic fino en zonas.
