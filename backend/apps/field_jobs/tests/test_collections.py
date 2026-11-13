from datetime import timedelta
from decimal import Decimal
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4
from importlib import import_module
from types import SimpleNamespace

import pytest
from django.apps import apps
from django.db import connection, close_old_connections
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework.exceptions import ValidationError
from apps.users.models import User
from apps.customers.models import Customer
from apps.billing.models import Invoice, InvoiceLine, Payment
from apps.billing.services import create_invoice_from_field_job, issue_invoice, record_payment
from apps.field_jobs.models import FieldJob, FieldCollection, FieldPilot, PilotRate
from apps.field_jobs.services import mark_done, cancel_job
from apps.field_jobs.collections import record_collection

pytestmark = pytest.mark.django_db


@pytest.fixture
def actor():
    return User.objects.create_user(email='collections@example.com', role='general_admin', full_name='Administración')


@pytest.fixture
def client(actor):
    c = APIClient(); c.force_authenticate(actor); return c


@pytest.fixture
def job():
    customer = Customer.objects.create(name='Finca Cobros')
    pilot = FieldPilot.objects.create(name='Piloto Cobros')
    PilotRate.objects.create(pilot=pilot, rate_per_hectare=2)
    job = FieldJob.objects.create(customer=customer, pilot=pilot, hectares=10, unit_price=10)
    mark_done(job, actual_hectares='10', done_date=timezone.localdate()-timedelta(days=5))
    return job


def payload(amount='30', **extra):
    return {'amount': amount, 'method': 'cash', 'request_id': str(uuid4()), 'payment_date': str(timezone.localdate()), **extra}


def test_collect_without_invoice_and_keep_full_history(client, job):
    url = f'/api/field-accounts/{job.pk}/collect/'
    response = client.post(url, payload(reference='REC-1'), format='json')
    assert response.status_code == 201
    account = client.get(f'/api/field-accounts/{job.pk}/').data
    assert account['collected'] == 30 and account['balance_due'] == 70
    assert account['collection_status'] == 'partial'
    assert account['collections'][0]['reference'] == 'REC-1'
    assert account['invoice'] is None
    assert not Invoice.objects.exists()
    assert client.post(url, payload('70'), format='json').status_code == 201
    assert client.get(f'/api/field-accounts/{job.pk}/').data['collection_status'] == 'paid'
    assert FieldCollection.objects.count() == 2


def test_idempotent_retry_does_not_create_another_receipt(client, job):
    data = payload()
    url = f'/api/field-accounts/{job.pk}/collect/'
    first = client.post(url, data, format='json')
    retry = client.post(url, data, format='json')
    assert retry.status_code == 201 and retry.data['id'] == first.data['id']
    assert FieldCollection.objects.count() == 1
    assert client.post(url, {**data, 'amount': '20'}, format='json').status_code == 400


@pytest.mark.parametrize('extra', [
    {'amount': '101'}, {'amount': '-1'}, {'amount': '0'}, {'amount': 'NaN'}, {'expected_balance': '99'},
    {'payment_date': '2000-01-01'}, {'payment_date': '2999-01-01'}, {'method': 'invalid'},
])
def test_invalid_receipts_leave_balance_unchanged(client, job, extra):
    assert client.post(f'/api/field-accounts/{job.pk}/collect/', payload(**extra), format='json').status_code == 400
    assert not FieldCollection.objects.exists()


def test_pending_job_cannot_be_collected(client, job):
    pending = FieldJob.objects.create(customer=job.customer)
    assert client.post(f'/api/field-accounts/{pending.pk}/collect/', payload(), format='json').status_code == 404


def test_invoice_generated_after_receipt_keeps_abonos_and_reports_count_once(client, job, actor):
    receipt = record_collection(job=job, data=payload('30'), user=actor)
    invoice = create_invoice_from_field_job(job=job, user=actor)
    assert invoice.status == 'draft'
    assert invoice.paid_amount == 30 and invoice.balance_due == 70
    assert invoice.payments.count() == 1
    receipt.refresh_from_db()
    assert receipt.invoice_payment.invoice_id == invoice.pk
    issue_invoice(invoice=invoice, user=actor)
    invoice.refresh_from_db()
    assert invoice.status == 'partially_paid'
    record_payment(invoice=invoice, amount='70', method='cash', user=actor)
    invoice.refresh_from_db()
    assert invoice.status == 'paid' and invoice.paid_amount == 100
    assert FieldCollection.objects.count() == 2
    report = client.get('/api/reports/field-finance/').data
    assert report['revenue'] == 100 and report['collected_in_period'] == 100
    assert report['receivable'] == 0
    assert report['by_customer'][0]['revenue'] == 100
    assert report['by_pilot'][0]['pilot_cost'] == 20
    assert report['by_pilot'][0]['margin_before_general_costs'] == 80


def test_receipt_after_draft_invoice_is_reflected_without_issuing_it(client, job, actor):
    invoice = create_invoice_from_field_job(job=job, user=actor)
    record_collection(job=job, data=payload('100'), user=actor)
    invoice.refresh_from_db()
    assert invoice.status == 'draft' and invoice.paid_amount == 100 and invoice.balance_due == 0
    issue_invoice(invoice=invoice, user=actor)
    invoice.refresh_from_db()
    assert invoice.status == 'paid'


def test_payment_from_invoice_retries_with_same_key_without_double_collection(client, job, actor):
    invoice = create_invoice_from_field_job(job=job, user=actor)
    issue_invoice(invoice=invoice, user=actor)
    key = str(uuid4())
    data = {'amount': '20', 'method': 'cash', 'request_id': key}
    for _ in range(2):
        assert client.post(f'/api/invoices/{invoice.pk}/payments/', data, format='json').status_code == 201
    assert FieldCollection.objects.filter(job=job).count() == 1
    assert invoice.payments.count() == 1


def test_invoice_amounts_are_locked_and_paid_documents_cannot_be_removed(client, job, actor):
    invoice = create_invoice_from_field_job(job=job, user=actor)
    line = invoice.lines.get()
    assert client.patch(f'/api/invoices/{invoice.pk}/', {'lines': [{'unit_price': '1'}]}, format='json').status_code == 400
    assert client.patch(f'/api/invoices/{invoice.pk}/', {'invoice_type': 'product_sale'}, format='json').status_code == 400
    assert client.patch(f'/api/invoice-lines/{line.pk}/', {'unit_price': '1'}, format='json').status_code == 400
    assert client.delete(f'/api/invoice-lines/{line.pk}/').status_code == 400
    assert client.post('/api/invoice-lines/', {'invoice': invoice.pk, 'description': 'Extra'}, format='json').status_code == 400
    record_collection(job=job, data=payload(), user=actor)
    assert client.post(f'/api/invoices/{invoice.pk}/cancel/').status_code == 400
    assert client.delete(f'/api/invoices/{invoice.pk}/').status_code == 400
    with pytest.raises(ValidationError):
        cancel_job(job)


def test_due_dates_overdue_balances_and_filters(client, job, actor):
    due = job.done_date+timedelta(days=1)
    assert client.post(f'/api/field-accounts/{job.pk}/terms/', {'due_date': str(due)}, format='json').status_code == 200
    account = client.get(f'/api/field-accounts/{job.pk}/').data
    assert account['collection_status'] == 'overdue' and account['days_overdue'] == 4
    record_collection(job=job, data=payload('30'), user=actor)
    listing = client.get('/api/field-accounts/', {'collection_status': 'overdue', 'search': 'Finca Cobros'}).data
    assert listing['summary']['overdue'] == 70
    assert len(listing['items']) == 1
    assert client.get('/api/field-accounts/', {'from': str(timezone.localdate())}).data['items'] == []
    assert client.get('/api/field-accounts/', {'pilot': 'bad'}).status_code == 400
    assert client.post(f'/api/field-accounts/{job.pk}/terms/', {'due_date': '2000-01-01'}, format='json').status_code == 400
    assert client.post(f'/api/field-accounts/{job.pk}/terms/', {'due_date': None}, format='json').status_code == 200
    assert client.get(f'/api/field-accounts/{job.pk}/').data['collection_status'] == 'partial'


def test_invoice_due_date_and_account_due_date_stay_together(client, job, actor):
    invoice = create_invoice_from_field_job(job=job, user=actor)
    due = timezone.localdate()+timedelta(days=20)
    assert client.patch(f'/api/invoices/{invoice.pk}/', {'due_date': str(due)}, format='json').status_code == 200
    job.refresh_from_db(); assert job.due_date == due
    assert client.post(f'/api/field-accounts/{job.pk}/terms/', {'due_date': None}, format='json').status_code == 200
    invoice.refresh_from_db(); assert invoice.due_date is None


def test_backfill_preserves_existing_invoice_payments_and_amounts(job, actor):
    invoice = Invoice.objects.create(customer=job.customer, field_job=job, invoice_type='field_job', status='issued', total=150, due_date=timezone.localdate()+timedelta(days=2))
    payment = Payment.objects.create(invoice=invoice, amount=40, method='cash', reference_number='ANT-1', created_by=actor)
    migration = import_module('apps.field_jobs.migrations.0010_job_collections')
    migration.backfill_accounts(apps, SimpleNamespace(connection=connection))
    receipt = FieldCollection.objects.get(invoice_payment=payment)
    assert receipt.amount == 40 and receipt.reference == 'ANT-1'
    job.refresh_from_db()
    assert job.total == 150 and job.due_date == invoice.due_date


@pytest.mark.parametrize('role,read_status,write_status', [('sales',200,403),('accounting',200,201),('technician',403,403),('readonly',403,403)])
def test_account_permissions(client, job, role, read_status, write_status):
    client.force_authenticate(User.objects.create_user(email=f'{role}@collections.test', role=role))
    assert client.get('/api/field-accounts/').status_code == read_status
    assert client.post(f'/api/field-accounts/{job.pk}/collect/', payload(), format='json').status_code == write_status


@pytest.mark.django_db(transaction=True)
def test_concurrent_receipts_cannot_collect_more_than_the_balance(job, actor):
    def attempt(_):
        close_old_connections()
        try:
            record_collection(job=job, data=payload('70'), user=actor)
            return 'collected'
        except ValidationError:
            return 'blocked'
        finally:
            close_old_connections()
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(attempt, range(2)))
    assert sorted(results) == ['blocked','collected']
    assert FieldCollection.objects.get().amount == 70
