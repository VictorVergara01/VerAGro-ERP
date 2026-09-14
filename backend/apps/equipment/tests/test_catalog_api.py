import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.equipment.models import EquipmentType, EquipmentModel, EquipmentComponent

User = get_user_model()


def _client(role):
    u = User.objects.create_user(email=f"{role}@v.com", password="x", full_name=role, role=role)
    c = APIClient()
    c.force_authenticate(user=u)
    return c


@pytest.fixture
def inv_client(db):
    return _client("inventory")


@pytest.fixture
def drone(db):
    t, _ = EquipmentType.objects.get_or_create(name="Drone agrícola")
    return t


@pytest.mark.django_db
def test_create_and_list_equipment_model(inv_client, drone):
    resp = inv_client.post(
        "/api/equipment/models/",
        {"equipment_type": drone.id, "brand": "DJI", "name": "DJI Agras T50", "model_code": "T50-TEST"},
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["equipment_type_name"] == "Drone agrícola"
    lst = inv_client.get("/api/equipment/models/")
    names = [m["name"] for m in lst.data]  # sin paginación
    assert "DJI Agras T50" in names


@pytest.mark.django_db
def test_equipment_model_soft_delete(inv_client, drone):
    m = EquipmentModel.objects.create(equipment_type=drone, brand="DJI", name="T50", model_code="T50-TEST")
    assert inv_client.delete(f"/api/equipment/models/{m.id}/").status_code == 204
    m.refresh_from_db()
    assert m.is_active is False
    assert "T50" not in [x["name"] for x in inv_client.get("/api/equipment/models/").data]


@pytest.mark.django_db
def test_component_tree_endpoint(inv_client, drone):
    m = EquipmentModel.objects.create(equipment_type=drone, brand="DJI", name="T50", model_code="T50-TEST")
    prop = EquipmentComponent.objects.create(equipment_model=m, code="propulsion", name="Sistema de propulsión", component_type="assembly", sort_order=0)
    arm = EquipmentComponent.objects.create(equipment_model=m, parent=prop, code="arm_m1", name="Brazo M1", component_type="assembly", sort_order=0)
    EquipmentComponent.objects.create(equipment_model=m, parent=arm, code="motor_m1", name="Motor", sort_order=0)
    resp = inv_client.get(f"/api/equipment/models/{m.id}/component-tree/")
    assert resp.status_code == 200
    assert len(resp.data) == 1
    root = resp.data[0]
    assert root["code"] == "propulsion"
    assert root["children"][0]["code"] == "arm_m1"
    assert root["children"][0]["children"][0]["code"] == "motor_m1"


@pytest.mark.django_db
def test_model_write_requires_role(drone):
    ro = _client("readonly")
    resp = ro.post(
        "/api/equipment/models/",
        {"equipment_type": drone.id, "brand": "DJI", "name": "T50", "model_code": "T50-TEST"},
        format="json",
    )
    assert resp.status_code == 403


@pytest.mark.django_db
def test_component_crud_and_filter(inv_client, drone):
    m = EquipmentModel.objects.create(equipment_type=drone, brand="DJI", name="T50", model_code="T50-TEST")
    root = inv_client.post(
        "/api/equipment/components/",
        {"equipment_model": m.id, "code": "propulsion", "name": "Propulsión", "component_type": "assembly"},
        format="json",
    )
    assert root.status_code == 201, root.data
    child = inv_client.post(
        "/api/equipment/components/",
        {"equipment_model": m.id, "parent": root.data["id"], "code": "motor", "name": "Motor"},
        format="json",
    )
    assert child.status_code == 201
    assert child.data["path"] == "Propulsión > Motor"
    # Filtro por modelo
    by_model = inv_client.get(f"/api/equipment/components/?equipment_model={m.id}")
    codes = [c["code"] for c in by_model.data]
    assert set(codes) == {"propulsion", "motor"}
    # Filtro por parent
    by_parent = inv_client.get(f"/api/equipment/components/?parent={root.data['id']}")
    assert [c["code"] for c in by_parent.data] == ["motor"]


@pytest.mark.django_db
def test_component_rejects_parent_of_other_model(inv_client, drone):
    m1 = EquipmentModel.objects.create(equipment_type=drone, brand="DJI", name="A", model_code="A")
    m2 = EquipmentModel.objects.create(equipment_type=drone, brand="DJI", name="B", model_code="B")
    p = EquipmentComponent.objects.create(equipment_model=m1, code="a", name="A")
    resp = inv_client.post(
        "/api/equipment/components/",
        {"equipment_model": m2.id, "parent": p.id, "code": "b", "name": "B"},
        format="json",
    )
    assert resp.status_code == 400
    assert "parent" in resp.data
