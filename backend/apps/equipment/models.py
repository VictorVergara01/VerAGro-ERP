from django.db import models
from django.core.exceptions import ValidationError

from apps.core.models import TimeStampedModel


class EquipmentType(TimeStampedModel):
    name = models.CharField(max_length=100, unique=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("name",)

    def __str__(self):
        return self.name


class EquipmentModel(TimeStampedModel):
    class DiagramType(models.TextChoices):
        SVG = "svg", "SVG"
        IMAGE = "image", "Imagen"

    equipment_type = models.ForeignKey(
        EquipmentType,
        on_delete=models.PROTECT,
        related_name="equipment_models",
    )
    brand = models.CharField(max_length=100)
    name = models.CharField(max_length=150)
    model_code = models.CharField(max_length=100)
    revision = models.CharField(max_length=50, blank=True, default="")
    description = models.TextField(blank=True, default="")
    diagram_type = models.CharField(
        max_length=20, choices=DiagramType.choices, default=DiagramType.SVG
    )
    diagram_file = models.FileField(
        upload_to="equipment_models/diagrams/", null=True, blank=True
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("brand", "name")
        constraints = [
            models.UniqueConstraint(
                fields=["brand", "model_code", "revision"],
                name="uniq_equipment_model_brand_code_rev",
            )
        ]

    def __str__(self):
        return f"{self.brand} {self.name}"


class EquipmentComponent(TimeStampedModel):
    class ComponentType(models.TextChoices):
        ASSEMBLY = "assembly", "Conjunto"
        POSITION = "position", "Posición reemplazable"

    equipment_model = models.ForeignKey(
        EquipmentModel, on_delete=models.CASCADE, related_name="components"
    )
    parent = models.ForeignKey(
        "self", on_delete=models.CASCADE, null=True, blank=True, related_name="children"
    )
    code = models.CharField(max_length=100)
    name = models.CharField(max_length=150)
    component_type = models.CharField(
        max_length=20, choices=ComponentType.choices, default=ComponentType.POSITION
    )
    diagram_key = models.CharField(max_length=100, blank=True, default="")
    position = models.CharField(max_length=100, blank=True, default="")
    description = models.TextField(blank=True, default="")
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("sort_order", "name")
        indexes = [
            models.Index(fields=["equipment_model"]),
            models.Index(fields=["parent"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["equipment_model", "code"], name="uniq_component_model_code"
            )
        ]

    def __str__(self):
        return self.name

    @property
    def path(self):
        names, node, seen = [], self, set()
        while node is not None and node.pk not in seen:
            seen.add(node.pk)
            names.append(node.name)
            node = node.parent
        return " > ".join(reversed(names))

    def clean(self):
        if self.parent_id:
            if self.parent.equipment_model_id != self.equipment_model_id:
                raise ValidationError(
                    {"parent": "El padre debe pertenecer al mismo modelo técnico."}
                )
            ancestor, seen = self.parent, set()
            while ancestor is not None:
                if ancestor.pk == self.pk:
                    raise ValidationError({"parent": "Relación cíclica no permitida."})
                if ancestor.pk in seen:
                    break
                seen.add(ancestor.pk)
                ancestor = ancestor.parent


class Equipment(TimeStampedModel):
    class OwnerType(models.TextChoices):
        CUSTOMER = "customer", "Cliente"
        COMPANY = "company", "Empresa"

    class Status(models.TextChoices):
        ACTIVE = "active", "Activo"
        IN_MAINTENANCE = "in_maintenance", "En mantenimiento"
        OUT_OF_SERVICE = "out_of_service", "Fuera de servicio"
        SOLD = "sold", "Vendido"
        RETIRED = "retired", "Retirado"

    owner_type = models.CharField(
        max_length=20, choices=OwnerType.choices, default=OwnerType.CUSTOMER
    )
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="equipment",
    )
    equipment_type = models.ForeignKey(
        EquipmentType, on_delete=models.PROTECT, related_name="equipment"
    )
    catalog_model = models.ForeignKey(
        EquipmentModel,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="equipment_units",
    )
    name = models.CharField(max_length=255)
    brand = models.CharField(max_length=100, blank=True)
    model = models.CharField(max_length=100, blank=True)
    serial_number = models.CharField(max_length=100, blank=True)
    internal_code = models.CharField(max_length=100, blank=True)
    purchase_date = models.DateField(null=True, blank=True)
    warranty_expiration = models.DateField(null=True, blank=True)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.ACTIVE
    )
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ("name",)

    def __str__(self):
        return self.name
