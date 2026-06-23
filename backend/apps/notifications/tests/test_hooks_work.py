import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.customers.models import Customer
from apps.field_jobs.models import FieldJob
from apps.notifications import services as notif

User = get_user_model()


@pytest.fixture
def spy_assign(monkeypatch):
    calls = []
    monkeypatch.setattr(notif, "notify_assignment", lambda work, tech: calls.append((work.pk, getattr(tech, "pk", None))))
    return calls


@pytest.fixture
def spy_completed(monkeypatch):
    calls = []
    monkeypatch.setattr(notif, "notify_completed", lambda work: calls.append(work.pk))
    return calls


def _tech():
    return User.objects.create_user(email="t@v.com", password="x", full_name="T", role="technician")


def _client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.mark.django_db
def test_create_field_job_with_technician_notifies(spy_assign):
    tech = _tech()
    customer = Customer.objects.create(name="C")
    resp = _client(tech).post(
        "/api/field-jobs/",
        {"customer": customer.id, "job_type": "fumigation", "technician": tech.id},
        format="json",
    )
    assert resp.status_code == 201
    assert spy_assign and spy_assign[-1][1] == tech.id


@pytest.mark.django_db
def test_update_field_job_technician_change_notifies(spy_assign):
    tech = _tech()
    other = User.objects.create_user(email="o@v.com", password="x", full_name="O", role="technician")
    job = FieldJob.objects.create(customer=Customer.objects.create(name="C"), technician=tech)
    spy_assign.clear()
    _client(tech).patch(f"/api/field-jobs/{job.id}/", {"technician": other.id}, format="json")
    assert spy_assign and spy_assign[-1][1] == other.id


@pytest.mark.django_db
def test_update_field_job_no_technician_change_does_not_notify(spy_assign):
    tech = _tech()
    job = FieldJob.objects.create(customer=Customer.objects.create(name="C"), technician=tech)
    spy_assign.clear()
    _client(tech).patch(f"/api/field-jobs/{job.id}/", {"location": "Lote 5"}, format="json")
    assert spy_assign == []


@pytest.mark.django_db
def test_mark_done_notifies_completed(spy_completed):
    from apps.field_jobs.services import mark_done

    job = FieldJob.objects.create(customer=Customer.objects.create(name="C"))
    mark_done(job)
    assert spy_completed == [job.pk]
