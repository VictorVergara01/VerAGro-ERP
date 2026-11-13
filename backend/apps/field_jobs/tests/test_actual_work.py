from decimal import Decimal
import importlib

import pytest
from django.apps import apps
from rest_framework.test import APIClient

from apps.customers.models import Customer
from apps.field_jobs.models import FieldJob
from apps.users.models import User

pytestmark = pytest.mark.django_db


def create_job(unit="qq"):
    client = APIClient()
    client.force_authenticate(User.objects.create_user(email="actual@example.com", password="pass", role="super_admin"))
    result = client.post("/api/field-jobs/", {
        "customer": Customer.objects.create(name="Finca real").pk,
        "job_type": "spreading", "billing_unit": unit,
        "hectares": "10", "planned_quintals": "30",
        "unit_price": "15" if unit == "qq" else "25",
    }, format="json")
    assert result.status_code == 201, result.data
    return client, result.data["id"]


@pytest.mark.parametrize("unit, estimate, actual", [("qq", "450.00", "390.00"), ("ha", "250.00", "212.50")])
def test_actual_quantity_drives_invoice_and_preserves_plan(unit, estimate, actual):
    client, pk = create_job(unit)
    before = client.get(f"/api/field-jobs/{pk}/").data
    assert before["estimated_total"] == estimate
    assert before["quintals_per_hectare"] is None
    completed = client.post(f"/api/field-jobs/{pk}/mark-done/", {
        "actual_hectares": "8.5", "applied_quintals": "26", "done_date": "2026-11-10",
    }, format="json")
    assert completed.status_code == 200, completed.data
    assert completed.data["hectares"] == "10.0000"
    assert completed.data["planned_quintals"] == "30.00"
    assert completed.data["actual_hectares"] == "8.5000"
    assert completed.data["applied_quintals"] == "26.00"
    assert completed.data["estimated_total"] == estimate
    assert completed.data["total"] == actual
    assert completed.data["done_date"] == "2026-11-10"
    invoice = client.post(f"/api/field-jobs/{pk}/generate-invoice/")
    assert invoice.status_code == 201, invoice.data
    assert invoice.data["total"] == actual
    assert Decimal(invoice.data["lines"][0]["quantity"]) == (Decimal("26") if unit == "qq" else Decimal("8.5"))
    assert "8.5000 ha trabajadas" in invoice.data["lines"][0]["description"]
    # Cerrar o facturar de nuevo no crea otro documento ni cambia los resultados.
    assert client.post(f"/api/field-jobs/{pk}/mark-done/", {"actual_hectares": "20", "applied_quintals": "50"}).status_code == 400
    assert client.post(f"/api/field-jobs/{pk}/generate-invoice/").status_code == 400
    assert client.patch(f"/api/field-jobs/{pk}/", {"hectares": "20"}, format="json").status_code == 400
    job = FieldJob.objects.get(pk=pk)
    assert job.actual_hectares == Decimal("8.5")
    assert job.invoices.count() == 1


@pytest.mark.parametrize("body", [{}, {"actual_hectares": "8.5"}, {"actual_hectares": "0", "applied_quintals": "26"}, {"actual_hectares": "8.5", "applied_quintals": "-2"}])
def test_cannot_finish_qq_work_without_valid_actual_quantities(body):
    client, pk = create_job()
    result = client.post(f"/api/field-jobs/{pk}/mark-done/", body, format="json")
    assert result.status_code == 400
    assert FieldJob.objects.get(pk=pk).status == "scheduled"


def test_more_work_than_planned_is_allowed_and_billed_as_recorded():
    client, pk = create_job()
    result = client.post(f"/api/field-jobs/{pk}/mark-done/", {"actual_hectares": "12", "applied_quintals": "36"})
    assert result.status_code == 200
    assert result.data["total"] == "540.00"
    assert result.data["estimated_total"] == "450.00"


def test_legacy_completed_jobs_keep_values_and_are_identified():
    customer = Customer.objects.create(name="Anterior")
    job = FieldJob.objects.create(customer=customer, job_type="spreading", status="invoiced", hectares=10, quintals_per_hectare=3, billing_unit="qq", total=450)
    migration = importlib.import_module("apps.field_jobs.migrations.0006_fieldjob_actual_hectares_fieldjob_applied_quintals_and_more")
    migration.preserve_completed_jobs(apps, None)
    job.refresh_from_db()
    assert job.actuals_from_legacy
    assert job.actual_hectares == Decimal("10")
    assert job.applied_quintals == Decimal("30")
    assert job.total == Decimal("450")
