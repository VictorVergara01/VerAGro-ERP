import pytest
from rest_framework.test import APIClient

from apps.billing.models import Invoice
from apps.customers.models import Customer
from apps.users.models import User

pytestmark = pytest.mark.django_db


@pytest.fixture
def admin_client():
    user = User.objects.create_user(
        email="a@test.com", password="x", role="general_admin", full_name="A B"
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def issued_invoice():
    customer = Customer.objects.create(name="Cliente FEL")
    return Invoice.objects.create(customer=customer, status=Invoice.Status.ISSUED)


def test_emit_fiscal_action_and_serializer_fields(admin_client, issued_invoice):
    res = admin_client.post(f"/api/invoices/{issued_invoice.id}/emit-fiscal/")
    assert res.status_code == 200, res.content
    body = res.json()
    assert body["fiscal"]["cufe"].startswith("FE")
    assert body["fiscal"]["status"] == "authorized"


def test_cafe_download(admin_client, issued_invoice):
    admin_client.post(f"/api/invoices/{issued_invoice.id}/emit-fiscal/")
    res = admin_client.get(f"/api/invoices/{issued_invoice.id}/cafe/")
    assert res.status_code == 200
    assert res["Content-Type"] == "application/pdf"
    assert res.content[:4] == b"%PDF"


def test_cafe_404_without_fiscal(admin_client, issued_invoice):
    res = admin_client.get(f"/api/invoices/{issued_invoice.id}/cafe/")
    assert res.status_code == 400


def test_cancel_voids_fiscal_document(admin_client, issued_invoice):
    admin_client.post(f"/api/invoices/{issued_invoice.id}/emit-fiscal/")
    admin_client.post(f"/api/invoices/{issued_invoice.id}/cancel/")
    issued_invoice.refresh_from_db()
    assert issued_invoice.fiscal.fiscal_status == "cancelled"


def test_serializer_fiscal_null_when_not_emitted(admin_client, issued_invoice):
    res = admin_client.get(f"/api/invoices/{issued_invoice.id}/")
    assert res.status_code == 200
    assert res.json()["fiscal"] is None
