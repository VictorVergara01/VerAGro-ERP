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
    assert len(lines) == 2
    assert "BQ-1" in lines[1]
    assert "Filtros" in lines[1]
    assert "DronesPanama" in lines[1]


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


import io as _io

from apps.inventory.import_export import import_products_csv
from apps.inventory.models import InventoryMovement


def _csv_file(text):
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
    assert product.sale_price == Decimal("13.00")
    mv = InventoryMovement.objects.get(product=product)
    assert mv.movement_type == "adjustment_in"
    assert mv.quantity == Decimal("5")
    assert "Carga inicial" in mv.notes


@pytest.mark.django_db
def test_import_respects_manual_sale_price_and_blank_sku_autogenerates():
    user = User.objects.create_user(
        email="i3@veragro.com", password="x", full_name="i", role="inventory"
    )
    text = "sku,nombre,costo,precio_venta\n,Producto sin sku,8,99\n"
    result = import_products_csv(_csv_file(text), user)
    assert result["creados"] == 1
    product = Product.objects.get(name="Producto sin sku")
    assert product.sku
    assert product.sale_price == Decimal("99.00")


@pytest.mark.django_db
def test_import_best_effort_reports_skips_and_errors():
    user = User.objects.create_user(
        email="i4@veragro.com", password="x", full_name="i", role="inventory"
    )
    Product.objects.create(sku="DUP-1", name="Existente")
    text = (
        "sku,nombre,stock_inicial,costo\n"
        "OK-1,Valido,3,5\n"
        "DUP-1,Duplicado,1,1\n"
        "X-1,,1,1\n"
        "X-2,Mal numero,abc,1\n"
    )
    result = import_products_csv(_csv_file(text), user)
    assert result["creados"] == 1
    assert result["saltados"] == 1
    motivos = {e["fila"]: e["motivo"] for e in result["errores"]}
    assert 4 in motivos and "nombre" in motivos[4].lower()
    assert 5 in motivos
    assert any(e["sku"] == "DUP-1" for e in result["errores"])
    assert Product.objects.filter(sku="OK-1").exists()
    assert not Product.objects.filter(name="Mal numero").exists()


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
