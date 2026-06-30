import pytest
from rest_framework.test import APIClient

from apps.core import roles
from apps.customers.models import Customer
from apps.field_jobs.models import FieldJob
from apps.users.models import User

pytestmark = pytest.mark.django_db

URL = "/api/field-jobs/"


@pytest.fixture
def customer():
    return Customer.objects.create(name="Finca Piloto")


def _piloto(email="piloto@test.com"):
    return User.objects.create_user(
        email=email, password="x", role=roles.PILOTO, full_name="Pil Oto"
    )


def _client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def test_piloto_can_create_field_job(customer):
    res = _client(_piloto()).post(URL, {"customer": customer.id}, format="json")
    assert res.status_code == 201, res.content


def test_create_auto_assigns_piloto_as_technician(customer):
    piloto = _piloto()
    res = _client(piloto).post(URL, {"customer": customer.id}, format="json")
    assert res.status_code == 201, res.content
    assert res.json()["technician"] == piloto.id


def test_piloto_sees_only_own_jobs(customer):
    mine = _piloto("mine@test.com")
    other = _piloto("other@test.com")
    job_mine = FieldJob.objects.create(customer=customer, technician=mine)
    job_other = FieldJob.objects.create(customer=customer, technician=other)

    res = _client(mine).get(URL)
    assert res.status_code == 200, res.content
    ids = [row["id"] for row in res.json()["results"]]
    assert job_mine.id in ids
    assert job_other.id not in ids


def test_piloto_retrieve_other_job_is_404(customer):
    mine = _piloto("mine2@test.com")
    other = _piloto("other2@test.com")
    job_other = FieldJob.objects.create(customer=customer, technician=other)
    res = _client(mine).get(f"{URL}{job_other.id}/")
    assert res.status_code == 404, res.content


def test_piloto_cannot_generate_invoice(customer):
    piloto = _piloto()
    job = FieldJob.objects.create(customer=customer, technician=piloto)
    res = _client(piloto).post(f"{URL}{job.id}/generate-invoice/", {}, format="json")
    assert res.status_code == 403, res.content


def test_piloto_create_with_explicit_technician_ignores_it(customer):
    """Un piloto que pasa technician=<otro_id> explícito debe quedar
    auto-asignado a SÍ MISMO, ignorando el technician del body."""
    piloto = _piloto("piloto_a@test.com")
    otro = _piloto("piloto_b@test.com")
    res = _client(piloto).post(
        URL,
        {"customer": customer.id, "technician": otro.id},
        format="json",
    )
    assert res.status_code == 201, res.content
    assert res.json()["technician"] == piloto.id, (
        f"Se esperaba technician={piloto.id} (el piloto creador), "
        f"pero se obtuvo {res.json()['technician']}"
    )


def test_piloto_update_cannot_reassign_technician(customer):
    """Un piloto que hace PATCH enviando technician=<otro_id> no puede
    reasignar el trabajo: el technician debe seguir siendo él mismo."""
    piloto = _piloto("piloto_update@test.com")
    otro = _piloto("otro_piloto@test.com")
    job = FieldJob.objects.create(customer=customer, technician=piloto)
    res = _client(piloto).patch(
        f"{URL}{job.id}/",
        {"technician": otro.id},
        format="json",
    )
    assert res.status_code == 200, res.content
    assert res.json()["technician"] == piloto.id, (
        f"El piloto no debería poder reasignar el trabajo: "
        f"technician={res.json()['technician']!r}, esperado={piloto.id}"
    )
