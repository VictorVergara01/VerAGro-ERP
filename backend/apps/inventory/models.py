from django.core.exceptions import ValidationError
from django.db import models

from apps.core.models import TimeStampedModel


class ProductCategory(TimeStampedModel):
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True)
    default_margin_percentage = models.DecimalField(
        max_digits=12, decimal_places=2, default=0
    )
    min_margin_percentage = models.DecimalField(
        max_digits=12, decimal_places=2, default=0
    )
    max_margin_percentage = models.DecimalField(
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
    part_number = models.CharField(max_length=100, blank=True, default="")
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
    min_margin_percentage = models.DecimalField(
        max_digits=12, decimal_places=2, default=0
    )
    max_margin_percentage = models.DecimalField(
        max_digits=12, decimal_places=2, default=0
    )
    # Rango de venta derivado de average_cost. Se denormaliza (en vez de
    # calcularse al vuelo) para poder filtrar en SQL el reporte de ventas
    # bajo el piso sin recorrer producto por producto.
    min_sale_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    max_sale_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
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
    # 4 decimales para no perder el costo landed, que se calcula con esa precisión
    # en PurchaseOrderLine.landed_unit_cost.
    unit_cost = models.DecimalField(max_digits=14, decimal_places=4, default=0)
    # Promedio ponderado del producto DESPUÉS de aplicar este movimiento. Es lo que
    # permite reconstruir la evolución del costo en el historial.
    average_cost_after = models.DecimalField(
        max_digits=12, decimal_places=2, default=0
    )
    purchase_order_line = models.ForeignKey(
        "purchasing.PurchaseOrderLine",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="movements",
    )
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


class ProductCompatibility(TimeStampedModel):
    product = models.ForeignKey(
        Product, on_delete=models.CASCADE, related_name="compatibilities"
    )
    equipment_model = models.ForeignKey(
        "equipment.EquipmentModel",
        on_delete=models.CASCADE,
        related_name="product_compatibilities",
    )
    component = models.ForeignKey(
        "equipment.EquipmentComponent",
        on_delete=models.CASCADE,
        related_name="product_compatibilities",
    )
    is_primary = models.BooleanField(default=False)
    notes = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        ordering = ("id",)
        indexes = [
            models.Index(fields=["product"]),
            models.Index(fields=["equipment_model"]),
            models.Index(fields=["component"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["product", "equipment_model", "component"],
                name="uniq_product_model_component",
            )
        ]
        verbose_name_plural = "Product compatibilities"

    def __str__(self):
        return f"{self.product} → {self.component}"

    def clean(self):
        if (
            self.component_id
            and self.equipment_model_id
            and self.component.equipment_model_id != self.equipment_model_id
        ):
            raise ValidationError(
                {"component": "El componente no pertenece al modelo indicado."}
            )
