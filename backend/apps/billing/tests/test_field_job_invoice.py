from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.exceptions import ValidationError

from apps.billing.models import Invoice
from apps.billing.services import create_invoice_from_field_job
from apps.customers.models import Customer
from apps.field_jobs.models import FieldJob

User = get_user_model()


def _done_job(**kwargs):
    defaults = dict(
        customer=Customer.objects.create(name="Finca La Esperanza"),
        job_type=FieldJob.JobType.FUMIGATION,
        status=FieldJob.Status.DONE,
        hectares=Decimal("12.5"),
        unit_price=Decimal("20"),
        location="Finca La Esperanza",
    )
    defaults.update(kwargs)
    return FieldJob.objects.create(**defaults)


@pytest.mark.django_db
def test_invoice_requires_done_status():
    job = _done_job(status=FieldJob.Status.SCHEDULED)
    with pytest.raises(ValidationError):
        create_invoice_from_field_job(job=job)


@pytest.mark.django_db
def test_invoice_fumigation_line_and_number_and_status():
    job = _done_job()
    invoice = create_invoice_from_field_job(job=job)
    assert invoice.invoice_type == Invoice.InvoiceType.FIELD_JOB
    assert invoice.invoice_number.startswith("FUM-")
    assert invoice.field_job_id == job.id
    line = invoice.lines.get()
    assert line.quantity == Decimal("12.50")
    assert line.unit_price == Decimal("20.00")
    assert "Fumigación" in line.description
    assert "ha" in line.description
    assert line.line_type == "service"
    job.refresh_from_db()
    assert job.status == FieldJob.Status.INVOICED


@pytest.mark.django_db
def test_invoice_spreading_raises_not_implemented():
    job = _done_job(
        job_type=FieldJob.JobType.SPREADING,
        unit_price=Decimal("10"),
        location="Finca Los Naranjos",
    )
    with pytest.raises(ValidationError):
        create_invoice_from_field_job(job=job)


@pytest.mark.django_db
def test_invoice_rejects_double_billing():
    job = _done_job()
    create_invoice_from_field_job(job=job)
    job.refresh_from_db()
    job.status = FieldJob.Status.DONE  # forzar para reintentar
    job.save(update_fields=["status"])
    with pytest.raises(ValidationError):
        create_invoice_from_field_job(job=job)
