from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from apps.billing.models import Invoice, InvoiceLine
from apps.customers.models import Customer
from apps.inventory.models import Product
from apps.service_orders.models import ServiceOrder, ServiceOrderPart

User = get_user_model()


def _client(role="super_admin"):
    user = User.objects.create_user(
        email=f"{role}@veragro.com", password="x", full_name=role, role=role
    )
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.mark.django_db
def test_lista_solo_las_lineas_bajo_el_piso():
    client = _client()
    customer = Customer.objects.create(name="Cliente")
    invoice = Invoice.objects.create(customer=customer)
    barata = Product.objects.create(
        sku="P1", name="Hélice", min_sale_price=Decimal("34.38")
    )
    sana = Product.objects.create(
        sku="P2", name="Motor", min_sale_price=Decimal("50.00")
    )
    InvoiceLine.objects.create(
        invoice=invoice, product=barata, quantity=Decimal("1"),
        unit_price=Decimal("30.00"),
    )
    InvoiceLine.objects.create(
        invoice=invoice, product=sana, quantity=Decimal("1"),
        unit_price=Decimal("60.00"),
    )

    r = client.get("/api/reports/below-floor-sales/")
    assert r.status_code == 200
    filas = r.json()["items"]
    assert len(filas) == 1
    fila = filas[0]
    assert fila["product_sku"] == "P1"
    assert Decimal(fila["unit_price"]) == Decimal("30.00")
    assert Decimal(fila["price_floor"]) == Decimal("34.38")
    assert Decimal(fila["difference"]) == Decimal("4.38")


@pytest.mark.django_db
def test_productos_sin_rango_no_aparecen():
    client = _client()
    customer = Customer.objects.create(name="Cliente")
    invoice = Invoice.objects.create(customer=customer)
    producto = Product.objects.create(sku="P3", name="P", min_sale_price=Decimal("0"))
    InvoiceLine.objects.create(
        invoice=invoice, product=producto, quantity=Decimal("1"),
        unit_price=Decimal("1.00"),
    )
    assert client.get("/api/reports/below-floor-sales/").json()["items"] == []


@pytest.mark.django_db
def test_rol_no_financiero_recibe_403():
    for role in ("technician", "piloto"):
        client = _client(role)
        r = client.get("/api/reports/below-floor-sales/")
        assert r.status_code == 403


@pytest.mark.django_db
def test_rol_financiero_puede_ver_el_reporte():
    for role in ("super_admin", "sales", "accounting"):
        client = _client(role)
        r = client.get("/api/reports/below-floor-sales/")
        assert r.status_code == 200


@pytest.mark.django_db
def test_no_incurre_en_n_mas_1():
    client = _client()
    customer = Customer.objects.create(name="Cliente")
    barata = Product.objects.create(
        sku="PB", name="Barata", min_sale_price=Decimal("100.00")
    )

    for i in range(5):
        author = User.objects.create_user(
            email=f"autor-factura-{i}@veragro.com", password="x",
            full_name=f"Autor {i}", role="sales",
        )
        invoice = Invoice.objects.create(customer=customer, created_by=author)
        InvoiceLine.objects.create(
            invoice=invoice, product=barata, quantity=Decimal("1"),
            unit_price=Decimal("10.00"),
        )

    for i in range(5):
        author = User.objects.create_user(
            email=f"autor-os-{i}@veragro.com", password="x",
            full_name=f"Autor OS {i}", role="technician",
        )
        service_order = ServiceOrder.objects.create(customer=customer, created_by=author)
        ServiceOrderPart.objects.create(
            service_order=service_order, product=barata, quantity=Decimal("1"),
            unit_price=Decimal("10.00"),
        )

    with CaptureQueriesContext(connection) as ctx:
        r = client.get("/api/reports/below-floor-sales/")
    assert r.status_code == 200
    assert r.json()["count"] == 10
    # dos consultas (facturas + partes de OS) con sus joins vía select_related;
    # constante, no proporcional al número de filas.
    assert len(ctx.captured_queries) <= 5
