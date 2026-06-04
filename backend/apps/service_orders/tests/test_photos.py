from io import BytesIO

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APIClient

from apps.customers.models import Customer
from apps.service_orders.models import ServiceOrder

User = get_user_model()


def _client(role):
    user = User.objects.create_user(
        email=f"{role}@veragro.com", password="x", full_name=role, role=role
    )
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def _png():
    buf = BytesIO()
    Image.new("RGB", (8, 8), "red").save(buf, format="PNG")
    buf.seek(0)
    return SimpleUploadedFile("foto.png", buf.read(), content_type="image/png")


@pytest.fixture
def order(db):
    customer = Customer.objects.create(name="Cliente Foto")
    return ServiceOrder.objects.create(customer=customer)


@pytest.mark.django_db
def test_upload_and_list_photo(order, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    c = _client("technician")
    resp = c.post(
        "/api/service-order-photos/",
        {"service_order": order.id, "image": _png(), "caption": "Antes"},
        format="multipart",
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["caption"] == "Antes"
    assert resp.data["image"]  # URL del archivo

    listed = c.get(f"/api/service-order-photos/?service_order={order.id}")
    assert listed.status_code == 200
    assert listed.data["count"] == 1


@pytest.mark.django_db
def test_upload_requires_write_role(order, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    c = _client("readonly")
    resp = c.post(
        "/api/service-order-photos/",
        {"service_order": order.id, "image": _png()},
        format="multipart",
    )
    assert resp.status_code == 403
