import pytest
from decimal import Decimal
from rest_framework.test import APIClient

from apps.customers.models import Customer
from apps.users.models import User
from apps.field_jobs.models import FieldJob
from apps.billing.services import create_invoice_from_field_job

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize("unit, price, total", [("ha", "25.00", "250.00"), ("qq", "15.00", "450.00")])
def test_standard_solid_rates(unit, price, total):
    client, payload = client_and_payload()
    payload.pop("unit_price")
    payload.update(hectares="10", billing_unit=unit, quintals_per_hectare="3")
    result = client.post("/api/field-jobs/", payload, format="json")
    assert result.status_code == 201, result.data
    assert result.data["unit_price"] == price
    assert result.data["total"] == total


def client_and_payload():
    user = User.objects.create_user(email="solids@example.com", password="pass", role="super_admin")
    client = APIClient()
    client.force_authenticate(user)
    return client, {
        "customer": Customer.objects.create(name="Finca sólidos").pk,
        "job_type": "spreading", "hectares": "12.5", "unit_price": "10",
        "products": [{"name": "Abono", "dose_per_hectare": "25", "unit": "kg/ha"}],
    }


def test_spreading_create_filter_complete_and_invoice():
    client, payload = client_and_payload()
    response = client.post("/api/field-jobs/", {**payload, "water_per_hectare": "20"}, format="json")
    assert response.status_code == 201
    assert response.data["water_per_hectare"] is None
    assert response.data["total"] == "125.00"
    job_id = response.data["id"]
    assert client.get("/api/field-jobs/?job_type=spreading").data["count"] == 1
    assert client.get("/api/field-jobs/?job_type=fumigation").data["count"] == 0
    assert client.post(f"/api/field-jobs/{job_id}/mark-done/", {"actual_hectares": "12.5"}).status_code == 200
    invoice = client.post(f"/api/field-jobs/{job_id}/generate-invoice/")
    assert invoice.status_code == 201
    assert invoice.data["total"] == "125.00"
    assert "sólidos" in invoice.data["lines"][0]["description"]


def test_spreading_rejects_liquid_units():
    client, payload = client_and_payload()
    payload["products"][0]["unit"] = "L/ha"
    assert client.post("/api/field-jobs/", payload, format="json").status_code == 400


@pytest.mark.parametrize("unit, expected", [("ha", "100.00"), ("qq", "300.00")])
def test_urea_three_quintals_per_hectare_billing_and_invoice(unit, expected):
    client, payload = client_and_payload()
    payload.update(hectares="10", billing_unit=unit, quintals_per_hectare="3", unit_price="10")
    payload["products"][0].update(name="Urea", dose_per_hectare="3", unit="qq/ha")
    result = client.post("/api/field-jobs/", payload, format="json")
    assert result.status_code == 201, result.data
    assert result.data["total_quintals"] == "30.00"
    assert result.data["total"] == expected
    job = FieldJob.objects.get(pk=result.data["id"])
    job.status = "done"
    job.actual_hectares = job.hectares
    job.applied_quintals = job.estimated_quintals
    job.save()
    invoice = create_invoice_from_field_job(job=job)
    assert invoice.total == Decimal(expected)
    line = invoice.lines.get()
    assert line.quantity == (Decimal("30") if unit == "qq" else Decimal("10"))
    assert f"/{unit}" in line.description
    assert "qq/ha" in line.description


@pytest.mark.parametrize("dose", [None, "0", "-3"])
def test_quintal_billing_requires_positive_application_rate(dose):
    client, payload = client_and_payload()
    payload.update(billing_unit="qq", quintals_per_hectare=dose)
    result = client.post("/api/field-jobs/", payload, format="json")
    assert result.status_code == 400
    assert "quintals_per_hectare" in result.data


def test_pulverization_cannot_charge_quintals():
    client, payload = client_and_payload()
    payload.update(job_type="fumigation", billing_unit="qq", quintals_per_hectare="3")
    assert client.post("/api/field-jobs/", payload, format="json").status_code == 400


def test_editing_application_rate_recalculates_and_invoice_uses_same_rounding():
    client, payload = client_and_payload()
    payload.update(hectares="1.2345", billing_unit="qq", quintals_per_hectare="3", unit_price="7.99")
    response = client.post("/api/field-jobs/", payload, format="json")
    assert response.status_code == 201
    job_id = response.data["id"]
    updated = client.patch(f"/api/field-jobs/{job_id}/", {"quintals_per_hectare": "4"}, format="json")
    assert updated.status_code == 200
    assert updated.data["total_quintals"] == "4.94"
    job = FieldJob.objects.get(pk=job_id)
    job.status = "done"
    job.actual_hectares = job.hectares
    job.applied_quintals = job.estimated_quintals
    job.save()
    invoice = create_invoice_from_field_job(job=job)
    assert invoice.total == Decimal(updated.data["total"])


def test_switch_to_solids_requires_review_of_existing_liquid_recipe():
    client, payload = client_and_payload()
    payload["job_type"] = "fumigation"
    payload["products"][0]["unit"] = "L/ha"
    response = client.post("/api/field-jobs/", payload, format="json")
    assert response.status_code == 201
    result = client.patch(f"/api/field-jobs/{response.data['id']}/", {"job_type": "spreading"}, format="json")
    assert result.status_code == 400
