from django.db import models

from apps.core.models import TimeStampedModel


class Customer(TimeStampedModel):
    class CustomerType(models.TextChoices):
        PERSON = "person", "Persona"
        COMPANY = "company", "Empresa"

    class IdentificationType(models.TextChoices):
        CEDULA = "cedula", "Cédula"
        RUC = "ruc", "RUC"
        PASSPORT = "passport", "Pasaporte"
        OTHER = "other", "Otro"

    customer_type = models.CharField(
        max_length=20, choices=CustomerType.choices, default=CustomerType.PERSON
    )
    name = models.CharField(max_length=255)
    legal_name = models.CharField(max_length=255, blank=True)
    identification_type = models.CharField(
        max_length=20, choices=IdentificationType.choices, blank=True
    )
    identification_number = models.CharField(max_length=50, blank=True)
    dv = models.CharField(max_length=10, blank=True)
    phone = models.CharField(max_length=50, blank=True)
    whatsapp = models.CharField(max_length=50, blank=True)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    province = models.CharField(max_length=100, blank=True)
    district = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("name",)

    def __str__(self):
        return self.name
