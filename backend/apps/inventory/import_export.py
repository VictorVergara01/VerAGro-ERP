import csv
import io
import uuid
from decimal import Decimal, InvalidOperation

from django.db import transaction

from apps.suppliers.models import Supplier

from .models import Product, ProductCategory
from .services import apply_adjustment, apply_margin

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
            p.sku, p.name, p.description, p.barcode,
            p.category.name if p.category else "",
            p.brand, p.model, p.unit_of_measure, p.location,
            p.stock_quantity, p.minimum_stock, p.average_cost, p.sale_price,
            p.default_margin_percentage,
            p.main_supplier.name if p.main_supplier else "",
            _bool_text(p.is_active),
            p.reserved_quantity, p.available_quantity,
        ])
    return "﻿" + buffer.getvalue()


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

    # Si no hay SKU, generamos uno temporal único para satisfacer la restricción
    # DB de unicidad; luego lo actualizamos al pk-based definitivo.
    sku_to_create = sku if sku else f"__TMP-{uuid.uuid4().hex}"

    product = Product.objects.create(
        sku=sku_to_create,
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
        apply_margin(product)

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
    """Importa productos desde un CSV (best-effort).

    Devuelve {creados, saltados, errores:[{fila, sku, motivo}]}.
    """
    text = file.read()
    if isinstance(text, bytes):
        text = text.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))

    creados = 0
    saltados = 0
    errores = []
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
