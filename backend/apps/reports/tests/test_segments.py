from datetime import date
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.billing.models import Invoice, InvoiceLine
from apps.billing.services import recalculate_invoice
from apps.customers.models import Customer
from apps.field_jobs.models import FieldJob
from apps.inventory.models import Product
from apps.users.models import User

pytestmark = pytest.mark.django_db


@pytest.fixture
def client():
    user = User.objects.create_user(email="segments@example.com", password="x", full_name="Ventas", role="sales")
    client = APIClient()
    client.force_authenticate(user)
    return client


def invoice(customer, kind, amount, *, job=None, status="issued", day=date(2026, 10, 10)):
    doc = Invoice.objects.create(customer=customer, invoice_type=kind, field_job=job, status=status, issue_date=day)
    InvoiceLine.objects.create(invoice=doc, quantity=1, unit_price=amount, unit_cost=10)
    recalculate_invoice(doc)
    return doc


def test_sales_and_profit_keep_field_separate_from_service_and_parts(client):
    customer = Customer.objects.create(name="Cliente")
    job = FieldJob.objects.create(customer=customer)
    workshop = [invoice(customer, "service_invoice", 100), invoice(customer, "product_sale", 50), invoice(customer, "final_invoice", 25)]
    field = [invoice(customer, "field_job", 200), invoice(customer, "service_invoice", 300, job=job)]
    invoice(customer, "field_job", 900, status="draft")
    invoice(customer, "product_sale", 800, status="cancelled")
    for segment, docs, expected in (("workshop", workshop, 175), ("field", field, 500)):
        params = {"segment": segment, "from": "2026-10-01", "to": "2026-10-31"}
        sales = client.get("/api/reports/sales/", params).data
        assert sales["sales_by_month"][0]["total"] == expected
        assert sales["sales_by_month"][0]["count"] == len(docs)
        assert {r["invoice_number"] for r in sales["pending_invoices"]} == {d.invoice_number for d in docs}
        profit = client.get("/api/reports/profit/", params).data
        assert profit["totals"]["revenue"] == expected
        assert profit["totals"]["cost"] == len(docs) * 10
        assert {r["invoice_number"] for r in profit["by_invoice"]} == {d.invoice_number for d in docs}
    assert client.get("/api/reports/sales/").data["sales_by_month"][0]["total"] == 175


def test_pending_balances_respect_segment_and_invoice_date(client):
    customer = Customer.objects.create(name="Cliente")
    invoice(customer, "product_sale", 90, day=date(2025, 1, 1))
    invoice(customer, "field_job", 80)
    sales = client.get("/api/reports/sales/", {"segment": "workshop", "from": "2026-10-01"}).data
    assert sales["pending_invoices"] == []
    assert sales["sales_by_month"] == []
    for path in ("sales", "profit"):
        assert client.get(f"/api/reports/{path}/", {"segment": "unknown"}).status_code == 400


def test_field_activity_uses_real_work_and_completion_date(client):
    customer = Customer.objects.create(name="Cliente")
    FieldJob.objects.create(customer=customer, scheduled_date=date(2026, 9, 1), done_date=date(2026, 10, 2), status="done", hectares=100, actual_hectares=8, job_type="fumigation")
    FieldJob.objects.create(customer=customer, scheduled_date=date(2026, 10, 3), done_date=date(2026, 10, 4), status="invoiced", hectares=50, actual_hectares=5, applied_quintals=12, job_type="spreading")
    FieldJob.objects.create(customer=customer, scheduled_date=date(2026, 10, 5), status="scheduled", hectares=200)
    FieldJob.objects.create(customer=customer, scheduled_date=date(2026, 10, 6), status="cancelled", actual_hectares=999)
    FieldJob.objects.create(customer=customer, done_date=date(2025, 10, 2), status="done", actual_hectares=999)
    data = client.get("/api/reports/field-jobs/", {"from": "2026-10-01", "to": "2026-10-31"}).data
    assert data["scheduled_count"] == 2
    assert data["completed_count"] == 2
    assert data["actual_hectares"] == 13
    assert data["applied_quintals"] == 12
    assert {row["job_type"]: row["count"] for row in data["by_type"]} == {"fumigation": 1, "spreading": 1}
    assert client.get("/api/reports/field-jobs/", {"from": "bad"}).status_code == 400


def test_below_floor_excludes_field_invoices(client):
    customer = Customer.objects.create(name="Cliente")
    product = Product.objects.create(sku="SEG-PART", name="Pieza", min_sale_price=50)
    field = invoice(customer, "field_job", 20)
    workshop = invoice(customer, "product_sale", 20)
    for doc in (field, workshop):
        doc.lines.update(product=product)
    rows = client.get("/api/reports/below-floor-sales/").data["items"]
    assert [row["document"] for row in rows] == [workshop.invoice_number]


def test_field_operational_report_requires_authentication(client):
    assert APIClient().get("/api/reports/field-jobs/").status_code == 401
    client.force_authenticate(User.objects.create_user(email="pilot-report@example.com", password="x", full_name="Piloto", role="piloto"))
    assert client.get("/api/reports/field-jobs/").status_code == 200
    assert client.get("/api/reports/sales/", {"segment": "field"}).status_code == 403
