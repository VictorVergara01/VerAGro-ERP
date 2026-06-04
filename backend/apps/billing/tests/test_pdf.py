from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.billing.models import Invoice, InvoiceLine
from apps.customers.models import Customer

User = get_user_model()


def _client(role):
    user = User.objects.create_user(
        email=f"{role}@veragro.com", password="x", full_name=role, role=role
    )
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture
def invoice(db):
    customer = Customer.objects.create(name="Cliente PDF", phone="61234567")
    inv = Invoice.objects.create(customer=customer, status=Invoice.Status.ISSUED)
    InvoiceLine.objects.create(
        invoice=inv, description="Mano de obra", quantity=1, unit_price=Decimal("80")
    )
    from apps.billing.services import recalculate_invoice

    recalculate_invoice(inv)
    return inv


@pytest.mark.django_db
def test_invoice_pdf_returns_pdf(invoice):
    client = _client("sales")
    resp = client.get(f"/api/invoices/{invoice.id}/pdf/")
    assert resp.status_code == 200
    assert resp["Content-Type"] == "application/pdf"
    assert resp["Content-Disposition"].startswith("inline")
    assert invoice.invoice_number in resp["Content-Disposition"]
    content = b"".join(resp.streaming_content) if resp.streaming else resp.content
    assert content[:4] == b"%PDF"


@pytest.mark.django_db
def test_invoice_pdf_download_disposition(invoice):
    client = _client("sales")
    resp = client.get(f"/api/invoices/{invoice.id}/pdf/?download=1")
    assert resp.status_code == 200
    assert resp["Content-Disposition"].startswith("attachment")


@pytest.mark.django_db
def test_invoice_pdf_requires_auth(invoice):
    resp = APIClient().get(f"/api/invoices/{invoice.id}/pdf/")
    assert resp.status_code == 401


@pytest.mark.django_db
def test_company_profile_get_and_admin_update(db):
    # GET disponible para cualquier autenticado; default name "Veragro".
    tech = _client("technician")
    resp = tech.get("/api/company/")
    assert resp.status_code == 200
    assert resp.data["name"] == "Veragro"

    # No-admin no puede modificar.
    assert tech.patch(
        "/api/company/", {"name": "Hack"}, format="json"
    ).status_code == 403

    # Admin sí; el singleton persiste (pk=1).
    admin = _client("admin")
    upd = admin.patch(
        "/api/company/",
        {"name": "Veragro S.A.", "tax_id": "155-1-2024", "whatsapp": "60001111"},
        format="json",
    )
    assert upd.status_code == 200
    assert upd.data["name"] == "Veragro S.A."

    from apps.core.models import CompanyProfile

    assert CompanyProfile.objects.count() == 1
    assert CompanyProfile.load().tax_id == "155-1-2024"
