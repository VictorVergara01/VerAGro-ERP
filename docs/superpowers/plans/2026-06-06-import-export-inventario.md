# Importar / Exportar inventario (CSV) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir cargar el catálogo de inventario desde un CSV (alta masiva, best-effort) y exportar el catálogo actual a CSV, desde el panel web.

**Architecture:** La lógica de CSV vive en un módulo nuevo `apps/inventory/import_export.py` (testeable sin HTTP); el `ProductViewSet` expone dos `@action` delgadas (`export` GET, `import` POST). El frontend agrega un helper de descarga autenticada y un modal de importación que muestra el resumen. El stock inicial entra por un movimiento de apertura (`adjustment_in`) reutilizando `apply_adjustment`, no escribiendo `stock_quantity` a mano.

**Tech Stack:** Django/DRF, módulo `csv` de la stdlib (sin deps nuevas), pytest. Frontend React + Mantine + Vitest.

**Spec:** `docs/superpowers/specs/2026-06-06-import-export-inventario-design.md`

---

## File Structure

**Backend (crear):**
- `backend/apps/inventory/import_export.py` — `export_products_csv()` e `import_products_csv(file, user)` + helpers de parseo.
- `backend/apps/inventory/tests/test_import_export.py` — tests del módulo y de los endpoints.

**Backend (modificar):**
- `backend/apps/inventory/views.py` — dos `@action` en `ProductViewSet`.

**Frontend (crear):**
- `frontend/src/features/inventory/importExport.ts` — `downloadProductsCsv()`, `useImportProducts()`, tipo `ImportResult`.
- `frontend/src/features/inventory/ImportSummary.tsx` — componente presentacional del resumen (creados/saltados/errores).
- `frontend/src/features/inventory/ImportModal.tsx` — modal con selector de archivo + plantilla + submit.
- `frontend/src/features/inventory/importExport.test.tsx` — test de `ImportSummary`.

**Frontend (modificar):**
- `frontend/src/features/inventory/InventoryPage.tsx` — botones "Exportar CSV" / "Importar CSV" en el header.

**Columnas del CSV (orden canónico, usado por import y export):**
`sku, nombre, descripcion, codigo_barras, categoria, marca, modelo, unidad, ubicacion, stock_inicial, stock_minimo, costo, precio_venta, margen_%, proveedor, activo`
Export agrega al final, solo-lectura: `reservado, disponible`.

---

## Task 1: Exportar catálogo a CSV (módulo)

**Files:**
- Create: `backend/apps/inventory/import_export.py`
- Test: `backend/apps/inventory/tests/test_import_export.py`

- [ ] **Step 1: Write the failing test**

Create `backend/apps/inventory/tests/test_import_export.py`:

```python
from decimal import Decimal

import pytest

from apps.inventory.import_export import export_products_csv
from apps.inventory.models import Product, ProductCategory
from apps.suppliers.models import Supplier


@pytest.mark.django_db
def test_export_has_bom_header_and_one_row_per_product():
    cat = ProductCategory.objects.create(name="Filtros")
    sup = Supplier.objects.create(name="DronesPanama")
    Product.objects.create(
        sku="BQ-1", name="Boquilla", category=cat, main_supplier=sup,
        stock_quantity=Decimal("5"), minimum_stock=Decimal("2"),
        average_cost=Decimal("10"), sale_price=Decimal("13"),
    )
    content = export_products_csv()
    assert content.startswith("﻿")  # BOM para Excel en español
    lines = content.splitlines()
    header = lines[0].lstrip("﻿")
    assert header.split(",")[0] == "sku"
    assert "categoria" in header and "proveedor" in header
    assert "reservado" in header and "disponible" in header
    # Una fila de datos + encabezado
    assert len(lines) == 2
    assert "BQ-1" in lines[1]
    assert "Filtros" in lines[1]
    assert "DronesPanama" in lines[1]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec -T backend pytest apps/inventory/tests/test_import_export.py::test_export_has_bom_header_and_one_row_per_product -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'apps.inventory.import_export'`

- [ ] **Step 3: Write minimal implementation**

Create `backend/apps/inventory/import_export.py`:

```python
import csv
import io

from .models import Product

# Orden canónico de columnas (import + export).
IMPORT_COLUMNS = [
    "sku", "nombre", "descripcion", "codigo_barras", "categoria", "marca",
    "modelo", "unidad", "ubicacion", "stock_inicial", "stock_minimo", "costo",
    "precio_venta", "margen_%", "proveedor", "activo",
]
# Columnas solo-lectura que añade el export (el import las ignora).
EXPORT_EXTRA = ["reservado", "disponible"]


def _bool_text(value):
    return "sí" if value else "no"


def export_products_csv():
    """Devuelve el catálogo como texto CSV (UTF-8 con BOM) listo para descargar."""
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(IMPORT_COLUMNS + EXPORT_EXTRA)
    products = Product.objects.select_related("category", "main_supplier").all()
    for p in products:
        writer.writerow([
            p.sku,
            p.name,
            p.description,
            p.barcode,
            p.category.name if p.category else "",
            p.brand,
            p.model,
            p.unit_of_measure,
            p.location,
            p.stock_quantity,
            p.minimum_stock,
            p.average_cost,
            p.sale_price,
            p.default_margin_percentage,
            p.main_supplier.name if p.main_supplier else "",
            _bool_text(p.is_active),
            p.reserved_quantity,
            p.available_quantity,
        ])
    return "﻿" + buffer.getvalue()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose exec -T backend pytest apps/inventory/tests/test_import_export.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/apps/inventory/import_export.py backend/apps/inventory/tests/test_import_export.py
git commit -m "feat(inventory): export del catalogo a CSV (modulo)"
```

---

## Task 2: Endpoint GET export

**Files:**
- Modify: `backend/apps/inventory/views.py`
- Test: `backend/apps/inventory/tests/test_import_export.py`

- [ ] **Step 1: Write the failing test**

Append to `test_import_export.py`:

```python
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

User = get_user_model()


def _inv_client():
    user = User.objects.create_user(
        email="inv@veragro.com", password="x", full_name="i", role="inventory"
    )
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.mark.django_db
def test_export_endpoint_returns_csv_attachment():
    Product.objects.create(sku="A-1", name="Cosa")
    resp = _inv_client().get("/api/inventory/products/export/")
    assert resp.status_code == 200
    assert resp["Content-Type"].startswith("text/csv")
    assert "attachment" in resp["Content-Disposition"]
    assert "inventario.csv" in resp["Content-Disposition"]
    body = resp.content.decode("utf-8-sig")
    assert "A-1" in body
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec -T backend pytest apps/inventory/tests/test_import_export.py::test_export_endpoint_returns_csv_attachment -v`
Expected: FAIL with 404 (la acción `export` aún no existe).

- [ ] **Step 3: Write minimal implementation**

In `backend/apps/inventory/views.py`, add imports at the top (junto a los existentes):

```python
from django.http import HttpResponse

from .import_export import export_products_csv
```

Add this action inside `ProductViewSet` (después del método `movements`):

```python
    @action(detail=False, methods=["get"])
    def export(self, request):
        content = export_products_csv()
        response = HttpResponse(content, content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="inventario.csv"'
        return response
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose restart backend && docker compose exec -T backend pytest apps/inventory/tests/test_import_export.py -v`
Expected: PASS (recordar: el backend en Windows NO autorrecarga `.py`, por eso el `restart`).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/inventory/views.py backend/apps/inventory/tests/test_import_export.py
git commit -m "feat(inventory): endpoint GET /products/export/ (CSV)"
```

---

## Task 3: Importar catálogo desde CSV (módulo)

**Files:**
- Modify: `backend/apps/inventory/import_export.py`
- Test: `backend/apps/inventory/tests/test_import_export.py`

- [ ] **Step 1: Write the failing test**

Append to `test_import_export.py`:

```python
import io as _io

from apps.inventory.import_export import import_products_csv
from apps.inventory.models import InventoryMovement


def _csv_file(text):
    """Simula un archivo subido: bytes UTF-8 con BOM."""
    return _io.BytesIO(("﻿" + text).encode("utf-8"))


@pytest.mark.django_db
def test_import_creates_product_category_supplier_and_opening_movement():
    user = User.objects.create_user(
        email="i2@veragro.com", password="x", full_name="i", role="inventory"
    )
    text = (
        "sku,nombre,categoria,proveedor,stock_inicial,costo,margen_%\n"
        "BQ-9,Boquilla nueva,Filtros,DronesPanama,5,10,30\n"
    )
    result = import_products_csv(_csv_file(text), user)
    assert result["creados"] == 1
    assert result["saltados"] == 0
    assert result["errores"] == []

    product = Product.objects.get(sku="BQ-9")
    assert product.category.name == "Filtros"
    assert product.main_supplier.name == "DronesPanama"
    assert product.stock_quantity == Decimal("5")
    assert product.average_cost == Decimal("10")
    # precio = costo * (1 + 30/100) = 13
    assert product.sale_price == Decimal("13.00")
    # Movimiento de apertura en el kardex
    mv = InventoryMovement.objects.get(product=product)
    assert mv.movement_type == "adjustment_in"
    assert mv.quantity == Decimal("5")
    assert "Carga inicial" in mv.notes


@pytest.mark.django_db
def test_import_respects_manual_sale_price_and_blank_sku_autogenerates():
    user = User.objects.create_user(
        email="i3@veragro.com", password="x", full_name="i", role="inventory"
    )
    text = (
        "sku,nombre,costo,precio_venta\n"
        ",Producto sin sku,8,99\n"
    )
    result = import_products_csv(_csv_file(text), user)
    assert result["creados"] == 1
    product = Product.objects.get(name="Producto sin sku")
    assert product.sku  # autogenerado
    assert product.sale_price == Decimal("99.00")  # precio manual respetado


@pytest.mark.django_db
def test_import_best_effort_reports_skips_and_errors():
    user = User.objects.create_user(
        email="i4@veragro.com", password="x", full_name="i", role="inventory"
    )
    Product.objects.create(sku="DUP-1", name="Existente")
    text = (
        "sku,nombre,stock_inicial,costo\n"
        "OK-1,Valido,3,5\n"            # fila 2: entra
        "DUP-1,Duplicado,1,1\n"        # fila 3: SKU ya existe -> saltado
        "X-1,,1,1\n"                   # fila 4: sin nombre -> error
        "X-2,Mal numero,abc,1\n"       # fila 5: número inválido -> error
    )
    result = import_products_csv(_csv_file(text), user)
    assert result["creados"] == 1
    assert result["saltados"] == 1
    motivos = {e["fila"]: e["motivo"] for e in result["errores"]}
    assert 4 in motivos and "nombre" in motivos[4].lower()
    assert 5 in motivos
    # El duplicado va en errores con su fila también (saltado = subset reportado)
    assert any(e["sku"] == "DUP-1" for e in result["errores"])
    assert Product.objects.filter(sku="OK-1").exists()
    assert not Product.objects.filter(name="Mal numero").exists()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec -T backend pytest apps/inventory/tests/test_import_export.py -k import -v`
Expected: FAIL with `ImportError: cannot import name 'import_products_csv'`

- [ ] **Step 3: Write minimal implementation**

Add to `backend/apps/inventory/import_export.py`. New imports at the top:

```python
from decimal import Decimal, InvalidOperation

from django.db import transaction

from apps.suppliers.models import Supplier

from .models import ProductCategory
from .services import apply_adjustment, apply_margin
```

Helpers and the import function (append to the module):

```python
_TRUE = {"si", "sí", "true", "1", "yes", "on", "verdadero"}
_FALSE = {"no", "false", "0", "off", "falso"}


def _parse_bool(value, default=True):
    text = (value or "").strip().lower()
    if not text:
        return default
    if text in _TRUE:
        return True
    if text in _FALSE:
        return False
    raise ValueError(f"Valor booleano inválido: '{value}'.")


def _parse_decimal(value, field, default="0"):
    text = (value or "").strip().replace(",", ".")
    if not text:
        text = default
    try:
        result = Decimal(text)
    except (InvalidOperation, ValueError):
        raise ValueError(f"'{field}' no es un número válido: '{value}'.")
    if result < 0:
        raise ValueError(f"'{field}' no puede ser negativo.")
    return result


def _get_or_create_category(name):
    name = (name or "").strip()
    if not name:
        return None
    existing = ProductCategory.objects.filter(name__iexact=name).first()
    return existing or ProductCategory.objects.create(name=name)


def _get_or_create_supplier(name):
    name = (name or "").strip()
    if not name:
        return None
    existing = Supplier.objects.filter(name__iexact=name).first()
    return existing or Supplier.objects.create(name=name)


def _create_row(row, user):
    """Crea un producto desde una fila normalizada. Lanza ValueError si es inválida."""
    name = (row.get("nombre") or "").strip()
    if not name:
        raise ValueError("El nombre es obligatorio.")

    sku = (row.get("sku") or "").strip()
    if sku and Product.objects.filter(sku=sku).exists():
        raise ValueError("El SKU ya existe.")

    stock_inicial = _parse_decimal(row.get("stock_inicial"), "stock_inicial")
    minimum_stock = _parse_decimal(row.get("stock_minimo"), "stock_minimo")
    costo = _parse_decimal(row.get("costo"), "costo")
    margen = _parse_decimal(row.get("margen_%"), "margen_%")
    precio_text = (row.get("precio_venta") or "").strip()
    precio_venta = _parse_decimal(precio_text, "precio_venta") if precio_text else None
    is_active = _parse_bool(row.get("activo"), default=True)

    category = _get_or_create_category(row.get("categoria"))
    supplier = _get_or_create_supplier(row.get("proveedor"))

    product = Product.objects.create(
        sku=sku or "",  # se completa abajo si va vacío
        name=name,
        description=(row.get("descripcion") or "").strip(),
        barcode=(row.get("codigo_barras") or "").strip(),
        category=category,
        brand=(row.get("marca") or "").strip(),
        model=(row.get("modelo") or "").strip(),
        unit_of_measure=(row.get("unidad") or "").strip(),
        location=(row.get("ubicacion") or "").strip(),
        minimum_stock=minimum_stock,
        average_cost=costo,
        last_purchase_cost=costo,
        default_margin_percentage=margen,
        main_supplier=supplier,
        is_active=is_active,
    )
    if not sku:
        product.sku = f"SKU-{product.pk:06d}"
        product.save(update_fields=["sku"])

    if precio_venta is not None:
        product.sale_price = precio_venta
        product.save(update_fields=["sale_price", "updated_at"])
    else:
        apply_margin(product)  # deriva precio del margen efectivo si hay costo

    if stock_inicial > 0:
        apply_adjustment(
            product=product,
            movement_type="adjustment_in",
            quantity=stock_inicial,
            unit_cost=costo,
            notes="Carga inicial",
            user=user,
        )
    return product


def import_products_csv(file, user):
    """Importa productos desde un archivo CSV (best-effort).

    Devuelve {creados, saltados, errores:[{fila, sku, motivo}]}.
    `file` es un objeto con bytes (UploadedFile o BytesIO).
    """
    text = file.read()
    if isinstance(text, bytes):
        text = text.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))

    creados = 0
    saltados = 0
    errores = []
    # fila 1 = encabezado; la primera fila de datos es la 2.
    for index, raw in enumerate(reader, start=2):
        row = {(k or "").strip().lower(): v for k, v in raw.items()}
        sku = (row.get("sku") or "").strip()
        try:
            with transaction.atomic():
                _create_row(row, user)
            creados += 1
        except ValueError as exc:
            motivo = str(exc)
            if motivo == "El SKU ya existe.":
                saltados += 1
            errores.append({"fila": index, "sku": sku, "motivo": motivo})
    return {"creados": creados, "saltados": saltados, "errores": errores}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose exec -T backend pytest apps/inventory/tests/test_import_export.py -v`
Expected: PASS (todas)

- [ ] **Step 5: Commit**

```bash
git add backend/apps/inventory/import_export.py backend/apps/inventory/tests/test_import_export.py
git commit -m "feat(inventory): import de catalogo desde CSV (best-effort)"
```

---

## Task 4: Endpoint POST import

**Files:**
- Modify: `backend/apps/inventory/views.py`
- Test: `backend/apps/inventory/tests/test_import_export.py`

- [ ] **Step 1: Write the failing test**

Append to `test_import_export.py`:

```python
from django.core.files.uploadedfile import SimpleUploadedFile


@pytest.mark.django_db
def test_import_endpoint_creates_products():
    csv_bytes = ("﻿" + "sku,nombre,stock_inicial,costo\nE-1,Desde API,2,7\n").encode("utf-8")
    upload = SimpleUploadedFile("inv.csv", csv_bytes, content_type="text/csv")
    resp = _inv_client().post(
        "/api/inventory/products/import/", {"file": upload}, format="multipart"
    )
    assert resp.status_code == 200, resp.content
    assert resp.data["creados"] == 1
    assert Product.objects.filter(sku="E-1").exists()


@pytest.mark.django_db
def test_import_endpoint_requires_file():
    resp = _inv_client().post("/api/inventory/products/import/", {}, format="multipart")
    assert resp.status_code == 400
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec -T backend pytest apps/inventory/tests/test_import_export.py -k endpoint_creates -v`
Expected: FAIL with 404 (la acción `import` no existe).

- [ ] **Step 3: Write minimal implementation**

In `backend/apps/inventory/views.py`:

Add to imports:
```python
from rest_framework.parsers import MultiPartParser

from .import_export import export_products_csv, import_products_csv
```
(combinar con el import de `export_products_csv` de la Task 2 en una sola línea).

Add this action inside `ProductViewSet` (después de `export`):

```python
    @action(
        detail=False,
        methods=["post"],
        parser_classes=[MultiPartParser],
        url_path="import",
    )
    def import_csv(self, request):
        upload = request.FILES.get("file")
        if not upload:
            raise ValidationError({"file": "Suba un archivo CSV."})
        result = import_products_csv(upload, request.user)
        return Response(result)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose restart backend && docker compose exec -T backend pytest apps/inventory -v`
Expected: PASS (toda la app inventory, sin regresiones).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/inventory/views.py backend/apps/inventory/tests/test_import_export.py
git commit -m "feat(inventory): endpoint POST /products/import/ (multipart)"
```

---

## Task 5: Frontend — helper de descarga + hook de importación

**Files:**
- Create: `frontend/src/features/inventory/importExport.ts`

- [ ] **Step 1: Write the implementation**

Create `frontend/src/features/inventory/importExport.ts`:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { API_BASE_URL } from "../../lib/api/client";
import { getAccess } from "../../lib/auth/tokens";

export interface ImportError {
  fila: number;
  sku: string;
  motivo: string;
}
export interface ImportResult {
  creados: number;
  saltados: number;
  errores: ImportError[];
}

/** Descarga el catálogo como CSV (fetch autenticado → blob). */
export async function downloadProductsCsv(): Promise<void> {
  const token = getAccess();
  const res = await fetch(`${API_BASE_URL}/api/inventory/products/export/`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("No se pudo exportar el inventario.");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "inventario.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Sube un CSV y devuelve el resumen. Usa fetch+FormData (multipart) con Bearer. */
export function useImportProducts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<ImportResult> => {
      const token = getAccess();
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API_BASE_URL}/api/inventory/products/import/`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!res.ok) throw new Error("No se pudo importar el archivo.");
      return (await res.json()) as ImportResult;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `cd frontend && npx tsc --noEmit`
Expected: exit 0 (sin errores). `API_BASE_URL` y `getAccess` ya existen (ver `features/billing/documents.ts`).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/inventory/importExport.ts
git commit -m "feat(inventory): helper export CSV + hook import (frontend)"
```

---

## Task 6: Frontend — componente de resumen (presentacional) + test

**Files:**
- Create: `frontend/src/features/inventory/ImportSummary.tsx`
- Test: `frontend/src/features/inventory/importExport.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/inventory/importExport.test.tsx`:

```tsx
import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ImportSummary } from "./ImportSummary";

function renderSummary(result: Parameters<typeof ImportSummary>[0]["result"]) {
  return render(
    <MantineProvider>
      <ImportSummary result={result} />
    </MantineProvider>,
  );
}

describe("ImportSummary", () => {
  it("muestra creados, saltados y la tabla de errores", () => {
    renderSummary({
      creados: 3,
      saltados: 1,
      errores: [{ fila: 4, sku: "X-1", motivo: "El nombre es obligatorio." }],
    });
    expect(screen.getByText(/3/)).toBeInTheDocument();
    expect(screen.getByText("El nombre es obligatorio.")).toBeInTheDocument();
    expect(screen.getByText("X-1")).toBeInTheDocument();
  });

  it("sin errores no muestra la tabla", () => {
    renderSummary({ creados: 2, saltados: 0, errores: [] });
    expect(screen.queryByText(/Motivo/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/features/inventory/importExport.test.tsx`
Expected: FAIL (no existe `./ImportSummary`).

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/features/inventory/ImportSummary.tsx`:

```tsx
import { Alert, Group, Stack, Table, Text } from "@mantine/core";

import type { ImportResult } from "./importExport";

export function ImportSummary({ result }: { result: ImportResult }) {
  return (
    <Stack gap="sm">
      <Group>
        <Alert color="green" variant="light" style={{ flex: 1 }}>
          <Text fw={700}>{result.creados}</Text>
          <Text size="sm">creados</Text>
        </Alert>
        <Alert color="yellow" variant="light" style={{ flex: 1 }}>
          <Text fw={700}>{result.saltados}</Text>
          <Text size="sm">saltados</Text>
        </Alert>
      </Group>

      {result.errores.length > 0 && (
        <Table withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Fila</Table.Th>
              <Table.Th>SKU</Table.Th>
              <Table.Th>Motivo</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {result.errores.map((e, i) => (
              <Table.Tr key={i}>
                <Table.Td>{e.fila}</Table.Td>
                <Table.Td>{e.sku || "—"}</Table.Td>
                <Table.Td>{e.motivo}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/features/inventory/importExport.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/inventory/ImportSummary.tsx frontend/src/features/inventory/importExport.test.tsx
git commit -m "feat(inventory): componente de resumen de importacion + test"
```

---

## Task 7: Frontend — modal de importación

**Files:**
- Create: `frontend/src/features/inventory/ImportModal.tsx`

- [ ] **Step 1: Write the implementation**

Create `frontend/src/features/inventory/ImportModal.tsx`:

```tsx
import { Anchor, Button, FileInput, Group, Modal, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconFileSpreadsheet } from "@tabler/icons-react";
import { useEffect, useState } from "react";

import { ImportSummary } from "./ImportSummary";
import {
  downloadProductsCsv,
  useImportProducts,
  type ImportResult,
} from "./importExport";

export function ImportModal({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const importer = useImportProducts();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    if (opened) {
      setFile(null);
      setResult(null);
    }
  }, [opened]);

  const submit = async () => {
    if (!file) return;
    try {
      const res = await importer.mutateAsync(file);
      setResult(res);
      notifications.show({
        color: "green",
        message: `Importación: ${res.creados} creados, ${res.saltados} saltados.`,
      });
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };

  const downloadTemplate = async () => {
    try {
      await downloadProductsCsv();
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Importar inventario (CSV)" size="lg">
      <Stack>
        <Text size="sm" c="dimmed">
          Sube un CSV para dar de alta productos nuevos. Casa por SKU; los que ya existen
          se saltan. Categoría y proveedor se crean si no existen.{" "}
          <Anchor component="button" type="button" onClick={downloadTemplate}>
            Descargar plantilla
          </Anchor>
        </Text>

        <FileInput
          label="Archivo CSV"
          placeholder="Selecciona un archivo .csv"
          accept=".csv,text/csv"
          leftSection={<IconFileSpreadsheet size={18} />}
          value={file}
          onChange={setFile}
        />

        {result && <ImportSummary result={result} />}

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {result ? "Cerrar" : "Cancelar"}
          </Button>
          <Button onClick={submit} disabled={!file} loading={importer.isPending}>
            Importar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `cd frontend && npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/inventory/ImportModal.tsx
git commit -m "feat(inventory): modal de importacion de CSV"
```

---

## Task 8: Frontend — botones en la página de inventario

**Files:**
- Modify: `frontend/src/features/inventory/InventoryPage.tsx`

- [ ] **Step 1: Write the implementation**

In `frontend/src/features/inventory/InventoryPage.tsx`:

Add icons to the `@tabler/icons-react` import (junto a los existentes):
```tsx
  IconDownload,
  IconUpload,
```

Add to the `@mantine/hooks` disclosure state (junto a `formOpen`/`adjustOpen`), dentro del componente:
```tsx
  const [importOpen, { open: openImport, close: closeImport }] = useDisclosure(false);
```

Add the import of the new pieces (junto a los imports de `./AdjustStockModal` etc.):
```tsx
import { downloadProductsCsv } from "./importExport";
import { ImportModal } from "./ImportModal";
```

Add an export handler (junto a `openNew`/`openEdit`):
```tsx
  const exportCsv = async () => {
    try {
      await downloadProductsCsv();
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };
```

Replace the `PageHeader` `action` prop so it has the three buttons:
```tsx
        action={
          <Group gap="xs">
            <Button
              variant="default"
              leftSection={<IconDownload size={18} />}
              onClick={exportCsv}
            >
              Exportar CSV
            </Button>
            <Button
              variant="default"
              leftSection={<IconUpload size={18} />}
              onClick={openImport}
            >
              Importar CSV
            </Button>
            <Button leftSection={<IconPlus size={18} />} onClick={openNew}>
              Nuevo producto
            </Button>
          </Group>
        }
```

Add the modal at the end, junto a los otros modales (antes de cerrar el `</Stack>`):
```tsx
      <ImportModal opened={importOpen} onClose={closeImport} />
```

- [ ] **Step 2: Verify build + tests**

Run: `cd frontend && npx tsc --noEmit && npx vitest run && npm run build`
Expected: typecheck exit 0; todos los tests verdes (incluye los 2 nuevos de ImportSummary); build OK.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/inventory/InventoryPage.tsx
git commit -m "feat(inventory): botones Exportar/Importar CSV en la lista"
```

---

## Task 9: Verificación end-to-end + memoria

- [ ] **Step 1: Backend completo**

Run: `docker compose exec -T backend pytest -q`
Expected: toda la suite verde (255 previos + los nuevos de import/export, ~263).

- [ ] **Step 2: Frontend completo**

Run: `cd frontend && npx vitest run && npm run build`
Expected: tests verdes (26 previos + 2 nuevos = ~37... ajustar al conteo real), build OK.

- [ ] **Step 3: Prueba en vivo (manual, lo hace el usuario)**

1. Abrir http://localhost:5173/inventory, login admin@veragro.com.
2. "Exportar CSV" → descarga `inventario.csv` (abrir en Excel, acentos OK).
3. Editar el CSV: agregar 1-2 filas con SKU nuevo, una con categoría/proveedor inexistentes, una sin nombre.
4. "Importar CSV" → seleccionar el archivo → ver resumen (creados/saltados/errores).
5. Confirmar que los productos nuevos aparecen en la lista con su stock y precio, y que el detalle muestra el movimiento "Carga inicial".

- [ ] **Step 4: Actualizar la memoria del proyecto**

Añadir a `veragro-erp-progreso.md` el sub-proyecto de importar/exportar inventario (qué se hizo, endpoints, decisiones) y registrar en `veragro-erp-followups.md` el follow-up de **modo upsert** ("actualizar existentes") y export/import en móvil. Marcar como hecho el agregar/editar líneas de OC si aún no estaba.

## Notas para quien ejecute

- **Backend Windows:** tras tocar cualquier `.py`, `docker compose restart backend` antes de correr pytest (no autorrecarga). Los pasos lo incluyen donde aplica.
- **Sin dependencias nuevas:** todo usa el módulo `csv` de la stdlib.
- **Permisos:** ambos endpoints heredan `RoleWriteOrReadOnly("admin","inventory")` del `ProductViewSet` (escritura solo admin/inventory; el export es un GET, así que cualquier autenticado podría leerlo — si se quiere restringir el export a admin/inventory, habría que sobreescribir `get_permissions` por acción; **decisión de la v1: dejar el export con el permiso del viewset**, lectura para autenticados, igual que el resto del catálogo).
- **No** se toca el móvil (fuera de alcance).
