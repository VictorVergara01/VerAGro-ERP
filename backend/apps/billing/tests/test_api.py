from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.billing.models import Invoice
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
def test_draft_can_be_shared_and_edited_before_issue(sales_client, customer):
    from apps.inventory.models import InventoryMovement

    product = _product("DRAFT-SALE", stock_quantity=5, average_cost=10)
    response = sales_client.post("/api/invoices/", {
        "customer": customer.pk,
        "invoice_type": "product_sale",
        "lines": [{"product": product.pk, "quantity": "2", "unit_price": "20", "line_type": "product"}],
    }, format="json")
    assert response.status_code == 201
    invoice_id = response.data["id"]
    assert response.data["status"] == "draft"
    assert sales_client.get(f"/api/invoices/{invoice_id}/pdf/").status_code == 200
    assert not InventoryMovement.objects.filter(product=product).exists()
    product.refresh_from_db()
    assert product.stock_quantity == 5
    updated = sales_client.patch(f"/api/invoices/{invoice_id}/", {
        "lines": [{"product": product.pk, "quantity": "3", "unit_price": "20", "line_type": "product"}],
    }, format="json")
    assert updated.status_code == 200
    assert Decimal(updated.data["total"]) == 60
    issued = sales_client.post(f"/api/invoices/{invoice_id}/issue/")
    assert issued.status_code == 200
    product.refresh_from_db()
    assert product.stock_quantity == 2
    assert InventoryMovement.objects.filter(product=product).count() == 1


def test_quote_routes_are_removed():
    from django.urls import Resolver404, resolve

    for path in ("/api/quotes/", "/api/quote-lines/", "/api/service-orders/1/generate-quote/"):
        with pytest.raises(Resolver404):
            resolve(path)


@pytest.mark.django_db
def test_invoice_filters_reject_non_numeric_values(sales_client):
    for key in ("customer", "service_order"):
        assert sales_client.get("/api/invoices/", {key: "invalid"}).status_code == 400


@pytest.mark.django_db
def test_generate_invoice_from_finished_order(customer):
    client = _client("technician")
    order = ServiceOrder.objects.create(customer=customer, labor_cost=50)
    url = f"/api/service-orders/{order.pk}/generate-invoice/"
    assert client.post(url).status_code == 400
    order.status = ServiceOrder.Status.FINISHED
    order.save()
    response = client.post(url)
    assert response.status_code == 201
    assert response.data["status"] == "draft"
    assert Decimal(response.data["total"]) == 50
    assert client.post(url).status_code == 400


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

    # El pago lo registra contabilidad (sales ya no puede registrar pagos).
    pay = _client("accounting").post(
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
    assert _client("super_admin").post(
        "/api/invoices/", payload, format="json"
    ).status_code == 201


@pytest.mark.django_db
def test_deliver_requires_invoice_except_admin(customer):
    tech = _client("technician")
    admin = _client("super_admin")
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
def test_accounting_can_pay_but_not_invoice(customer):
    acc = _client("accounting")
    # No puede crear factura
    resp = acc.post("/api/invoices/", {"customer": customer.id}, format="json")
    assert resp.status_code == 403
    # Sí puede registrar pago sobre una factura emitida
    admin = _client("super_admin")
    inv = admin.post(
        "/api/invoices/",
        {"customer": customer.id, "lines": [{"description": "x", "quantity": "1", "unit_price": "100"}]},
        format="json",
    ).data
    admin.post(f"/api/invoices/{inv['id']}/issue/")
    pay = acc.post(
        f"/api/invoices/{inv['id']}/payments/",
        {"amount": "50", "method": "cash"},
        format="json",
    )
    assert pay.status_code == 201


@pytest.mark.django_db
def test_sales_can_invoice_but_not_pay(customer):
    sales = _client("sales")
    inv = sales.post(
        "/api/invoices/",
        {"customer": customer.id, "lines": [{"description": "x", "quantity": "1", "unit_price": "100"}]},
        format="json",
    )
    assert inv.status_code == 201
    sales.post(f"/api/invoices/{inv.data['id']}/issue/")
    pay = sales.post(
        f"/api/invoices/{inv.data['id']}/payments/",
        {"amount": "50", "method": "cash"},
        format="json",
    )
    assert pay.status_code == 403


@pytest.mark.django_db
def test_customer_invoices_history(sales_client, customer):
    Invoice.objects.create(customer=customer)
    Invoice.objects.create(customer=customer)
    resp = sales_client.get(f"/api/customers/{customer.id}/invoices/")
    assert resp.status_code == 200
    assert resp.data["count"] == 2
