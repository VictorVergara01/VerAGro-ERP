import pytest
from decimal import Decimal

from django.db import connection
from django.test.utils import CaptureQueriesContext
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


def test_enlaza_lote_del_mismo_cliente(admin_client, customer):
    from apps.field_jobs.models import FieldPlot

    plot = FieldPlot.objects.create(customer=customer, name="Potrero 1")
    res = admin_client.post(
        "/api/field-jobs/",
        {"customer": customer.id, "plot": plot.id, "hectares": "10"},
        format="json",
    )
    assert res.status_code == 201, res.content
    assert res.json()["plot"] == plot.id
    assert res.json()["plot_name"] == "Potrero 1"


def test_rechaza_lote_de_otro_cliente(admin_client, customer):
    from apps.field_jobs.models import FieldPlot

    otro = Customer.objects.create(name="Finca Santa Rita")
    plot = FieldPlot.objects.create(customer=otro, name="Potrero ajeno")
    res = admin_client.post(
        "/api/field-jobs/",
        {"customer": customer.id, "plot": plot.id},
        format="json",
    )
    assert res.status_code == 400
    assert "plot" in res.json()


def test_patch_parcial_valida_el_lote_contra_el_cliente_guardado(admin_client, customer):
    """El PATCH no manda customer: se resuelve desde la instancia."""
    from apps.field_jobs.models import FieldPlot

    job = FieldJob.objects.create(customer=customer, hectares=Decimal("1"))
    otro = Customer.objects.create(name="Finca Santa Rita")
    ajeno = FieldPlot.objects.create(customer=otro, name="Potrero ajeno")
    propio = FieldPlot.objects.create(customer=customer, name="Potrero 1")

    assert admin_client.patch(
        f"/api/field-jobs/{job.id}/", {"plot": ajeno.id}, format="json"
    ).status_code == 400
    assert admin_client.patch(
        f"/api/field-jobs/{job.id}/", {"plot": propio.id}, format="json"
    ).status_code == 200


def test_no_acepta_lote_desactivado(admin_client, customer):
    from apps.field_jobs.models import FieldPlot

    plot = FieldPlot.objects.create(customer=customer, name="Potrero 1", is_active=False)
    res = admin_client.post(
        "/api/field-jobs/", {"customer": customer.id, "plot": plot.id}, format="json"
    )
    assert res.status_code == 400


def test_plot_name_vacio_sin_lote(admin_client, customer):
    job = FieldJob.objects.create(customer=customer, hectares=Decimal("1"))
    res = admin_client.get(f"/api/field-jobs/{job.id}/")
    assert res.status_code == 200
    assert res.json()["plot"] is None
    assert res.json()["plot_name"] == ""


def test_editar_trabajo_no_se_congela_cuando_su_lote_se_desactiva(admin_client, customer):
    """Desactivar un lote es el flujo normal de borrado: no debe bloquear la edición
    de trabajos que ya lo referencian (precio, fecha, notas, ni siquiera reenviar el
    mismo lote), solo el intento de enlazar uno inactivo nuevo."""
    from apps.field_jobs.models import FieldPlot

    plot = FieldPlot.objects.create(customer=customer, name="Potrero 1")
    job = FieldJob.objects.create(
        customer=customer, plot=plot, hectares=Decimal("1"), unit_price=Decimal("20")
    )
    plot.is_active = False
    plot.save(update_fields=["is_active"])

    # Editar un campo cualquiera sin tocar el lote sigue funcionando.
    res = admin_client.patch(
        f"/api/field-jobs/{job.id}/", {"unit_price": "25"}, format="json"
    )
    assert res.status_code == 200, res.content
    assert res.json()["unit_price"] == "25.00"

    # Reenviar el mismo lote (ya desactivado) también sigue funcionando.
    res = admin_client.patch(
        f"/api/field-jobs/{job.id}/", {"plot": plot.id}, format="json"
    )
    assert res.status_code == 200, res.content
    assert res.json()["plot"] == plot.id


def test_rechaza_cambiar_a_otro_lote_desactivado(admin_client, customer):
    from apps.field_jobs.models import FieldPlot

    plot = FieldPlot.objects.create(customer=customer, name="Potrero 1")
    otro_inactivo = FieldPlot.objects.create(
        customer=customer, name="Potrero 2", is_active=False
    )
    job = FieldJob.objects.create(customer=customer, plot=plot, hectares=Decimal("1"))

    res = admin_client.patch(
        f"/api/field-jobs/{job.id}/", {"plot": otro_inactivo.id}, format="json"
    )
    assert res.status_code == 400
    assert "plot" in res.json()


def test_listado_no_hace_n_mas_1_por_lote(admin_client, customer):
    from apps.field_jobs.models import FieldPlot

    for i in range(10):
        plot = FieldPlot.objects.create(customer=customer, name=f"Potrero {i}")
        FieldJob.objects.create(customer=customer, plot=plot, hectares=Decimal("1"))

    with CaptureQueriesContext(connection) as ctx:
        res = admin_client.get("/api/field-jobs/")
    assert res.status_code == 200
    assert len(res.json()["results"]) == 10
    # select_related de customer/plot/equipment/technician + prefetch de
    # invoices/products + paginación: constante, no proporcional a las filas.
    assert len(ctx.captured_queries) <= 8
