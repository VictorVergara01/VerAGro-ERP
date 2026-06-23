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
        email="admin@test.com", password="x", role="general_admin", full_name="Ad Min"
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def customer():
    return Customer.objects.create(name="Finca La Esperanza")


def test_create_with_products_and_crop_other(admin_client, customer):
    payload = {
        "customer": customer.id,
        "crop": "other",
        "crop_other": "Sandía",
        "hectares": "15",
        "unit_price": "20",
        "water_per_hectare": "20",
        "tank_volume_liters": "200",
        "products": [
            {"name": "Glifosato", "dose_per_hectare": "10", "unit": "L/ha"},
            {"name": "Adherente", "dose_per_hectare": "50", "unit": "cc/ha"},
        ],
    }
    res = admin_client.post("/api/field-jobs/", payload, format="json")
    assert res.status_code == 201, res.content
    body = res.json()
    assert body["number"].startswith("TC-")
    assert body["crop_display"] == "Otros"
    assert body["crop_other"] == "Sandía"
    assert body["total"] == "300.00"
    assert len(body["products"]) == 2


def test_rejects_more_than_ten_products(admin_client, customer):
    products = [
        {"name": f"Q{i}", "dose_per_hectare": "1", "unit": "L/ha"} for i in range(11)
    ]
    res = admin_client.post(
        "/api/field-jobs/",
        {"customer": customer.id, "products": products},
        format="json",
    )
    assert res.status_code == 400
    assert "products" in res.json()


def test_update_replaces_products(admin_client, customer):
    job = FieldJob.objects.create(customer=customer, hectares=Decimal("1"))
    res = admin_client.patch(
        f"/api/field-jobs/{job.id}/",
        {"products": [{"name": "Nuevo", "dose_per_hectare": "2", "unit": "L/ha"}]},
        format="json",
    )
    assert res.status_code == 200
    assert [p["name"] for p in res.json()["products"]] == ["Nuevo"]
