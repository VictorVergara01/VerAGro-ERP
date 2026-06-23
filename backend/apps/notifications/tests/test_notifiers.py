import pytest
from django.contrib.auth import get_user_model

from apps.customers.models import Customer
from apps.field_jobs.models import FieldJob
from apps.inventory.models import Product
from apps.notifications import services
from apps.notifications.models import PushDevice

User = get_user_model()


def _user_with_device(email, role, token):
    u = User.objects.create_user(email=email, password="x", full_name="U", role=role)
    PushDevice.objects.create(user=u, token=token)
    return u


@pytest.mark.django_db
def test_notify_assignment_targets_technician(monkeypatch, django_capture_on_commit_callbacks):
    tech = _user_with_device("t@v.com", "technician", "tok-t")
    job = FieldJob.objects.create(customer=Customer.objects.create(name="C"), technician=tech)
    sent = {}
    monkeypatch.setattr(services, "send_push",
                        lambda users, title, body, data=None: sent.update(users=list(users), data=data))
    with django_capture_on_commit_callbacks(execute=True):
        services.notify_assignment(job, tech)
    assert sent["users"] == [tech]
    assert sent["data"] == {"type": "field_job", "id": job.pk}


@pytest.mark.django_db
def test_notify_assignment_none_technician_is_noop(monkeypatch, django_capture_on_commit_callbacks):
    job = FieldJob.objects.create(customer=Customer.objects.create(name="C"))
    called = {"n": 0}
    monkeypatch.setattr(services, "send_push", lambda *a, **k: called.__setitem__("n", called["n"] + 1))
    with django_capture_on_commit_callbacks(execute=True):
        services.notify_assignment(job, None)
    assert called["n"] == 0


@pytest.mark.django_db
def test_notify_low_stock_targets_inventory_and_admins(monkeypatch, django_capture_on_commit_callbacks):
    admin = _user_with_device("a@v.com", "general_admin", "tok-a")
    inv = _user_with_device("i@v.com", "inventory", "tok-i")
    _user_with_device("t@v.com", "technician", "tok-t")  # no debe recibir
    product = Product.objects.create(sku="P1", name="Hélice", minimum_stock=5)
    captured = {}
    monkeypatch.setattr(services, "send_push",
                        lambda users, title, body, data=None: captured.update(users=set(users)))
    with django_capture_on_commit_callbacks(execute=True):
        services.notify_low_stock(product)
    assert captured["users"] == {admin, inv}


@pytest.mark.django_db
def test_notify_completed_targets_admins(monkeypatch, django_capture_on_commit_callbacks):
    admin = _user_with_device("a@v.com", "super_admin", "tok-a")
    _user_with_device("i@v.com", "inventory", "tok-i")  # no admin -> no recibe
    job = FieldJob.objects.create(customer=Customer.objects.create(name="C"))
    captured = {}
    monkeypatch.setattr(services, "send_push",
                        lambda users, title, body, data=None: captured.update(users=set(users)))
    with django_capture_on_commit_callbacks(execute=True):
        services.notify_completed(job)
    assert captured["users"] == {admin}
