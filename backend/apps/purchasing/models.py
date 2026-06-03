from django.db import models
from django.utils import timezone

from apps.core.models import TimeStampedModel


class PurchaseOrder(TimeStampedModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Borrador"
        SENT = "sent", "Enviada"
        PARTIALLY_RECEIVED = "partially_received", "Parcialmente recibida"
        RECEIVED = "received", "Recibida"
        CANCELLED = "cancelled", "Cancelada"

    supplier = models.ForeignKey(
        "suppliers.Supplier",
        on_delete=models.PROTECT,
        related_name="purchase_orders",
    )
    order_number = models.CharField(max_length=30, unique=True, blank=True)
    status = models.CharField(
        max_length=30, choices=Status.choices, default=Status.DRAFT
    )
    order_date = models.DateField(default=timezone.localdate)
    expected_date = models.DateField(null=True, blank=True)
    currency = models.CharField(max_length=10, default="USD")
    subtotal_products = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    shipping_cost = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    additional_costs_total = models.DecimalField(
        max_digits=14, decimal_places=2, default=0
    )
    grand_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        "users.User", on_delete=models.SET_NULL, null=True, blank=True
    )

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return self.order_number or f"OC sin número (#{self.pk})"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if not self.order_number:
            self.order_number = f"OC-{self.pk:06d}"
            super().save(update_fields=["order_number"])


class PurchaseOrderLine(TimeStampedModel):
    purchase_order = models.ForeignKey(
        PurchaseOrder, on_delete=models.CASCADE, related_name="lines"
    )
    product = models.ForeignKey(
        "inventory.Product", on_delete=models.PROTECT, related_name="purchase_lines"
    )
    quantity_ordered = models.DecimalField(max_digits=12, decimal_places=2)
    quantity_received = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    unit_purchase_cost = models.DecimalField(max_digits=12, decimal_places=2)
    line_subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    allocated_extra_cost = models.DecimalField(
        max_digits=14, decimal_places=2, default=0
    )
    # 4 decimales: el costo unitario real puede tener fracciones por la distribución.
    landed_unit_cost = models.DecimalField(max_digits=14, decimal_places=4, default=0)
    margin_percentage = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    calculated_sale_price = models.DecimalField(
        max_digits=14, decimal_places=2, default=0
    )
    final_sale_price = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    class Meta:
        ordering = ("id",)

    def __str__(self):
        return f"{self.product} x{self.quantity_ordered}"


class PurchaseAdditionalCost(TimeStampedModel):
    class AllocationMethod(models.TextChoices):
        PROPORTIONAL_BY_VALUE = "proportional_by_value", "Proporcional al valor"
        MANUAL = "manual", "Manual"

    purchase_order = models.ForeignKey(
        PurchaseOrder, on_delete=models.CASCADE, related_name="additional_costs"
    )
    name = models.CharField(max_length=255)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    allocation_method = models.CharField(
        max_length=30,
        choices=AllocationMethod.choices,
        default=AllocationMethod.PROPORTIONAL_BY_VALUE,
    )
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ("id",)

    def __str__(self):
        return f"{self.name}: {self.amount}"
