import pytest
from decimal import Decimal
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.customers.models import Customer
from apps.equipment.models import EquipmentType, EquipmentModel, EquipmentComponent, Equipment
from apps.inventory.models import Product, ProductCompatibility
from apps.service_orders.models import ServiceOrder

User = get_user_model()


@pytest.fixture
def tech(db):
    u = User.objects.create_user(email="t@v.com", password="x", full_name="t", role="technician")
    c = APIClient()
    c.force_authenticate(user=u)
    return c


@pytest.fixture
def scenario(db):
    cli = Customer.objects.create(name="C")
    t, _ = EquipmentType.objects.get_or_create(name="Drone agrícola")
    m = EquipmentModel.objects.create(equipment_type=t, brand="DJI", name="DJI Agras T50", model_code="T50")
    comp = EquipmentComponent.objects.create(equipment_model=m, code="motor_m1", name="Motor")
    other_comp = EquipmentComponent.objects.create(equipment_model=m, code="prop_m1", name="Hélice")
    eq = Equipment.objects.create(name="T50 físico", equipment_type=t, customer=cli, catalog_model=m)
    prod = Product.objects.create(sku="MOT-1", name="Motor CW", sale_price=Decimal("450"))
    ProductCompatibility.objects.create(product=prod, equipment_model=m, component=comp)
    order = ServiceOrder.objects.create(customer=cli, equipment=eq)
    return cli, m, comp, other_comp, eq, prod, order


@pytest.mark.django_db
def test_order_exposes_catalog_model(tech, scenario):
    _, m, _, _, _, _, order = scenario
    resp = tech.get(f"/api/service-orders/{order.id}/")
    assert resp.data["equipment_catalog_model"] == m.id
    assert resp.data["equipment_catalog_model_name"] == "DJI Agras T50"


@pytest.mark.django_db
def test_add_structured_part_ok_saves_component(tech, scenario):
    _, _, comp, _, _, prod, order = scenario
    resp = tech.post(
        f"/api/service-orders/{order.id}/add-part/",
        {"product": prod.id, "component": comp.id, "quantity": "1"},
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["component"] == comp.id
    assert resp.data["component_name"] == "Motor"
    assert resp.data["component_path"] == "Motor"


@pytest.mark.django_db
def test_add_structured_part_incompatible_rejected(tech, scenario):
    _, _, _, other_comp, _, prod, order = scenario
    # prod es compatible con 'motor_m1', no con 'prop_m1'
    resp = tech.post(
        f"/api/service-orders/{order.id}/add-part/",
        {"product": prod.id, "component": other_comp.id, "quantity": "1"},
        format="json",
    )
    assert resp.status_code == 400
    assert "component" in resp.data


@pytest.mark.django_db
def test_add_manual_part_without_component_still_works(tech, scenario):
    cli = Customer.objects.create(name="Otro")
    order = ServiceOrder.objects.create(customer=cli)  # sin equipo
    prod = Product.objects.create(sku="X-1", name="Genérico")
    resp = tech.post(
        f"/api/service-orders/{order.id}/add-part/",
        {"product": prod.id, "quantity": "2"},
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["component"] is None


@pytest.mark.django_db
def test_structured_part_requires_catalog_model(tech, scenario):
    cli = Customer.objects.create(name="SinModelo")
    t, _ = EquipmentType.objects.get_or_create(name="Drone agrícola")
    eq = Equipment.objects.create(name="viejo", equipment_type=t, customer=cli)  # sin catalog_model
    order = ServiceOrder.objects.create(customer=cli, equipment=eq)
    _, m, comp, _, _, prod, _ = scenario
    resp = tech.post(
        f"/api/service-orders/{order.id}/add-part/",
        {"product": prod.id, "component": comp.id, "quantity": "1"},
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_patch_part_attach_component_without_resending_product(tech, scenario):
    _, _, comp, _, _, prod, order = scenario
    resp = tech.post(
        f"/api/service-orders/{order.id}/add-part/",
        {"product": prod.id, "quantity": "1"},
        format="json",
    )
    assert resp.status_code == 201, resp.data
    part_id = resp.data["id"]

    resp = tech.patch(
        f"/api/service-order-parts/{part_id}/",
        {"component": comp.id},
        format="json",
    )
    assert resp.status_code == 200, resp.data
    assert resp.data["component"] == comp.id


@pytest.mark.django_db
def test_order_component_tree(tech, scenario):
    _, m, comp, other_comp, _, _, order = scenario
    resp = tech.get(f"/api/service-orders/{order.id}/component-tree/")
    assert resp.status_code == 200
    codes = {n["code"] for n in resp.data}
    assert {"motor_m1", "prop_m1"} <= codes


@pytest.mark.django_db
def test_order_component_tree_without_catalog_model_400(tech):
    cli = Customer.objects.create(name="C")
    order = ServiceOrder.objects.create(customer=cli)  # sin equipo
    resp = tech.get(f"/api/service-orders/{order.id}/component-tree/")
    assert resp.status_code == 400


@pytest.mark.django_db
def test_order_compatible_products(tech, scenario):
    _, m, comp, _, _, prod, order = scenario
    resp = tech.get(f"/api/service-orders/{order.id}/compatible-products/?component={comp.id}")
    assert resp.status_code == 200
    assert resp.data["equipment_model"]["id"] == m.id
    assert resp.data["component"]["path"] == "Motor"
    assert [p["sku"] for p in resp.data["products"]] == ["MOT-1"]
    assert resp.data["products"][0]["available_quantity"] is not None
