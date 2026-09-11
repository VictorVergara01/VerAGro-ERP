from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from apps.inventory.models import Product
from apps.inventory.price_range import floor_for, is_below_floor

User = get_user_model()


@pytest.mark.django_db
def test_sin_rango_configurado_no_hay_piso():
    p = Product.objects.create(sku="F1", name="P", min_sale_price=Decimal("0"))
    assert floor_for(p) is None
    assert is_below_floor(p, Decimal("1")) is False


@pytest.mark.django_db
def test_producto_nulo_no_rompe():
    assert floor_for(None) is None
    assert is_below_floor(None, Decimal("1")) is False


@pytest.mark.django_db
def test_precio_bajo_el_piso():
    p = Product.objects.create(sku="F2", name="P", min_sale_price=Decimal("34.38"))
    assert floor_for(p) == Decimal("34.38")
    assert is_below_floor(p, Decimal("30.00")) is True
    assert is_below_floor(p, Decimal("34.38")) is False   # justo en el piso, no avisa
    assert is_below_floor(p, Decimal("40.00")) is False


from apps.billing.models import Invoice, InvoiceLine, LineType
from apps.billing.serializers import InvoiceLineSerializer
from apps.customers.models import Customer


@pytest.mark.django_db
def test_la_linea_bajo_el_piso_se_marca_pero_se_guarda():
    customer = Customer.objects.create(name="Cliente")
    invoice = Invoice.objects.create(customer=customer)
    product = Product.objects.create(
        sku="F3", name="Hélice", min_sale_price=Decimal("34.38")
    )
    s = InvoiceLineSerializer(
        data={
            "invoice": invoice.id,
            "product": product.id,
            "quantity": "1",
            "unit_price": "30.00",
        }
    )
    assert s.is_valid(), s.errors
    line = s.save()
    assert InvoiceLine.objects.filter(pk=line.pk).exists()   # se guardó igual

    data = InvoiceLineSerializer(instance=line).data
    assert data["below_min_price"] is True
    assert Decimal(data["price_floor"]) == Decimal("34.38")


@pytest.mark.django_db
def test_la_linea_dentro_del_rango_no_se_marca():
    customer = Customer.objects.create(name="Cliente")
    invoice = Invoice.objects.create(customer=customer)
    product = Product.objects.create(
        sku="F4", name="Hélice", min_sale_price=Decimal("34.38")
    )
    line = InvoiceLine.objects.create(
        invoice=invoice, product=product, quantity=Decimal("1"),
        unit_price=Decimal("36.00"),
    )
    data = InvoiceLineSerializer(instance=line).data
    assert data["below_min_price"] is False


@pytest.mark.django_db
def test_la_linea_sin_producto_no_avisa_ni_rompe():
    """QuoteLine/InvoiceLine admiten líneas sin producto (servicio, texto manual)."""
    customer = Customer.objects.create(name="Cliente")
    invoice = Invoice.objects.create(customer=customer)
    line = InvoiceLine.objects.create(
        invoice=invoice,
        product=None,
        description="Mano de obra",
        quantity=Decimal("1"),
        unit_price=Decimal("50.00"),
        line_type=LineType.LABOR,
    )
    data = InvoiceLineSerializer(instance=line).data
    assert data["below_min_price"] is False
    assert data["price_floor"] is None


@pytest.fixture
def sales_client(db):
    user = User.objects.create_user(
        email="pisosales@veragro.com", password="x", full_name="V", role="sales"
    )
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def _crear_factura_con_lineas(customer, n):
    invoice = Invoice.objects.create(customer=customer)
    for i in range(n):
        product = Product.objects.create(
            sku=f"NP-{customer.id}-{i}",
            name=f"Producto {i}",
            min_sale_price=Decimal("10.00"),
        )
        InvoiceLine.objects.create(
            invoice=invoice,
            product=product,
            quantity=Decimal("1"),
            unit_price=Decimal("15.00"),
        )
    return invoice


@pytest.mark.django_db
def test_listar_facturas_no_incurre_en_n_mas_1(sales_client):
    """El mixin de piso de precio lee `line.product` en cada línea; sin
    `prefetch_related("lines__product")` eso dispara una query por línea.

    Se mantiene fija la cantidad de facturas (una sola) y se compara el conteo
    de queries variando sólo la cantidad de líneas (y por ende de productos
    distintos a resolver), para aislar el N+1 de `lines__product` de cualquier
    otro N+1 por-factura (p. ej. `fiscal`) que no es parte de este cambio.
    """
    customer_a = Customer.objects.create(name="Cliente N+1 A")
    _crear_factura_con_lineas(customer_a, 6)

    with CaptureQueriesContext(connection) as ctx:
        r = sales_client.get("/api/invoices/")
    assert r.status_code == 200
    queries_con_6_lineas = len(ctx.captured_queries)

    Invoice.objects.all().delete()
    customer_b = Customer.objects.create(name="Cliente N+1 B")
    _crear_factura_con_lineas(customer_b, 18)

    with CaptureQueriesContext(connection) as ctx:
        r = sales_client.get("/api/invoices/")
    assert r.status_code == 200
    queries_con_18_lineas = len(ctx.captured_queries)

    # el número de queries no debe crecer con el número de líneas de la factura
    assert queries_con_18_lineas <= queries_con_6_lineas
