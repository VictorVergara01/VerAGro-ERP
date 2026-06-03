from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from apps.billing.models import Invoice, InvoiceLine
from apps.customers.models import Customer
from apps.equipment.models import Equipment, EquipmentType
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
def customer(db):
    return Customer.objects.create(name="Cliente Rep")


def _product(sku, **kwargs):
    return Product.objects.create(sku=sku, name=sku, **kwargs)


# --- Permisos ---


@pytest.mark.django_db
def test_financial_reports_require_admin_or_sales():
    denied = {role: _client(role) for role in ("technician", "inventory", "readonly")}
    sales, admin = _client("sales"), _client("admin")
    for path in ("dashboard", "sales", "profit"):
        url = f"/api/reports/{path}/"
        assert APIClient().get(url).status_code == 401
        for client in denied.values():
            assert client.get(url).status_code == 403
        assert sales.get(url).status_code == 200
        assert admin.get(url).status_code == 200


@pytest.mark.django_db
def test_operational_reports_any_authenticated():
    readonly = _client("readonly")
    for path in ("low-stock", "service-orders"):
        url = f"/api/reports/{path}/"
        assert APIClient().get(url).status_code == 401
        assert readonly.get(url).status_code == 200


# --- low-stock ---


@pytest.mark.django_db
def test_low_stock_report():
    c = _client("inventory")
    _product("LS-LOW", stock_quantity=Decimal("1"), minimum_stock=Decimal("5"),
             average_cost=Decimal("10"))
    _product("LS-OK", stock_quantity=Decimal("20"), minimum_stock=Decimal("5"))
    resp = c.get("/api/reports/low-stock/")
    skus = [p["sku"] for p in resp.data["low_stock"]]
    assert "LS-LOW" in skus and "LS-OK" not in skus
    assert resp.data["summary"]["total_products"] == 2


# --- service-orders ---


@pytest.mark.django_db
def test_service_orders_report(customer):
    c = _client("technician")
    ServiceOrder.objects.create(customer=customer)  # received -> pending
    order = ServiceOrder.objects.create(
        customer=customer, status=ServiceOrder.Status.FINISHED
    )
    product = _product("MUP", stock_quantity=Decimal("10"))
    ServiceOrderPart.objects.create(
        service_order=order, product=product, quantity=3,
        status=ServiceOrderPart.Status.USED,
    )
    resp = c.get("/api/reports/service-orders/")
    assert resp.data["pending"] == 1
    used = resp.data["most_used_parts"]
    assert used[0]["product__sku"] == "MUP"
    assert str(used[0]["total_quantity"]) == "3.00"


@pytest.mark.django_db
def test_service_orders_invalid_date_400(customer):
    c = _client("technician")
    resp = c.get("/api/reports/service-orders/?from=not-a-date")
    assert resp.status_code == 400


# --- sales / profit ---


def _issued_invoice(customer, total_line):
    inv = Invoice.objects.create(
        customer=customer, status=Invoice.Status.ISSUED, issue_date=timezone.localdate()
    )
    InvoiceLine.objects.create(
        invoice=inv, description="L", quantity=1, unit_price=total_line, unit_cost=0
    )
    from apps.billing.services import recalculate_invoice

    recalculate_invoice(inv)
    return inv


@pytest.mark.django_db
def test_sales_report(customer):
    c = _client("sales")
    _issued_invoice(customer, Decimal("100"))
    resp = c.get("/api/reports/sales/")
    assert len(resp.data["sales_by_month"]) == 1
    assert resp.data["sales_by_month"][0]["count"] == 1
    assert len(resp.data["pending_invoices"]) == 1


@pytest.mark.django_db
def test_profit_report(customer):
    c = _client("admin")
    inv = Invoice.objects.create(customer=customer, status=Invoice.Status.PAID)
    product = _product("PFT")
    InvoiceLine.objects.create(
        invoice=inv, product=product, description="P", quantity=2,
        unit_price=Decimal("50"), unit_cost=Decimal("30"),
    )
    from apps.billing.services import recalculate_invoice

    recalculate_invoice(inv)
    resp = c.get("/api/reports/profit/")
    assert resp.data["totals"]["margin"] == Decimal("40.00")  # (50-30)*2
    assert resp.data["by_part"][0]["product__sku"] == "PFT"
    assert resp.data["by_part"][0]["total_margin"] == Decimal("40.00")


# --- equipment-history ---


@pytest.mark.django_db
def test_equipment_history(customer):
    c = _client("technician")
    etype = EquipmentType.objects.create(name="Dron Rep")
    eq = Equipment.objects.create(name="T50", customer=customer, equipment_type=etype)
    ServiceOrder.objects.create(customer=customer, equipment=eq)
    resp = c.get(f"/api/reports/equipment-history/?equipment={eq.id}")
    assert resp.status_code == 200
    assert resp.data["equipment"]["name"] == "T50"
    assert len(resp.data["service_orders"]) == 1


@pytest.mark.django_db
def test_equipment_history_missing_param_400():
    c = _client("technician")
    assert c.get("/api/reports/equipment-history/").status_code == 400


@pytest.mark.django_db
def test_equipment_history_not_found_404():
    c = _client("technician")
    assert c.get("/api/reports/equipment-history/?equipment=99999").status_code == 404


# --- dashboard ---


@pytest.mark.django_db
def test_dashboard_structure(customer):
    c = _client("admin")
    _issued_invoice(customer, Decimal("100"))
    resp = c.get("/api/reports/dashboard/")
    assert "inventory" in resp.data
    assert "service_orders_by_status" in resp.data
    assert resp.data["invoices"]["sales_this_month"] == Decimal("100.00")
    assert "purchases_by_supplier" in resp.data
