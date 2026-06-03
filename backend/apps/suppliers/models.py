from django.db import models

from apps.core.models import TimeStampedModel


class Supplier(TimeStampedModel):
    name = models.CharField(max_length=255)
    legal_name = models.CharField(max_length=255, blank=True)
    country = models.CharField(max_length=100, blank=True)
    phone = models.CharField(max_length=50, blank=True)
    whatsapp = models.CharField(max_length=50, blank=True)
    email = models.EmailField(blank=True)
    website = models.URLField(blank=True)
    contact_person = models.CharField(max_length=255, blank=True)
    address = models.TextField(blank=True)
    estimated_delivery_days = models.PositiveIntegerField(null=True, blank=True)
    payment_terms = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("name",)

    def __str__(self):
        return self.name


class SupplierProduct(TimeStampedModel):
    supplier = models.ForeignKey(
        Supplier, on_delete=models.CASCADE, related_name="supplier_products"
    )
    product = models.ForeignKey(
        "inventory.Product",
        on_delete=models.CASCADE,
        related_name="supplier_products",
    )
    supplier_sku = models.CharField(max_length=100, blank=True)
    last_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    currency = models.CharField(max_length=10, default="USD")
    minimum_order_quantity = models.DecimalField(
        max_digits=12, decimal_places=2, default=0
    )
    estimated_delivery_days = models.PositiveIntegerField(null=True, blank=True)
    is_preferred = models.BooleanField(default=False)
    notes = models.TextField(blank=True)

    class Meta:
        unique_together = (("supplier", "product"),)
        ordering = ("supplier_id", "product_id")

    def __str__(self):
        return f"{self.supplier} · {self.product}"
