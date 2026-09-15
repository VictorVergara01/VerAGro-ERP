"""CRUD, filtros y soft-delete de /api/field-plots/."""
import pytest
from rest_framework.test import APIClient

from apps.customers.models import Customer
from apps.field_jobs.models import FieldPlot, FieldPlotProduct
from apps.users.models import User

pytestmark = pytest.mark.django_db

PLOTS_URL = "/api/field-plots/"


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


def test_crea_lote_con_quimicos_anidados(admin_client, customer):
    payload = {
        "customer": customer.id,
        "name": "Potrero 1",
        "hectares": "15",
        "crop": "other",
        "crop_other": "Sandía",
        "location": "Entrada norte",
        "water_per_hectare": "20",
        "products": [
            {"name": "Glifosato", "dose_per_hectare": "10", "unit": "L/ha"},
            {"name": "Adherente", "dose_per_hectare": "50", "unit": "cc/ha"},
        ],
    }
    res = admin_client.post(PLOTS_URL, payload, format="json")
    assert res.status_code == 201, res.content
    body = res.json()
    assert body["customer_name"] == "Finca La Esperanza"
    assert body["crop_display"] == "Otros"
    assert body["is_active"] is True
    assert len(body["products"]) == 2


def test_rechaza_mas_de_diez_quimicos(admin_client, customer):
    products = [
        {"name": f"Q{i}", "dose_per_hectare": "1", "unit": "L/ha"} for i in range(11)
    ]
    res = admin_client.post(
        PLOTS_URL,
        {"customer": customer.id, "name": "Potrero 1", "products": products},
        format="json",
    )
    assert res.status_code == 400
    assert "products" in res.json()


def test_rechaza_nombre_repetido_del_mismo_cliente(admin_client, customer):
    FieldPlot.objects.create(customer=customer, name="Potrero 1")
    res = admin_client.post(
        PLOTS_URL, {"customer": customer.id, "name": "potrero 1"}, format="json"
    )
    assert res.status_code == 400
    assert "name" in res.json()


def test_rechaza_nombre_repetido_mismo_case_con_mensaje_especifico(admin_client, customer):
    # Regresión: DRF auto-generaba un UniqueTogetherValidator (customer, name) que hacía
    # match exacto por case-sensitivity y disparaba antes que validate(), tapando el
    # mensaje de negocio con uno genérico bajo non_field_errors. Con el mismo case
    # (el caso más común en uso real) es donde el bug se manifestaba.
    FieldPlot.objects.create(customer=customer, name="Potrero 1")
    res = admin_client.post(
        PLOTS_URL, {"customer": customer.id, "name": "Potrero 1"}, format="json"
    )
    assert res.status_code == 400
    assert res.json() == {
        "name": ["Ya existe un lote activo con ese nombre para este cliente."]
    }


def test_permite_nombre_que_solo_choca_con_lote_inactivo_via_api(admin_client, customer):
    FieldPlot.objects.create(customer=customer, name="Potrero 1", is_active=False)
    res = admin_client.post(
        PLOTS_URL, {"customer": customer.id, "name": "Potrero 1"}, format="json"
    )
    assert res.status_code == 201, res.content


def test_editar_reemplaza_los_quimicos(admin_client, customer):
    plot = FieldPlot.objects.create(customer=customer, name="Potrero 1")
    FieldPlotProduct.objects.create(plot=plot, name="Viejo", dose_per_hectare=1)
    res = admin_client.patch(
        f"{PLOTS_URL}{plot.id}/",
        {"products": [{"name": "Nuevo", "dose_per_hectare": "2", "unit": "L/ha"}]},
        format="json",
    )
    assert res.status_code == 200, res.content
    assert [p["name"] for p in res.json()["products"]] == ["Nuevo"]
    assert plot.products.count() == 1


def test_delete_desactiva_y_lo_saca_del_listado(admin_client, customer):
    plot = FieldPlot.objects.create(customer=customer, name="Potrero 1")
    assert admin_client.delete(f"{PLOTS_URL}{plot.id}/").status_code == 204
    plot.refresh_from_db()
    assert plot.is_active is False
    assert admin_client.get(PLOTS_URL).json() == []
    con_inactivos = admin_client.get(f"{PLOTS_URL}?include_inactive=true").json()
    assert [p["id"] for p in con_inactivos] == [plot.id]


def test_listado_sin_paginacion_y_filtro_por_cliente(admin_client, customer):
    otro = Customer.objects.create(name="Finca Santa Rita")
    FieldPlot.objects.create(customer=customer, name="Potrero 1")
    FieldPlot.objects.create(customer=otro, name="Potrero 2")
    todos = admin_client.get(PLOTS_URL).json()
    assert isinstance(todos, list) and len(todos) == 2
    solo_uno = admin_client.get(f"{PLOTS_URL}?customer={customer.id}").json()
    assert [p["name"] for p in solo_uno] == ["Potrero 1"]


def test_customer_no_numerico_da_400(admin_client):
    res = admin_client.get(f"{PLOTS_URL}?customer=abc")
    assert res.status_code == 400
    assert "customer" in res.json()


def test_busqueda_por_nombre_y_ubicacion(admin_client, customer):
    FieldPlot.objects.create(customer=customer, name="Potrero Alto", location="Norte")
    FieldPlot.objects.create(customer=customer, name="Bajo", location="Sur")
    assert len(admin_client.get(f"{PLOTS_URL}?search=alto").json()) == 1
    assert len(admin_client.get(f"{PLOTS_URL}?search=sur").json()) == 1
