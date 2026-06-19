from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.customers.models import Customer
from apps.field_jobs.models import FieldJob

User = get_user_model()
URL = "/api/field-jobs/"


def _client(role="technician"):
    user = User.objects.create_user(
        email=f"{role}@v.com", password="x", full_name=role, role=role
    )
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture
def customer(db):
    return Customer.objects.create(name="Finca La Esperanza")


@pytest.mark.django_db
def test_create_fumigation_job_computes_total(customer):
    c = _client("technician")
    resp = c.post(
        URL,
        {"customer": customer.id, "job_type": "fumigation",
         "hectares": "12.5", "unit_price": "20", "location": "Lote 3"},
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["number"].startswith("TC-")
    assert Decimal(resp.data["total"]) == Decimal("250.00")


@pytest.mark.django_db
def test_filters_by_type_status_and_date(customer):
    from datetime import date

    c = _client("technician")
    FieldJob.objects.create(customer=customer, job_type="fumigation", scheduled_date=date(2026, 6, 1))
    FieldJob.objects.create(customer=customer, job_type="spreading", scheduled_date=date(2026, 1, 1))
    assert len(c.get(f"{URL}?job_type=fumigation").data["results"]) == 1
    assert len(c.get(f"{URL}?status=scheduled").data["results"]) == 2
    assert len(c.get(f"{URL}?from=2026-05-01&to=2026-07-01").data["results"]) == 1
    assert c.get(f"{URL}?from=nope").status_code == 400


@pytest.mark.django_db
def test_search_by_location_and_customer(customer):
    c = _client("technician")
    FieldJob.objects.create(customer=customer, location="Finca Los Naranjos")
    assert len(c.get(f"{URL}?search=Naranjos").data["results"]) == 1
    assert len(c.get(f"{URL}?search=Esperanza").data["results"]) == 1  # customer__name


@pytest.mark.django_db
def test_mark_done_then_generate_invoice(customer):
    c = _client("technician")
    job = FieldJob.objects.create(
        customer=customer, job_type="fumigation",
        hectares=Decimal("10"), unit_price=Decimal("20"),
    )
    job.total = Decimal("200")
    job.save(update_fields=["total"])
    done = c.post(f"{URL}{job.id}/mark-done/")
    assert done.status_code == 200
    assert done.data["status"] == "done"
    inv = c.post(f"{URL}{job.id}/generate-invoice/")
    assert inv.status_code == 201, inv.data
    assert inv.data["invoice_number"].startswith("FUM-")
    job.refresh_from_db()
    assert job.status == "invoiced"


@pytest.mark.django_db
def test_cancel_action(customer):
    c = _client("technician")
    job = FieldJob.objects.create(customer=customer)
    resp = c.post(f"{URL}{job.id}/cancel/")
    assert resp.status_code == 200
    assert resp.data["status"] == "cancelled"


@pytest.mark.django_db
def test_calculate_mix_endpoint(customer):
    c = _client("technician")
    resp = c.post(
        f"{URL}calculate-mix/",
        {"hectares": 12.0, "water_per_hectare": 8.0, "tank_volume_liters": 30.0,
         "products": [{"name": "Glifosato", "dose_per_liter": 8.0, "dose_unit": "mL/L"}]},
        format="json",
    )
    assert resp.status_code == 200, resp.data
    assert resp.data["fills_needed"] == 4
    assert resp.data["per_full_fill"][0]["quantity"] == 240.0


@pytest.mark.django_db
def test_calculate_mix_validation_error(customer):
    c = _client("technician")
    resp = c.post(
        f"{URL}calculate-mix/",
        {"hectares": 0, "water_per_hectare": 8.0, "tank_volume_liters": 30.0,
         "products": [{"name": "X", "dose_per_liter": 8.0, "dose_unit": "mL/L"}]},
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_permissions_viewer_readonly_anon_denied(customer):
    FieldJob.objects.create(customer=customer)
    # readonly puede leer
    viewer = _client("readonly")
    assert viewer.get(URL).status_code == 200
    # readonly no puede escribir
    assert viewer.post(URL, {"customer": customer.id}, format="json").status_code == 403
    # anónimo no puede leer
    assert APIClient().get(URL).status_code == 401
