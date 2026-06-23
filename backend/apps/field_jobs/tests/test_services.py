from decimal import Decimal

import pytest
from rest_framework.exceptions import ValidationError

from apps.customers.models import Customer
from apps.field_jobs.models import FieldJob
from apps.field_jobs.services import cancel_job, mark_done


def _job(**kwargs):
    defaults = dict(
        customer=Customer.objects.create(name="C"),
        hectares=Decimal("10"),
        unit_price=Decimal("20"),
    )
    defaults.update(kwargs)
    return FieldJob.objects.create(**defaults)


@pytest.mark.django_db
def test_mark_done_from_scheduled():
    job = _job()
    mark_done(job)
    job.refresh_from_db()
    assert job.status == FieldJob.Status.DONE
    assert job.done_date is not None


@pytest.mark.django_db
def test_mark_done_fails_if_not_scheduled():
    job = _job(status=FieldJob.Status.DONE)
    with pytest.raises(ValidationError):
        mark_done(job)


@pytest.mark.django_db
def test_cancel_from_scheduled_and_done():
    job = _job()
    cancel_job(job)
    job.refresh_from_db()
    assert job.status == FieldJob.Status.CANCELLED

    job2 = _job(status=FieldJob.Status.DONE)
    cancel_job(job2)
    job2.refresh_from_db()
    assert job2.status == FieldJob.Status.CANCELLED


@pytest.mark.django_db
def test_cancel_fails_if_invoiced():
    job = _job(status=FieldJob.Status.INVOICED)
    with pytest.raises(ValidationError):
        cancel_job(job)
