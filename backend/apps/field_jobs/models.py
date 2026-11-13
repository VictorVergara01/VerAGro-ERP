from decimal import Decimal, ROUND_HALF_UP
import uuid

from django.db import models
from django.utils import timezone
from django.core.validators import MinValueValidator
from apps.core.models import TimeStampedModel


class FieldPilot(TimeStampedModel):
    name = models.CharField(max_length=150, unique=True)
    phone = models.CharField(max_length=50, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("name",)


class PilotRate(TimeStampedModel):
    pilot = models.OneToOneField(FieldPilot, on_delete=models.PROTECT, related_name="rate")
    rate_per_hectare = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))])


class FieldAssistant(TimeStampedModel):
    name = models.CharField(max_length=150, unique=True)
    is_active = models.BooleanField(default=True)


class FieldPayment(TimeStampedModel):
    class Method(models.TextChoices):
        CASH = "cash", "Efectivo"
        TRANSFER = "bank_transfer", "Transferencia"
        YAPPY = "yappy", "Yappy"
        OTHER = "other", "Otro"

    kind = models.CharField(max_length=10, choices=[("pilot", "Piloto"), ("assistant", "Asistente")])
    beneficiary = models.CharField(max_length=255)
    payment_date = models.DateField(default=timezone.localdate)
    method = models.CharField(max_length=20, choices=Method.choices)
    reference = models.CharField(max_length=150, blank=True)
    notes = models.TextField(blank=True)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    created_by = models.ForeignKey("users.User", on_delete=models.PROTECT, related_name="field_payments")

    class Meta:
        ordering = ("-payment_date", "-id")


class PilotEarning(TimeStampedModel):
    job = models.OneToOneField("FieldJob", on_delete=models.PROTECT, related_name="pilot_earning")
    pilot = models.ForeignKey(FieldPilot, on_delete=models.PROTECT, related_name="earnings")
    earned_date = models.DateField()
    hectares = models.DecimalField(max_digits=10, decimal_places=4)
    rate_per_hectare = models.DecimalField(max_digits=10, decimal_places=2)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    payment = models.ForeignKey(FieldPayment, on_delete=models.PROTECT, null=True, blank=True, related_name="pilot_earnings")


class AssistantDay(TimeStampedModel):
    assistant = models.ForeignKey(FieldAssistant, on_delete=models.PROTECT, related_name="days")
    date = models.DateField(default=timezone.localdate)
    end_time = models.TimeField(default="16:00")
    base_rate = models.DecimalField(max_digits=8, decimal_places=2, default=20)
    overtime_rate = models.DecimalField(max_digits=8, decimal_places=2, default=3)
    overtime_minutes = models.PositiveSmallIntegerField(default=0)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    notes = models.TextField(blank=True)
    payment = models.ForeignKey(FieldPayment, on_delete=models.PROTECT, null=True, blank=True, related_name="assistant_days")
    created_by = models.ForeignKey("users.User", on_delete=models.PROTECT, related_name="field_assistant_days")

    class Meta:
        ordering = ("-date", "-id")
        constraints = [models.UniqueConstraint(fields=["assistant", "date"], name="unique_field_assistant_day")]


class FieldExpense(TimeStampedModel):
    class Category(models.TextChoices):
        FUEL = "fuel", "Combustible"
        PARTS = "parts", "Repuestos"
        MAINTENANCE = "maintenance", "Mantenimiento"
        TRANSPORT = "transport", "Transporte"
        FOOD = "food", "Alimentación y viáticos"
        OTHER = "other", "Otros"

    date = models.DateField(default=timezone.localdate)
    category = models.CharField(max_length=20, choices=Category.choices)
    description = models.CharField(max_length=255)
    payee = models.CharField(max_length=150, blank=True)
    amount = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))])
    equipment = models.ForeignKey("equipment.Equipment", on_delete=models.PROTECT, null=True, blank=True)
    receipt_reference = models.CharField(max_length=255, blank=True)
    payment_date = models.DateField(null=True, blank=True)
    payment_method = models.CharField(max_length=20, choices=FieldPayment.Method.choices, blank=True)
    payment_reference = models.CharField(max_length=150, blank=True)
    paid_by = models.ForeignKey("users.User", on_delete=models.PROTECT, null=True, blank=True, related_name="field_expenses_paid")
    created_by = models.ForeignKey("users.User", on_delete=models.PROTECT, related_name="field_expenses")

    class Meta:
        ordering = ("-date", "-id")

class FieldJob(TimeStampedModel):
    class BillingUnit(models.TextChoices):
        HECTARE = "ha", "Por hectárea"
        QUINTAL = "qq", "Por quintal"

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
    plot = models.ForeignKey(
        "FieldPlot",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="field_jobs",
    )
    equipment = models.ForeignKey(
        "equipment.Equipment",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="field_jobs",
    )
    pilot = models.ForeignKey(
        FieldPilot,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="jobs",
    )
    scheduled_date = models.DateField(default=timezone.localdate)
    done_date = models.DateField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
    location = models.CharField(max_length=255, blank=True)
    crop = models.CharField(max_length=20, choices=Crop.choices, default=Crop.RICE)
    crop_other = models.CharField(max_length=100, blank=True)
    hectares = models.DecimalField(max_digits=10, decimal_places=4, default=1)
    billing_unit = models.CharField(max_length=2, choices=BillingUnit.choices, default=BillingUnit.HECTARE)
    quintals_per_hectare = models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True)
    planned_quintals = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    actual_hectares = models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True)
    applied_quintals = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    actuals_from_legacy = models.BooleanField(default=False)
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

    @property
    def total_quintals(self):
        if self.status in (self.Status.DONE, self.Status.INVOICED):
            return self.applied_quintals or Decimal("0")
        return self.estimated_quintals

    @property
    def estimated_quintals(self):
        if self.planned_quintals is not None:
            return self.planned_quintals
        return ((self.hectares or Decimal("0")) * (self.quintals_per_hectare or Decimal("0"))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    @property
    def billable_quantity(self):
        completed = self.status in (self.Status.DONE, self.Status.INVOICED)
        area = self.actual_hectares if completed else self.hectares
        quantity = self.total_quintals if self.billing_unit == self.BillingUnit.QUINTAL else area
        return Decimal(quantity or 0).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    @property
    def estimated_total(self):
        quantity = self.estimated_quintals if self.billing_unit == self.BillingUnit.QUINTAL else self.hectares
        quantity = Decimal(quantity or 0).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        return (quantity * Decimal(self.unit_price or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    @property
    def actual_quintals_per_hectare(self):
        if self.actual_hectares and self.applied_quintals is not None:
            return (self.applied_quintals / self.actual_hectares).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
        return None

    def recalculate_total(self):
        self.total = (self.billable_quantity * (self.unit_price or Decimal("0"))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if not self.number:
            self.number = f"TC-{self.pk:06d}"
            super().save(update_fields=["number"])


class FieldCollection(TimeStampedModel):
    job = models.ForeignKey(FieldJob, on_delete=models.PROTECT, related_name="collections")
    amount = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))])
    payment_date = models.DateField(default=timezone.localdate)
    method = models.CharField(max_length=20, choices=[("cash", "Efectivo"), ("bank_transfer", "Transferencia"), ("yappy", "Yappy"), ("ach", "ACH"), ("card", "Tarjeta"), ("other", "Otro")])
    reference = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)
    request_id = models.UUIDField(unique=True, default=uuid.uuid4, editable=False)
    invoice_payment = models.OneToOneField("billing.Payment", on_delete=models.PROTECT, null=True, blank=True, related_name="field_collection")
    created_by = models.ForeignKey("users.User", on_delete=models.PROTECT, null=True, related_name="field_collections")

    class Meta:
        ordering = ("payment_date", "id")
        constraints = [models.CheckConstraint(condition=models.Q(amount__gt=0), name="field_collection_positive")]


class FieldJobProduct(TimeStampedModel):
    class Unit(models.TextChoices):
        L_HA = "L/ha", "L/ha"
        CC_HA = "cc/ha", "cc/ha"
        KG_HA = "kg/ha", "kg/ha"  # reservado para sólidos
        G_HA = "g/ha", "g/ha"  # reservado para sólidos
        QQ_HA = "qq/ha", "qq/ha"

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


class FieldPlot(TimeStampedModel):
    """Lote (potrero/talhão) de un cliente: los datos estables de un terreno.

    Guarda además la receta habitual (tasa de aplicación y químicos) para
    autollenar el Trabajo de campo. El trabajo copia los valores al crearse:
    editar el lote después no reescribe trabajos ya capturados.
    """

    customer = models.ForeignKey(
        "customers.Customer", on_delete=models.PROTECT, related_name="plots"
    )
    name = models.CharField(max_length=150)
    hectares = models.DecimalField(max_digits=10, decimal_places=4, default=1)
    crop = models.CharField(
        max_length=20, choices=FieldJob.Crop.choices, default=FieldJob.Crop.RICE
    )
    crop_other = models.CharField(max_length=100, blank=True)
    location = models.CharField(max_length=255, blank=True)
    # Mismo nombre que en FieldJob para que la copia sea campo a campo.
    water_per_hectare = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("customer", "name")
        constraints = [
            models.UniqueConstraint(
                fields=["customer", "name"],
                condition=models.Q(is_active=True),
                name="uniq_active_plot_name_per_customer",
            )
        ]

    def __str__(self):
        return self.name


class FieldPlotProduct(TimeStampedModel):
    plot = models.ForeignKey(
        FieldPlot, on_delete=models.CASCADE, related_name="products"
    )
    name = models.CharField(max_length=150)
    dose_per_hectare = models.DecimalField(max_digits=10, decimal_places=4, default=0)
    unit = models.CharField(
        max_length=10,
        choices=FieldJobProduct.Unit.choices,
        default=FieldJobProduct.Unit.L_HA,
    )

    class Meta:
        ordering = ("id",)

    def __str__(self):
        return f"{self.name} ({self.dose_per_hectare} {self.unit})"
