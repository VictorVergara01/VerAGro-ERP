from django.db import models
from django.utils import timezone

from apps.core.models import TimeStampedModel


class LineType(models.TextChoices):
    PRODUCT = "product", "Producto"
    SERVICE = "service", "Servicio"
    LABOR = "labor", "Mano de obra"
    DIAGNOSTIC = "diagnostic", "Diagnóstico"
    OTHER = "other", "Otro"


class Quote(TimeStampedModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Borrador"
        SENT = "sent", "Enviada"
        APPROVED = "approved", "Aprobada"
        REJECTED = "rejected", "Rechazada"
        EXPIRED = "expired", "Expirada"
        CONVERTED = "converted_to_invoice", "Convertida en factura"

    quote_number = models.CharField(max_length=30, unique=True, blank=True)
    customer = models.ForeignKey(
        "customers.Customer", on_delete=models.PROTECT, related_name="quotes"
    )
    service_order = models.ForeignKey(
        "service_orders.ServiceOrder",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="quotes",
    )
    status = models.CharField(
        max_length=30, choices=Status.choices, default=Status.DRAFT
    )
    issue_date = models.DateField(default=timezone.localdate)
    expiration_date = models.DateField(null=True, blank=True)
    subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    discount_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    notes = models.TextField(blank=True)
    terms = models.TextField(blank=True)
    created_by = models.ForeignKey(
        "users.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return self.quote_number or f"COT sin número (#{self.pk})"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if not self.quote_number:
            self.quote_number = f"COT-{self.pk:06d}"
            super().save(update_fields=["quote_number"])


class QuoteLine(TimeStampedModel):
    quote = models.ForeignKey(Quote, on_delete=models.CASCADE, related_name="lines")
    product = models.ForeignKey(
        "inventory.Product",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    description = models.CharField(max_length=255, blank=True)
    quantity = models.DecimalField(max_digits=12, decimal_places=2, default=1)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    line_type = models.CharField(
        max_length=20, choices=LineType.choices, default=LineType.PRODUCT
    )

    class Meta:
        ordering = ("id",)

    def __str__(self):
        return self.description or str(self.product)


class Invoice(TimeStampedModel):
    class InvoiceType(models.TextChoices):
        SERVICE = "service_invoice", "Factura de servicio"
        FINAL = "final_invoice", "Factura final"
        PRODUCT_SALE = "product_sale", "Venta de producto"

    class Status(models.TextChoices):
        DRAFT = "draft", "Borrador"
        ISSUED = "issued", "Emitida"
        PARTIALLY_PAID = "partially_paid", "Parcialmente pagada"
        PAID = "paid", "Pagada"
        CANCELLED = "cancelled", "Cancelada"

    invoice_number = models.CharField(max_length=30, unique=True, blank=True)
    invoice_type = models.CharField(
        max_length=20, choices=InvoiceType.choices, default=InvoiceType.SERVICE
    )
    customer = models.ForeignKey(
        "customers.Customer", on_delete=models.PROTECT, related_name="invoices"
    )
    service_order = models.ForeignKey(
        "service_orders.ServiceOrder",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="invoices",
    )
    quote = models.ForeignKey(
        Quote, on_delete=models.SET_NULL, null=True, blank=True, related_name="invoices"
    )
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.DRAFT
    )
    issue_date = models.DateField(default=timezone.localdate)
    due_date = models.DateField(null=True, blank=True)
    subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    discount_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    paid_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    balance_due = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        "users.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return self.invoice_number or f"FAC sin número (#{self.pk})"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if not self.invoice_number:
            self.invoice_number = f"FAC-{self.pk:06d}"
            super().save(update_fields=["invoice_number"])


class InvoiceLine(TimeStampedModel):
    invoice = models.ForeignKey(
        Invoice, on_delete=models.CASCADE, related_name="lines"
    )
    product = models.ForeignKey(
        "inventory.Product",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    description = models.CharField(max_length=255, blank=True)
    quantity = models.DecimalField(max_digits=12, decimal_places=2, default=1)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    margin_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    discount_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    line_type = models.CharField(
        max_length=20, choices=LineType.choices, default=LineType.PRODUCT
    )

    class Meta:
        ordering = ("id",)

    def __str__(self):
        return self.description or str(self.product)


class Payment(TimeStampedModel):
    class Method(models.TextChoices):
        CASH = "cash", "Efectivo"
        BANK_TRANSFER = "bank_transfer", "Transferencia"
        YAPPY = "yappy", "Yappy"
        ACH = "ach", "ACH"
        CARD = "card", "Tarjeta"
        OTHER = "other", "Otro"

    invoice = models.ForeignKey(
        Invoice, on_delete=models.CASCADE, related_name="payments"
    )
    payment_date = models.DateField(default=timezone.localdate)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    method = models.CharField(
        max_length=20, choices=Method.choices, default=Method.CASH
    )
    reference_number = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        "users.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )

    class Meta:
        ordering = ("-payment_date", "id")

    def __str__(self):
        return f"{self.amount} · {self.invoice}"
