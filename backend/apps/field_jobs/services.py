from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import FieldJob


@transaction.atomic
def mark_done(job, user=None):
    if job.status != FieldJob.Status.SCHEDULED:
        raise ValidationError(
            {"status": "Solo se marca hecho un trabajo programado (scheduled)."}
        )
    job.status = FieldJob.Status.DONE
    job.done_date = timezone.localdate()
    job.save(update_fields=["status", "done_date", "updated_at"])
    return job


@transaction.atomic
def cancel_job(job, user=None):
    if job.status == FieldJob.Status.INVOICED:
        raise ValidationError(
            {"status": "No se puede cancelar un trabajo ya facturado."}
        )
    job.status = FieldJob.Status.CANCELLED
    job.save(update_fields=["status", "updated_at"])
    return job
