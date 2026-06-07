import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.customers.models import Customer
from apps.equipment.models import Equipment, EquipmentType

User = get_user_model()


@pytest.fixture
def equipment_type(db):
    t, _ = EquipmentType.objects.get_or_create(name="Bomba")
    return t


@pytest.fixture
def admin_client(db):
    user = User.objects.create_user(
        email="admin@veragro.com", password="x", full_name="Admin", role="super_admin"
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.mark.django_db
def test_create_company_equipment(admin_client, equipment_type):
    resp = admin_client.post(
        "/api/equipment/",
        {"name": "Planta 1", "equipment_type": equipment_type.id, "owner_type": "company"},
        format="json",
    )
    assert resp.status_code == 201
    assert resp.data["name"] == "Planta 1"


@pytest.mark.django_db
def test_create_customer_equipment_requires_customer(admin_client, equipment_type):
    resp = admin_client.post(
        "/api/equipment/",
        {"name": "Bomba X", "equipment_type": equipment_type.id, "owner_type": "customer"},
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_search_by_serial(admin_client, equipment_type):
    Equipment.objects.create(name="Uno", equipment_type=equipment_type, owner_type="company", serial_number="SER-111")
    Equipment.objects.create(name="Dos", equipment_type=equipment_type, owner_type="company", serial_number="SER-222")
    resp = admin_client.get("/api/equipment/?search=111")
    names = [e["name"] for e in resp.data["results"]]
    assert names == ["Uno"]


@pytest.mark.django_db
def test_filter_by_status(admin_client, equipment_type):
    Equipment.objects.create(name="Activo", equipment_type=equipment_type, owner_type="company", status="active")
    Equipment.objects.create(name="Retirado", equipment_type=equipment_type, owner_type="company", status="retired")
    resp = admin_client.get("/api/equipment/?status=retired")
    names = [e["name"] for e in resp.data["results"]]
    assert names == ["Retirado"]


@pytest.mark.django_db
def test_filter_by_customer(admin_client, equipment_type):
    c = Customer.objects.create(name="Agro SA")
    Equipment.objects.create(name="DelCliente", equipment_type=equipment_type, owner_type="customer", customer=c)
    Equipment.objects.create(name="DeEmpresa", equipment_type=equipment_type, owner_type="company")
    resp = admin_client.get(f"/api/equipment/?customer={c.id}")
    names = [e["name"] for e in resp.data["results"]]
    assert names == ["DelCliente"]


@pytest.mark.django_db
def test_delete_is_soft_sets_retired(admin_client, equipment_type):
    e = Equipment.objects.create(name="Borrar", equipment_type=equipment_type, owner_type="company")
    resp = admin_client.delete(f"/api/equipment/{e.id}/")
    assert resp.status_code == 204
    e.refresh_from_db()
    assert e.status == "retired"


@pytest.mark.django_db
def test_types_list_no_pagination(admin_client, equipment_type):
    resp = admin_client.get("/api/equipment/types/")
    assert resp.status_code == 200
    names = [t["name"] for t in resp.data]  # respuesta es lista (sin paginar)
    assert "Bomba" in names


@pytest.mark.django_db
def test_types_crud_admin(admin_client):
    resp = admin_client.post("/api/equipment/types/", {"name": "Nuevo Tipo"}, format="json")
    assert resp.status_code == 201
    type_id = resp.data["id"]
    patch = admin_client.patch(
        f"/api/equipment/types/{type_id}/", {"name": "Tipo Editado"}, format="json"
    )
    assert patch.status_code == 200
    assert patch.data["name"] == "Tipo Editado"
    # Soft-delete: deja de listarse por defecto.
    assert admin_client.delete(f"/api/equipment/types/{type_id}/").status_code == 204
    names = [t["name"] for t in admin_client.get("/api/equipment/types/").data]
    assert "Tipo Editado" not in names


@pytest.mark.django_db
def test_types_write_forbidden_for_technician(equipment_type):
    from django.contrib.auth import get_user_model
    from rest_framework.test import APIClient

    user = get_user_model().objects.create_user(
        email="tec_t@v.com", password="x", full_name="T", role="technician"
    )
    c = APIClient()
    c.force_authenticate(user=user)
    # Lectura sí; escritura no.
    assert c.get("/api/equipment/types/").status_code == 200
    assert c.post("/api/equipment/types/", {"name": "X"}, format="json").status_code == 403


@pytest.mark.django_db
def test_service_history_returns_empty(admin_client, equipment_type):
    e = Equipment.objects.create(name="ConHist", equipment_type=equipment_type, owner_type="company")
    resp = admin_client.get(f"/api/equipment/{e.id}/service-history/")
    assert resp.status_code == 200
    # Conectado al módulo de órdenes de servicio: respuesta paginada vacía.
    assert resp.data["count"] == 0
    assert resp.data["results"] == []


@pytest.mark.django_db
def test_requires_authentication(equipment_type):
    client = APIClient()
    resp = client.get("/api/equipment/")
    assert resp.status_code == 401


@pytest.mark.django_db
def test_readonly_role_cannot_create(equipment_type):
    user = User.objects.create_user(
        email="ro@veragro.com", password="x", full_name="RO", role="readonly"
    )
    client = APIClient()
    client.force_authenticate(user=user)
    resp = client.post(
        "/api/equipment/",
        {"name": "X", "equipment_type": equipment_type.id, "owner_type": "company"},
        format="json",
    )
    assert resp.status_code == 403


@pytest.mark.django_db
def test_invalid_customer_filter_returns_400(admin_client, equipment_type):
    resp = admin_client.get("/api/equipment/?customer=abc")
    assert resp.status_code == 400


@pytest.mark.django_db
def test_invalid_equipment_type_filter_returns_400(admin_client, equipment_type):
    resp = admin_client.get("/api/equipment/?equipment_type=abc")
    assert resp.status_code == 400


@pytest.mark.django_db
def test_technician_role_can_create(equipment_type):
    user = User.objects.create_user(
        email="tech@veragro.com", password="x", full_name="T", role="technician"
    )
    client = APIClient()
    client.force_authenticate(user=user)
    resp = client.post(
        "/api/equipment/",
        {"name": "X", "equipment_type": equipment_type.id, "owner_type": "company"},
        format="json",
    )
    assert resp.status_code == 201


@pytest.mark.django_db
def test_create_without_owner_type_is_rejected(admin_client, equipment_type):
    resp = admin_client.post(
        "/api/equipment/",
        {"name": "SinOwner", "equipment_type": equipment_type.id},
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_patch_owner_invariant_via_api(admin_client, equipment_type):
    from apps.customers.models import Customer

    c = Customer.objects.create(name="Agro SA")
    e = Equipment.objects.create(
        name="B1", equipment_type=equipment_type, owner_type="customer", customer=c
    )
    # Quitar el customer dejando owner_type=customer debe fallar (400).
    resp = admin_client.patch(
        f"/api/equipment/{e.id}/", {"customer": None}, format="json"
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_filter_by_equipment_type_success(admin_client, equipment_type):
    other, _ = EquipmentType.objects.get_or_create(name="Cargador")
    Equipment.objects.create(name="DeBomba", equipment_type=equipment_type, owner_type="company")
    Equipment.objects.create(name="DeCargador", equipment_type=other, owner_type="company")
    resp = admin_client.get(f"/api/equipment/?equipment_type={equipment_type.id}")
    names = [e["name"] for e in resp.data["results"]]
    assert names == ["DeBomba"]
