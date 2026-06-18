from django.db import models

from apps.core.models import TimeStampedModel


class ProductCategory(TimeStampedModel):
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True)
    default_margin_percentage = models.DecimalField(
        max_digits=12, decimal_places=2, default=0
    )

    class Meta:
        ordering = ("name",)
        verbose_name_plural = "Product categories"

    def __str__(self):
        return self.name


class Product(TimeStampedModel):
    sku = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    barcode = models.CharField(max_length=100, blank=True)
    category = models.ForeignKey(
        ProductCategory,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="products",
    )
    brand = models.CharField(max_length=100, blank=True)
    model = models.CharField(max_length=100, blank=True)
    unit_of_measure = models.CharField(max_length=50, blank=True)
    location = models.CharField(max_length=100, blank=True)
    compatible_equipment_types = models.ManyToManyField(
        "equipment.EquipmentType",
        blank=True,
        related_name="compatible_products",
    )
    compatible_models = models.TextField(blank=True)
    stock_quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    reserved_quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    minimum_stock = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    average_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    last_purchase_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    sale_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    default_margin_percentage = models.DecimalField(
        max_digits=12, decimal_places=2, default=0
    )
    is_active = models.BooleanField(default=True)
    main_supplier = models.ForeignKey(
        "suppliers.Supplier",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="main_for_products",
    )

    class Meta:
        ordering = ("name",)

    def __str__(self):
        return self.name

    @property
    def available_quantity(self):
        return self.stock_quantity - self.reserved_quantity


class InventoryMovement(TimeStampedModel):
    class MovementType(models.TextChoices):
        PURCHASE_IN = "purchase_in", "Entrada por compra"
        SERVICE_OUT = "service_out", "Salida por servicio"
        SALE_OUT = "sale_out", "Salida por venta"
        RESERVATION = "reservation", "Reserva"
        RESERVATION_RELEASE = "reservation_release", "Liberación de reserva"
        ADJUSTMENT_IN = "adjustment_in", "Ajuste positivo"
        ADJUSTMENT_OUT = "adjustment_out", "Ajuste negativo"
        RETURN_IN = "return_in", "Devolución"
        DAMAGED_OUT = "damaged_out", "Baja por daño"

    product = models.ForeignKey(
        Product, on_delete=models.PROTECT, related_name="movements"
    )
    movement_type = models.CharField(max_length=30, choices=MovementType.choices)
    quantity = models.DecimalField(max_digits=12, decimal_places=2)
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    reference_type = models.CharField(max_length=50, blank=True)
    reference_id = models.PositiveIntegerField(null=True, blank=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        "users.User", on_delete=models.SET_NULL, null=True, blank=True
    )

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.movement_type} {self.quantity} x {self.product}"
