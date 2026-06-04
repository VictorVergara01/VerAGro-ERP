from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.billing.models import Invoice, Quote
from apps.customers.models import Customer
from apps.inventory.models import Product
from apps.service_orders.models import ServiceOrder, ServiceOrderPart

User = get_user_model()


def _client(role):
    user = User.objects.create_user(
        email=f"{role}@veragro.com", password="x", full_name=role, role=role
    )
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture
def sales_client(db):
    return _client("sales")


@pytest.fixture
def customer(db):
    return Customer.objects.create(name="Cliente API B")


def _product(sku, **kwargs):
    return Product.objects.create(sku=sku, name=sku, **kwargs)


@pytest.mark.django_db
def test_create_quote_with_lines(sales_client, customer):
    resp = sales_client.post(
        "/api/quotes/",
        {
            "customer": customer.id,
            "lines": [
                {"description": "Mano de obra", "quantity": "1", "unit_price": "80",
                 "line_type": "labor"},
                {"description": "Pieza", "quantity": "2", "unit_price": "10"},
            ],
        },
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["quote_number"].startswith("COT-")
    assert Decimal(resp.data["total"]) == Decimal("100.00")


@pytest.mark.django_db
def test_quote_approve_convert(sales_client, customer):
    q = Quote.objects.create(customer=customer)
    from apps.billing.models import QuoteLine

    QuoteLine.objects.create(quote=q, description="A", quantity=1, unit_price=100)
    sales_client.post(f"/api/quotes/{q.id}/approve/")
    resp = sales_client.post(f"/api/quotes/{q.id}/convert-to-invoice/")
    assert resp.status_code == 201
    assert resp.data["invoice_number"].startswith("FAC-")
    assert resp.data["quote"] == q.id


@pytest.mark.django_db
def test_invoice_issue_and_payment(sales_client, customer):
    create = sales_client.post(
        "/api/invoices/",
        {
            "customer": customer.id,
            "lines": [{"description": "Serv", "quantity": "1", "unit_price": "100",
                       "line_type": "service"}],
        },
        format="json",
    )
    inv_id = create.data["id"]
    issue = sales_client.post(f"/api/invoices/{inv_id}/issue/")
    assert issue.data["status"] == "issued"

    pay = sales_client.post(
        f"/api/invoices/{inv_id}/payments/",
        {"amount": "100", "method": "cash"},
        format="json",
    )
    assert pay.status_code == 201
    assert pay.data["status"] == "paid"
    assert Decimal(pay.data["balance_due"]) == Decimal("0.00")


@pytest.mark.django_db
def test_edit_draft_invoice_replaces_lines(sales_client, customer):
    create = sales_client.post(
        "/api/invoices/",
        {
            "customer": customer.id,
            "lines": [{"description": "A", "quantity": "1", "unit_price": "100",
                       "line_type": "service"}],
        },
        format="json",
    )
    inv_id = create.data["id"]
    # Editar: cambia el impuesto (porcentaje) y reemplaza las líneas.
    patch = sales_client.patch(
        f"/api/invoices/{inv_id}/",
        {
            "tax_percentage": "7",
            "lines": [{"description": "B", "quantity": "2", "unit_price": "30",
                       "line_type": "service"}],
        },
        format="json",
    )
    assert patch.status_code == 200, patch.data
    assert len(patch.data["lines"]) == 1
    assert patch.data["lines"][0]["description"] == "B"
    assert Decimal(patch.data["total"]) == Decimal("64.20")  # 60 + 7% = 64.20


@pytest.mark.django_db
def test_edit_issued_invoice_blocked(sales_client, customer):
    create = sales_client.post(
        "/api/invoices/",
        {"customer": customer.id, "lines": [{"description": "A", "quantity": "1",
                                             "unit_price": "10", "line_type": "service"}]},
        format="json",
    )
    inv_id = create.data["id"]
    sales_client.post(f"/api/invoices/{inv_id}/issue/")
    patch = sales_client.patch(
        f"/api/invoices/{inv_id}/", {"notes": "x"}, format="json"
    )
    assert patch.status_code == 400


@pytest.mark.django_db
def test_product_sale_deducts_on_issue(sales_client, customer):
    p = _product("API-PS", stock_quantity=Decimal("10"))
    create = sales_client.post(
        "/api/invoices/",
        {
            "customer": customer.id,
            "invoice_type": "product_sale",
            "lines": [{"product": p.id, "description": "Venta", "quantity": "4",
                       "unit_price": "25"}],
        },
        format="json",
    )
    sales_client.post(f"/api/invoices/{create.data['id']}/issue/")
    p.refresh_from_db()
    assert p.stock_quantity == Decimal("6")


@pytest.mark.django_db
def test_pdf_stubs_501(sales_client, customer):
    q = Quote.objects.create(customer=customer)
    inv = Invoice.objects.create(customer=customer)
    assert sales_client.get(f"/api/quotes/{q.id}/pdf/").status_code == 501
    assert sales_client.get(f"/api/invoices/{inv.id}/pdf/").status_code == 501


@pytest.mark.django_db
def test_filters_non_numeric_400(sales_client):
    assert sales_client.get("/api/quotes/?customer=abc").status_code == 400
    assert sales_client.get("/api/invoices/?customer=abc").status_code == 400


@pytest.mark.django_db
def test_permissions(customer, db):
    payload = {"customer": customer.id}
    assert APIClient().post("/api/invoices/", payload, format="json").status_code == 401
    for role in ("technician", "readonly", "inventory"):
        assert _client(role).post(
            "/api/invoices/", payload, format="json"
        ).status_code == 403
    assert _client("sales").post(
        "/api/invoices/", payload, format="json"
    ).status_code == 201
    assert _client("admin").post(
        "/api/invoices/", payload, format="json"
    ).status_code == 201


@pytest.mark.django_db
def test_generate_quote_and_invoice_from_order(customer):
    tech = _client("technician")
    order = ServiceOrder.objects.create(
        customer=customer, status=ServiceOrder.Status.FINISHED, labor_cost=Decimal("50")
    )
    gq = tech.post(f"/api/service-orders/{order.id}/generate-quote/")
    assert gq.status_code == 201
    assert Decimal(gq.data["total"]) == Decimal("50.00")

    gi = tech.post(f"/api/service-orders/{order.id}/generate-invoice/")
    assert gi.status_code == 201
    assert gi.data["invoice_type"] == "service_invoice"


@pytest.mark.django_db
def test_deliver_requires_invoice_except_admin(customer):
    tech = _client("technician")
    admin = _client("admin")
    # Orden finished (no facturada): technician no puede entregar.
    order = ServiceOrder.objects.create(
        customer=customer, status=ServiceOrder.Status.FINISHED
    )
    assert tech.post(f"/api/service-orders/{order.id}/deliver/").status_code == 400
    # admin sí (override).
    assert admin.post(f"/api/service-orders/{order.id}/deliver/").status_code == 200
    order.refresh_from_db()
    assert order.status == "delivered"


@pytest.mark.django_db
def test_customer_invoices_history(sales_client, customer):
    Invoice.objects.create(customer=customer)
    Invoice.objects.create(customer=customer)
    resp = sales_client.get(f"/api/customers/{customer.id}/invoices/")
    assert resp.status_code == 200
    assert resp.data["count"] == 2
