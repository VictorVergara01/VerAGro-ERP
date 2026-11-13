import pytest
from rest_framework.test import APIClient
from apps.users.models import User
from apps.customers.models import Customer
from apps.field_jobs.models import FieldPilot, PilotRate, FieldJob

pytestmark = pytest.mark.django_db


def client(role):
    user = User.objects.create_user(email=f'{role}@independent.test', role=role)
    c = APIClient()
    c.force_authenticate(user)
    return c


def test_register_pilot_without_creating_an_account():
    c = client('general_admin')
    before = User.objects.count()
    result = c.post('/api/field-pilots/', {'name': 'Juan Piloto', 'phone': '60001234', 'rate_per_hectare': '2.50'}, format='json')
    assert result.status_code == 201
    assert User.objects.count() == before
    pilot = FieldPilot.objects.get(pk=result.data['id'])
    assert pilot.name == 'Juan Piloto'
    assert PilotRate.objects.get(pilot=pilot).rate_per_hectare == 2.5
    assert 'rate_per_hectare' not in result.data


def test_assign_independent_pilot_to_job_and_filter_jobs():
    c = client('technician')
    customer = Customer.objects.create(name='Finca')
    pilot = FieldPilot.objects.create(name='Personal de campo')
    other = FieldPilot.objects.create(name='Otro piloto')
    result = c.post('/api/field-jobs/', {'customer': customer.pk, 'pilot': pilot.pk}, format='json')
    assert result.status_code == 201
    assert result.data['pilot'] == pilot.pk
    assert result.data['pilot_name'] == pilot.name
    assert 'technician' not in result.data
    FieldJob.objects.create(customer=customer, pilot=other)
    rows = c.get('/api/field-jobs/', {'pilot': pilot.pk}).data['results']
    assert len(rows) == 1 and rows[0]['pilot'] == pilot.pk


def test_pilot_lookup_does_not_expose_salary_and_technician_cannot_register():
    pilot = FieldPilot.objects.create(name='Piloto')
    PilotRate.objects.create(pilot=pilot, rate_per_hectare=3)
    c = client('technician')
    assert c.get('/api/field-pilots/').data == [{'id': pilot.pk, 'name': 'Piloto', 'phone': '', 'is_active': True}]
    assert c.post('/api/field-pilots/', {'name': 'Otro'}, format='json').status_code == 403


def test_inactive_pilot_cannot_be_assigned_to_new_job():
    c = client('general_admin')
    pilot = FieldPilot.objects.create(name='Inactivo', is_active=False)
    customer = Customer.objects.create(name='Finca')
    assert c.post('/api/field-jobs/', {'customer': customer.pk, 'pilot': pilot.pk}, format='json').status_code == 400


def test_piloto_is_no_longer_a_user_role():
    c = client('general_admin')
    result = c.post('/api/user-management/', {'email': 'not-an-account@example.com', 'full_name': 'Piloto', 'role': 'piloto', 'password': 'StrongPass-39201'}, format='json')
    assert result.status_code == 400
    assert 'role' in result.data
