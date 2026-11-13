"""Exercise the actual data migration against isolated tables with legacy FKs."""
import importlib
from decimal import Decimal
import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.db.migrations.operations.special import RunPython
from django.utils import timezone
from apps.customers.models import Customer


@pytest.mark.django_db(transaction=True)
def test_detachment_preserves_assignments_rates_and_paid_earnings():
    module = importlib.import_module('apps.field_jobs.migrations.0009_fieldpilot_remove_fieldjob_technician_fieldjob_pilot_and_more')
    executor = MigrationExecutor(connection)
    state = executor.loader.project_state([('field_jobs', '0008_expense_payment_responsible'), ('users', '0004_alter_user_role')])
    for op in module.Migration.operations:
        if isinstance(op, RunPython):
            break
        op.state_forwards('field_jobs', state)
    apps = state.apps
    models = [apps.get_model('field_jobs', name) for name in ('FieldPilot', 'FieldJob', 'PilotRate', 'PilotEarning')]
    Pilot, Job, Rate, Earning = models
    for model in models:
        model._meta.db_table = 'migration_check_' + model._meta.model_name
    with connection.schema_editor() as editor:
        for model in models:
            editor.create_model(model)
    try:
        User = apps.get_model('users', 'User')
        Payment = apps.get_model('field_jobs', 'FieldPayment')
        old_pilot = User.objects.create(email='legacy-pilot@example.com', full_name='Piloto conservado', role='piloto', is_active=True)
        technician = User.objects.create(email='legacy-tech@example.com', full_name='Técnico conservado', role='technician', is_active=True)
        customer = Customer.objects.create(name='Finca migración')
        payment = Payment.objects.create(kind='pilot', beneficiary='Piloto conservado', method='cash', amount=Decimal('21.25'), created_by_id=technician.pk)
        job = Job.objects.create(number='MIG-1', customer_id=customer.pk, technician_id=old_pilot.pk, status='done', actual_hectares=Decimal('8.5'), done_date=timezone.localdate())
        tech_job = Job.objects.create(number='MIG-2', customer_id=customer.pk, technician_id=technician.pk)
        rate = Rate.objects.create(pilot_id=old_pilot.pk, rate_per_hectare=Decimal('2.50'))
        earning = Earning.objects.create(job_id=job.pk, pilot_id=old_pilot.pk, earned_date=timezone.localdate(), hectares=Decimal('8.5'), rate_per_hectare=Decimal('2.50'), amount=Decimal('21.25'), payment_id=payment.pk)
        module.detach_pilots(apps, type('Editor', (), {'connection': connection})())
        job.refresh_from_db(); rate.refresh_from_db(); earning.refresh_from_db(); old_pilot.refresh_from_db(); technician.refresh_from_db(); tech_job.refresh_from_db()
        independent = Pilot.objects.get(name='Piloto conservado')
        assert job.pilot_id == rate.independent_pilot_id == earning.independent_pilot_id == independent.pk
        assert earning.amount == Decimal('21.25') and earning.payment_id == payment.pk
        assert not old_pilot.is_active and old_pilot.role == 'readonly' and old_pilot.password == '!'
        assert technician.is_active and technician.role == 'technician'
        assert tech_job.pilot_id == Pilot.objects.get(name='Técnico conservado').pk
    finally:
        with connection.schema_editor() as editor:
            for model in reversed(models):
                editor.delete_model(model)
