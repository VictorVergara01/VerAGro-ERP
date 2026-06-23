from django.db import models
from django.utils import timezone

from apps.core.models import TimeStampedModel


class FiscalDocument(TimeStampedModel):
    class FiscalStatus(models.TextChoices):
        PENDING = "pending", "Pendiente"
        AUTHORIZED = "authorized", "Autorizada"
        REJECTED = "rejected", "Rechazada"
        CANCELLED = "cancelled", "Anulada"

    class Environment(models.TextChoices):
        DEMO = "demo", "Demo / Pruebas"
        PRODUCTION = "production", "Producción"

    invoice = models.OneToOneField(
        "billing.Invoice", on_delete=models.CASCADE, related_name="fiscal"
    )
    cufe = models.CharField(max_length=120)
    protocol = models.CharField(max_length=60, blank=True)
    fiscal_status = models.CharField(
        max_length=20, choices=FiscalStatus.choices, default=FiscalStatus.AUTHORIZED
    )
    environment = models.CharField(
        max_length=20, choices=Environment.choices, default=Environment.DEMO
    )
    provider = models.CharField(max_length=20, default="demo")
    issued_at = models.DateTimeField(default=timezone.now)
    cancelled_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.cufe} ({self.fiscal_status})"
