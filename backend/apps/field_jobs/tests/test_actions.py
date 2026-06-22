import pytest
from decimal import Decimal

from rest_framework.test import APIClient

from apps.customers.models import Customer
from apps.field_jobs.models import FieldJob
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
def customer():
    return Customer.objects.create(name="Finca")


def test_search_by_crop(admin_client, customer):
    FieldJob.objects.create(customer=customer, crop=FieldJob.Crop.CORN)
    res = admin_client.get("/api/field-jobs/?search=corn")
    assert res.status_code == 200
    assert res.json()["count"] >= 1


def test_mark_done_then_generate_invoice(admin_client, customer):
    job = FieldJob.objects.create(
        customer=customer, hectares=Decimal("10"), unit_price=Decimal("20")
    )
    job.recalculate_total()
    job.save()
    assert admin_client.post(f"/api/field-jobs/{job.id}/mark-done/").status_code == 200
    res = admin_client.post(f"/api/field-jobs/{job.id}/generate-invoice/")
    assert res.status_code == 201, res.content
    job.refresh_from_db()
    assert job.status == FieldJob.Status.INVOICED


def test_cancel(admin_client, customer):
    job = FieldJob.objects.create(customer=customer)
    assert admin_client.post(f"/api/field-jobs/{job.id}/cancel/").status_code == 200
    job.refresh_from_db()
    assert job.status == FieldJob.Status.CANCELLED
