from decimal import Decimal

import pytest

from apps.customers.models import Customer
from apps.field_jobs.models import FieldJob, FieldJobProduct


@pytest.mark.django_db
def test_field_job_has_products():
    job = FieldJob.objects.create(customer=Customer.objects.create(name="C"))
    FieldJobProduct.objects.create(field_job=job, name="Glifosato", dose_per_hectare=Decimal("1.5"), unit="L/ha")
    FieldJobProduct.objects.create(field_job=job, name="Urea", dose_per_hectare=Decimal("2"), unit="kg/ha")
    names = list(job.products.values_list("name", flat=True))
    assert names == ["Glifosato", "Urea"]  # ordenado por id


@pytest.mark.django_db
def test_deleting_job_cascades_products():
    job = FieldJob.objects.create(customer=Customer.objects.create(name="C"))
    FieldJobProduct.objects.create(field_job=job, name="X", dose_per_hectare=Decimal("1"), unit="L/ha")
    job.delete()
    assert FieldJobProduct.objects.count() == 0
