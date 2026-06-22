from decimal import Decimal

from django.db import models
from django.utils import timezone

from apps.core.models import TimeStampedModel


class FieldJob(TimeStampedModel):
    class JobType(models.TextChoices):
        FUMIGATION = "fumigation", "Fumigación"
        SPREADING = "spreading", "Esparcido / abono"  # reservado para sólidos

    class Status(models.TextChoices):
        SCHEDULED = "scheduled", "Programado"
        DONE = "done", "Hecho"
        INVOICED = "invoiced", "Facturado"
        CANCELLED = "cancelled", "Cancelado"

    class Crop(models.TextChoices):
        RICE = "rice", "Arroz"
        CORN = "corn", "Maíz"
        PASTURE = "pasture", "Pasto"
        OTHER = "other", "Otros"

    number = models.CharField(max_length=30, unique=True, blank=True)
    job_type = models.CharField(
        max_length=20, choices=JobType.choices, default=JobType.FUMIGATION
    )
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.SCHEDULED
    )
    customer = models.ForeignKey(
        "customers.Customer", on_delete=models.PROTECT, related_name="field_jobs"
    )
    equipment = models.ForeignKey(
        "equipment.Equipment",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="field_jobs",
    )
    technician = models.ForeignKey(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="field_jobs",
    )
    scheduled_date = models.DateField(default=timezone.localdate)
    done_date = models.DateField(null=True, blank=True)
    location = models.CharField(max_length=255, blank=True)
    crop = models.CharField(max_length=20, choices=Crop.choices, default=Crop.RICE)
    crop_other = models.CharField(max_length=100, blank=True)
    hectares = models.DecimalField(max_digits=10, decimal_places=4, default=1)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tank_volume_liters = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )
    water_per_hectare = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        "users.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )

    class Meta:
        ordering = ("-scheduled_date", "-created_at")

    def __str__(self):
        return self.number or f"TC sin número (#{self.pk})"

    def recalculate_total(self):
        # Solo fumigación por ahora; el módulo de sólidos ajustará esto.
        self.total = (self.hectares or Decimal("0")) * (self.unit_price or Decimal("0"))

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if not self.number:
            self.number = f"TC-{self.pk:06d}"
            super().save(update_fields=["number"])


class FieldJobProduct(TimeStampedModel):
    class Unit(models.TextChoices):
        L_HA = "L/ha", "L/ha"
        CC_HA = "cc/ha", "cc/ha"
        KG_HA = "kg/ha", "kg/ha"  # reservado para sólidos
        G_HA = "g/ha", "g/ha"  # reservado para sólidos

    field_job = models.ForeignKey(
        FieldJob, on_delete=models.CASCADE, related_name="products"
    )
    name = models.CharField(max_length=150)
    dose_per_hectare = models.DecimalField(max_digits=10, decimal_places=4, default=0)
    unit = models.CharField(max_length=10, choices=Unit.choices, default=Unit.L_HA)

    class Meta:
        ordering = ("id",)

    def __str__(self):
        return f"{self.name} ({self.dose_per_hectare} {self.unit})"
