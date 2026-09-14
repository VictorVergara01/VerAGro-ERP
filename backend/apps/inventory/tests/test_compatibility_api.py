import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.equipment.models import EquipmentType, EquipmentModel, EquipmentComponent
from apps.inventory.models import Product, ProductCompatibility

User = get_user_model()


def _client(role):
    u = User.objects.create_user(email=f"{role}@v.com", password="x", full_name=role, role=role)
    c = APIClient()
    c.force_authenticate(user=u)
    return c


@pytest.fixture
def setup(db):
    inv = _client("inventory")
    t, _ = EquipmentType.objects.get_or_create(name="Drone agrícola")
    m = EquipmentModel.objects.create(equipment_type=t, brand="DJI", name="T50", model_code="T50-TEST")
    comp = EquipmentComponent.objects.create(equipment_model=m, code="motor_m1", name="Motor")
    prod = Product.objects.create(sku="MOT-1", name="Motor CW")
    return inv, m, comp, prod


@pytest.mark.django_db
def test_create_compatibility_exposes_paths(setup):
    inv, m, comp, prod = setup
    resp = inv.post(
        "/api/inventory/product-compatibilities/",
        {"product": prod.id, "equipment_model": m.id, "component": comp.id, "is_primary": True},
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["component_name"] == "Motor"
    assert resp.data["component_path"] == "Motor"
    assert resp.data["equipment_model_name"] == "T50"


@pytest.mark.django_db
def test_reject_component_of_other_model(setup):
    inv, m, comp, prod = setup
    other = EquipmentModel.objects.create(equipment_type=m.equipment_type, brand="DJI", name="D", model_code="D")
    resp = inv.post(
        "/api/inventory/product-compatibilities/",
        {"product": prod.id, "equipment_model": other.id, "component": comp.id},
        format="json",
    )
    assert resp.status_code == 400
    assert "component" in resp.data


@pytest.mark.django_db
def test_filter_compatibilities(setup):
    inv, m, comp, prod = setup
    ProductCompatibility.objects.create(product=prod, equipment_model=m, component=comp)
    assert len(inv.get(f"/api/inventory/product-compatibilities/?product={prod.id}").data["results"]) == 1
    assert len(inv.get(f"/api/inventory/product-compatibilities/?component={comp.id}").data["results"]) == 1
    assert len(inv.get(f"/api/inventory/product-compatibilities/?equipment_model={m.id}").data["results"]) == 1


@pytest.mark.django_db
def test_compatibility_write_requires_role(setup):
    _, m, comp, prod = setup
    ro = _client("readonly")
    resp = ro.post(
        "/api/inventory/product-compatibilities/",
        {"product": prod.id, "equipment_model": m.id, "component": comp.id},
        format="json",
    )
    assert resp.status_code == 403
