import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.customers.models import Customer
from apps.field_jobs.models import FieldJob

User = get_user_model()
URL = "/api/field-jobs/"


def _client(role="technician"):
    user = User.objects.create_user(email=f"{role}@v.com", password="x", full_name=role, role=role)
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture
def customer(db):
    return Customer.objects.create(name="Finca")


@pytest.mark.django_db
def test_create_job_with_products(customer):
    c = _client()
    resp = c.post(
        URL,
        {"customer": customer.id, "job_type": "fumigation",
         "products": [{"name": "Glifosato", "dose_per_hectare": "1.5", "unit": "L/ha"},
                      {"name": "Urea", "dose_per_hectare": "2", "unit": "kg/ha"}]},
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert [p["name"] for p in resp.data["products"]] == ["Glifosato", "Urea"]
    job = FieldJob.objects.get(pk=resp.data["id"])
    assert job.products.count() == 2


@pytest.mark.django_db
def test_update_replaces_products(customer):
    c = _client()
    job = FieldJob.objects.create(customer=customer)
    job.products.create(name="Viejo", dose_per_hectare="1", unit="L/ha")
    resp = c.patch(
        f"{URL}{job.id}/",
        {"products": [{"name": "Nuevo", "dose_per_hectare": "3", "unit": "kg/ha"}]},
        format="json",
    )
    assert resp.status_code == 200, resp.data
    names = list(job.products.values_list("name", flat=True))
    assert names == ["Nuevo"]


@pytest.mark.django_db
def test_detail_returns_products(customer):
    c = _client()
    job = FieldJob.objects.create(customer=customer)
    job.products.create(name="Glifosato", dose_per_hectare="1.5", unit="L/ha")
    resp = c.get(f"{URL}{job.id}/")
    assert resp.status_code == 200
    assert resp.data["products"][0]["name"] == "Glifosato"
    assert resp.data["products"][0]["unit"] == "L/ha"
