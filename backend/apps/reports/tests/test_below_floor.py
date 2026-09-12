from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from apps.billing.models import Invoice, InvoiceLine, Quote, QuoteLine
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
    # ISSUED (no el DRAFT por defecto): el reporte solo cuenta ventas reales.
    invoice = Invoice.objects.create(customer=customer, status=Invoice.Status.ISSUED)
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
    # ISSUED: que la ausencia se deba a "sin piso" y no a "no es una venta".
    invoice = Invoice.objects.create(customer=customer, status=Invoice.Status.ISSUED)
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
        # ISSUED: solo así cuentan como venta real para el reporte.
        invoice = Invoice.objects.create(
            customer=customer, created_by=author, status=Invoice.Status.ISSUED
        )
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
        # USED: solo piezas efectivamente consumidas cuentan como venta real.
        ServiceOrderPart.objects.create(
            service_order=service_order, product=barata, quantity=Decimal("1"),
            unit_price=Decimal("10.00"), status=ServiceOrderPart.Status.USED,
        )

    with CaptureQueriesContext(connection) as ctx:
        r = client.get("/api/reports/below-floor-sales/")
    assert r.status_code == 200
    assert r.json()["count"] == 10
    # dos consultas (facturas + partes de OS) con sus joins vía select_related;
    # constante, no proporcional al número de filas.
    assert len(ctx.captured_queries) <= 5


@pytest.mark.django_db
def test_factura_en_borrador_no_aparece():
    client = _client()
    customer = Customer.objects.create(name="Cliente")
    producto = Product.objects.create(
        sku="PD", name="Draft", min_sale_price=Decimal("50.00")
    )
    invoice = Invoice.objects.create(customer=customer, status=Invoice.Status.DRAFT)
    InvoiceLine.objects.create(
        invoice=invoice, product=producto, quantity=Decimal("1"),
        unit_price=Decimal("10.00"),
    )
    assert client.get("/api/reports/below-floor-sales/").json()["items"] == []


@pytest.mark.django_db
def test_factura_anulada_no_aparece():
    client = _client()
    customer = Customer.objects.create(name="Cliente")
    producto = Product.objects.create(
        sku="PC", name="Cancelada", min_sale_price=Decimal("50.00")
    )
    invoice = Invoice.objects.create(
        customer=customer, status=Invoice.Status.CANCELLED
    )
    InvoiceLine.objects.create(
        invoice=invoice, product=producto, quantity=Decimal("1"),
        unit_price=Decimal("10.00"),
    )
    assert client.get("/api/reports/below-floor-sales/").json()["items"] == []


@pytest.mark.django_db
def test_pieza_no_usada_no_aparece():
    client = _client()
    customer = Customer.objects.create(name="Cliente")
    producto = Product.objects.create(
        sku="PR", name="Reservada", min_sale_price=Decimal("50.00")
    )
    service_order = ServiceOrder.objects.create(customer=customer)
    ServiceOrderPart.objects.create(
        service_order=service_order, product=producto, quantity=Decimal("1"),
        unit_price=Decimal("10.00"), status=ServiceOrderPart.Status.RESERVED,
    )
    assert client.get("/api/reports/below-floor-sales/").json()["items"] == []


@pytest.mark.django_db
def test_pieza_usada_en_orden_cancelada_no_aparece():
    client = _client()
    customer = Customer.objects.create(name="Cliente")
    producto = Product.objects.create(
        sku="POC", name="Orden cancelada", min_sale_price=Decimal("50.00")
    )
    service_order = ServiceOrder.objects.create(
        customer=customer, status=ServiceOrder.Status.CANCELLED
    )
    ServiceOrderPart.objects.create(
        service_order=service_order, product=producto, quantity=Decimal("1"),
        unit_price=Decimal("10.00"), status=ServiceOrderPart.Status.USED,
    )
    assert client.get("/api/reports/below-floor-sales/").json()["items"] == []


@pytest.mark.django_db
def test_camino_feliz_factura_emitida_y_pieza_usada_aparecen():
    client = _client()
    customer = Customer.objects.create(name="Cliente")
    producto_factura = Product.objects.create(
        sku="PF", name="Factura ok", min_sale_price=Decimal("50.00")
    )
    producto_pieza = Product.objects.create(
        sku="PP", name="Pieza ok", min_sale_price=Decimal("50.00")
    )
    invoice = Invoice.objects.create(customer=customer, status=Invoice.Status.ISSUED)
    InvoiceLine.objects.create(
        invoice=invoice, product=producto_factura, quantity=Decimal("1"),
        unit_price=Decimal("10.00"),
    )
    service_order = ServiceOrder.objects.create(
        customer=customer, status=ServiceOrder.Status.FINISHED
    )
    ServiceOrderPart.objects.create(
        service_order=service_order, product=producto_pieza, quantity=Decimal("1"),
        unit_price=Decimal("10.00"), status=ServiceOrderPart.Status.USED,
    )

    filas = client.get("/api/reports/below-floor-sales/").json()["items"]
    skus = {fila["product_sku"] for fila in filas}
    assert skus == {"PF", "PP"}


@pytest.mark.django_db
def test_cotizacion_bajo_el_piso_no_aparece():
    client = _client()
    customer = Customer.objects.create(name="Cliente")
    producto_cotizado = Product.objects.create(
        sku="PQ", name="Cotizado", min_sale_price=Decimal("50.00")
    )
    producto_facturado = Product.objects.create(
        sku="PFC", name="Facturado", min_sale_price=Decimal("50.00")
    )
    # Cotización con línea bajo el piso: propuesta, no venta. No debe aparecer.
    quote = Quote.objects.create(customer=customer)
    QuoteLine.objects.create(
        quote=quote, product=producto_cotizado, quantity=Decimal("1"),
        unit_price=Decimal("10.00"),
    )
    # Factura comparable, sí es una venta: debe aparecer.
    invoice = Invoice.objects.create(customer=customer, status=Invoice.Status.ISSUED)
    InvoiceLine.objects.create(
        invoice=invoice, product=producto_facturado, quantity=Decimal("1"),
        unit_price=Decimal("10.00"),
    )

    filas = client.get("/api/reports/below-floor-sales/").json()["items"]
    skus = {fila["product_sku"] for fila in filas}
    assert skus == {"PFC"}
