from django.db import models
from django.utils import timezone

from apps.core.models import TimeStampedModel


class ServiceOrder(TimeStampedModel):
    class ServiceType(models.TextChoices):
        DIAGNOSTIC = "diagnostic", "Diagnóstico"
        PREVENTIVE = "preventive_maintenance", "Mantenimiento preventivo"
        CORRECTIVE = "corrective_maintenance", "Mantenimiento correctivo"
        REPAIR = "repair", "Reparación"
        CLEANING = "cleaning", "Limpieza"
        CALIBRATION = "calibration", "Calibración"
        OTHER = "other", "Otro"

    class Status(models.TextChoices):
        RECEIVED = "received", "Recibida"
        IN_DIAGNOSTIC = "in_diagnostic", "En diagnóstico"
        QUOTED = "quoted", "Cotizada"
        APPROVED = "approved", "Aprobada"
        IN_PROGRESS = "in_progress", "En proceso"
        WAITING_PARTS = "waiting_parts", "Esperando piezas"
        FINISHED = "finished", "Finalizada"
        INVOICED = "invoiced", "Facturada"
        DELIVERED = "delivered", "Entregada"
        CANCELLED = "cancelled", "Cancelada"

    service_order_number = models.CharField(max_length=30, unique=True, blank=True)
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.PROTECT,
        related_name="service_orders",
    )
    equipment = models.ForeignKey(
        "equipment.Equipment",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="service_orders",
    )
    service_type = models.CharField(
        max_length=30, choices=ServiceType.choices, default=ServiceType.DIAGNOSTIC
    )
    status = models.CharField(
        max_length=30, choices=Status.choices, default=Status.RECEIVED
    )
    received_date = models.DateField(default=timezone.localdate)
    estimated_delivery_date = models.DateField(null=True, blank=True)
    finished_date = models.DateField(null=True, blank=True)
    delivered_date = models.DateField(null=True, blank=True)
    technician = models.ForeignKey(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="service_orders_as_technician",
    )
    customer_complaint = models.TextField(blank=True)
    diagnostic_summary = models.TextField(blank=True)
    technical_notes = models.TextField(blank=True)
    internal_notes = models.TextField(blank=True)
    labor_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    diagnostic_fee = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    created_by = models.ForeignKey(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return self.service_order_number or f"OS sin número (#{self.pk})"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if not self.service_order_number:
            self.service_order_number = f"OS-{self.pk:06d}"
            super().save(update_fields=["service_order_number"])


class ServiceOrderPart(TimeStampedModel):
    class Status(models.TextChoices):
        REQUIRED = "required", "Requerida"
        RESERVED = "reserved", "Reservada"
        USED = "used", "Usada"
        PENDING_PURCHASE = "pending_purchase", "Pendiente de compra"
        RETURNED = "returned", "Devuelta"

    service_order = models.ForeignKey(
        ServiceOrder, on_delete=models.CASCADE, related_name="parts"
    )
    product = models.ForeignKey(
        "inventory.Product", on_delete=models.PROTECT, related_name="service_parts"
    )
    quantity = models.DecimalField(max_digits=12, decimal_places=2)
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_price = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.REQUIRED
    )
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ("id",)

    def __str__(self):
        return f"{self.product} x{self.quantity} ({self.status})"


def service_order_photo_path(instance, filename):
    return f"service_orders/{instance.service_order_id}/{filename}"


class ServiceOrderPhoto(TimeStampedModel):
    service_order = models.ForeignKey(
        ServiceOrder, on_delete=models.CASCADE, related_name="photos"
    )
    image = models.ImageField(upload_to=service_order_photo_path)
    caption = models.CharField(max_length=255, blank=True)
    uploaded_by = models.ForeignKey(
        "users.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"Foto orden {self.service_order_id}"
