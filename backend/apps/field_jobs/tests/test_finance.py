from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.db import close_old_connections
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from apps.users.models import User
from apps.customers.models import Customer
from apps.billing.models import Invoice, Payment
from apps.field_jobs.models import (FieldJob, FieldPilot, PilotRate, PilotEarning, FieldPayment, FieldAssistant, AssistantDay, FieldExpense)
from apps.field_jobs.services import mark_done, cancel_job
from apps.field_jobs.finance import settle

pytestmark = pytest.mark.django_db


@pytest.fixture
def accounting():
    return User.objects.create_user(email="field-accounting@example.com", password="x", role="accounting")


@pytest.fixture
def client(accounting):
    client = APIClient()
    client.force_authenticate(accounting)
    return client


@pytest.fixture
def pilot():
    return FieldPilot.objects.create(name="Piloto Uno")


@pytest.fixture
def customer():
    return Customer.objects.create(name="Cliente de campo")


def completed(customer, pilot, ha="8.5"):
    job = FieldJob.objects.create(customer=customer, pilot=pilot)
    mark_done(job, actual_hectares=ha)
    return job


def payment_data(kind, ids, amount):
    return {"kind": kind, "items": ids, "expected_amount": amount, "payment_date": timezone.localdate(), "method": "cash"}


def test_pilot_cost_uses_actual_hectares_and_freezes_rate(client, customer, pilot):
    rate = client.post("/api/field-pilot-rates/", {"pilot": pilot.pk, "rate_per_hectare": "2.50"}, format="json")
    assert rate.status_code == 201
    first = completed(customer, pilot)
    earning = PilotEarning.objects.get(job=first)
    assert earning.amount == Decimal("21.25")
    assert earning.hectares == Decimal("8.5")
    assert client.patch(f"/api/field-pilot-rates/{rate.data['id']}/", {"rate_per_hectare": "3.00"}, format="json").status_code == 200
    earning.refresh_from_db()
    assert earning.rate_per_hectare == Decimal("2.50")
    second = completed(customer, pilot, "10")
    assert PilotEarning.objects.get(job=second).amount == 30
    rows = client.get("/api/field-pilot-earnings/", {"pilot": pilot.pk}).data
    assert {r["job"] for r in rows} == {first.pk, second.pk}


def test_configuring_rate_incorporates_closed_unpriced_jobs(client, customer, pilot):
    job = completed(customer, pilot)
    assert not PilotEarning.objects.exists()
    assert len(client.get("/api/reports/field-finance/").data["unpriced_jobs"]) == 1
    response = client.post("/api/field-pilot-rates/", {"pilot": pilot.pk, "rate_per_hectare": "2"}, format="json")
    assert response.status_code == 201
    assert PilotEarning.objects.get(job=job).amount == 17
    assert client.get("/api/reports/field-finance/").data["unpriced_jobs"] == []


def test_assign_missing_pilot_requires_rate_and_cannot_overwrite_earning(client, customer, pilot):
    job = completed(customer, None)
    payload = {"job": job.pk, "pilot": pilot.pk}
    assert client.post("/api/field-pilot-earnings/assign/", payload).status_code == 400
    PilotRate.objects.create(pilot=pilot, rate_per_hectare=2)
    assert client.post("/api/field-pilot-earnings/assign/", payload).status_code == 200
    job.refresh_from_db()
    assert job.pilot_id == pilot.pk
    assert client.post("/api/field-pilot-earnings/assign/", payload).status_code == 400


def test_settlement_marks_only_selected_jobs_and_prevents_duplicate_payment(client, customer, pilot):
    PilotRate.objects.create(pilot=pilot, rate_per_hectare=2)
    jobs = [completed(customer, pilot, "10"), completed(customer, pilot, "5")]
    items = list(PilotEarning.objects.order_by("pk"))
    response = client.post("/api/field-payments/", payment_data("pilot", [items[0].pk], "20.00"), format="json")
    assert response.status_code == 201
    assert response.data["amount"] == "20.00"
    assert len(response.data["pilot_earnings"]) == 1
    assert [r["job"] for r in client.get("/api/field-pilot-earnings/").data] == [jobs[1].pk]
    assert client.post("/api/field-payments/", payment_data("pilot", [items[0].pk], "20.00"), format="json").status_code == 400
    assert FieldPayment.objects.count() == 1
    assert client.delete(f"/api/field-payments/{response.data['id']}/").status_code == 405
    with pytest.raises(ValidationError):
        cancel_job(jobs[0])
    cancel_job(jobs[1])
    assert not PilotEarning.objects.filter(job=jobs[1]).exists()


def test_rejects_mixed_people_duplicates_stale_total_and_future_payment(client, customer, pilot):
    other = FieldPilot.objects.create(name="Piloto Dos")
    for person in (pilot, other):
        PilotRate.objects.create(pilot=person, rate_per_hectare=2)
        completed(customer, person, "10")
    ids = list(PilotEarning.objects.values_list("pk", flat=True))
    for selected, amount in ((ids, "40"), ([ids[0], ids[0]], "40"), ([ids[0]], "99"), ([999999], "20")):
        assert client.post("/api/field-payments/", payment_data("pilot", selected, amount), format="json").status_code == 400
    payload = payment_data("pilot", [ids[0]], "20")
    payload["payment_date"] += timedelta(days=1)
    assert client.post("/api/field-payments/", payload, format="json").status_code == 400
    assert not FieldPayment.objects.exists()
    assert not PilotEarning.objects.exclude(payment=None).exists()


def test_assistant_day_rates_fractional_overtime_and_unique_date(client):
    assistant = FieldAssistant.objects.create(name="Ayudante")
    response = client.post("/api/field-assistant-days/", {"assistant": assistant.pk, "date": timezone.localdate(), "end_time": "18:30"}, format="json")
    assert response.status_code == 201
    assert response.data["amount"] == "27.50"
    assert response.data["overtime_minutes"] == 150
    assert client.post("/api/field-assistant-days/", {"assistant": assistant.pk, "date": timezone.localdate(), "end_time": "16:00"}, format="json").status_code == 400
    url = f"/api/field-assistant-days/{response.data['id']}/"
    assert client.patch(url, {"end_time": "15:59"}, format="json").status_code == 400
    assert client.patch(url, {"end_time": "16:00"}, format="json").data["amount"] == "20.00"
    assert client.patch(url, {"end_time": "16:01", "base_rate": "999", "overtime_rate": "999", "amount": "999"}, format="json").data["amount"] == "20.05"
    paid = client.post("/api/field-payments/", payment_data("assistant", [response.data["id"]], "20.05"), format="json")
    assert paid.status_code == 201
    assert client.patch(url + "?paid=all", {"end_time": "20:00"}, format="json").status_code == 400
    assert client.delete(url + "?paid=all").status_code == 400


def test_batch_assistant_payment_and_receipt_keeps_each_day(client):
    assistant = FieldAssistant.objects.create(name="Asistente Dos")
    ids = []
    for n in range(2):
        response = client.post("/api/field-assistant-days/", {"assistant": assistant.pk, "date": timezone.localdate() - timedelta(days=n), "end_time": "17:00"}, format="json")
        assert response.status_code == 201
        ids.append(response.data["id"])
    response = client.post("/api/field-payments/", payment_data("assistant", ids, "46.00"), format="json")
    assert response.status_code == 201
    assert len(response.data["assistant_days"]) == 2
    assert response.data["beneficiary"] == "Asistente Dos"


def test_general_expense_record_and_payment_do_not_double_count(client):
    response = client.post("/api/field-expenses/", {"date": timezone.localdate(), "category": "fuel", "description": "Generador", "amount": "45.50", "receipt_reference": "REC-1"}, format="json")
    assert response.status_code == 201
    expense_id = response.data["id"]
    before = client.get("/api/reports/field-finance/").data
    assert before["total_cost"] == Decimal("45.50")
    assert before["pending_cost"] == Decimal("45.50")
    assert before["paid_in_period"] == 0
    url = f"/api/field-expenses/{expense_id}/pay/"
    assert client.post(url, {"method": "cash"}, format="json").status_code == 200
    after = client.get("/api/reports/field-finance/").data
    assert after["total_cost"] == before["total_cost"]
    assert after["pending_cost"] == 0
    assert after["paid_in_period"] == Decimal("45.50")
    assert FieldExpense.objects.get(pk=expense_id).paid_by_id == client.handler._force_user.pk
    assert client.post(url, {"method": "cash"}, format="json").status_code == 400
    assert client.patch(f"/api/field-expenses/{expense_id}/", {"amount": "1"}, format="json").status_code == 400
    assert client.delete(f"/api/field-expenses/{expense_id}/").status_code == 400


def test_cost_and_payment_periods_are_separate(client, customer, pilot, accounting):
    PilotRate.objects.create(pilot=pilot, rate_per_hectare=2)
    job = FieldJob.objects.create(customer=customer, pilot=pilot)
    mark_done(job, actual_hectares="10", done_date=date(2026, 9, 1))
    earning = PilotEarning.objects.get(job=job)
    settle(data=payment_data("pilot", [earning.pk], Decimal("20")), user=accounting)
    field_invoice = Invoice.objects.create(customer=customer, invoice_type="field_job", status="partially_paid", issue_date=date(2026, 9, 2), total=100, balance_due=50)
    workshop_invoice = Invoice.objects.create(customer=customer, invoice_type="product_sale", status="issued", issue_date=date(2026, 9, 2), total=999)
    Payment.objects.create(invoice=field_invoice, amount=50, method="cash")
    Payment.objects.create(invoice=workshop_invoice, amount=999, method="cash")
    september = client.get("/api/reports/field-finance/", {"from": "2026-09-01", "to": "2026-09-30"}).data
    assert september["pilot_cost"] == 20
    assert september["revenue"] == 100
    assert september["operating_result"] == 80
    assert september["paid_in_period"] == 0
    assert september["collected_in_period"] == 0
    current = client.get("/api/reports/field-finance/", {"from": timezone.localdate().replace(day=1)}).data
    assert current["pilot_cost"] == 0
    assert current["paid_in_period"] == 20
    assert current["collected_in_period"] == 50


@pytest.mark.parametrize("role", ["piloto", "technician", "inventory", "readonly", "sales"])
def test_finance_permissions(role, client):
    user = User.objects.create_user(email=f"field-{role}@example.com", role=role)
    client.force_authenticate(user)
    for path in ("field-pilot-rates", "field-assistants", "field-pilot-earnings", "field-assistant-days", "field-expenses", "field-payments"):
        assert client.get(f"/api/{path}/").status_code == (200 if role == "sales" else 403)
        assert client.post(f"/api/{path}/", {}, format="json").status_code in (403, 405)


@pytest.mark.django_db(transaction=True)
def test_concurrent_settlement_pays_once(customer, pilot, accounting):
    PilotRate.objects.create(pilot=pilot, rate_per_hectare=2)
    job = completed(customer, pilot, "10")
    earning = PilotEarning.objects.get(job=job)
    def attempt():
        close_old_connections()
        try:
            settle(data=payment_data("pilot", [earning.pk], Decimal("20")), user=accounting)
            return "paid"
        except ValidationError:
            return "blocked"
        finally:
            close_old_connections()
    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: attempt(), range(2)))
    assert sorted(results) == ["blocked", "paid"]
    assert FieldPayment.objects.count() == 1
