from django.db import models

from apps.core.models import TimeStampedModel


class ChecklistTemplate(TimeStampedModel):
    name = models.CharField(max_length=255)
    equipment_type = models.ForeignKey(
        "equipment.EquipmentType",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="checklist_templates",
    )
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("name",)

    def __str__(self):
        return self.name


class ChecklistTemplateItem(TimeStampedModel):
    template = models.ForeignKey(
        ChecklistTemplate, on_delete=models.CASCADE, related_name="items"
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    order = models.PositiveIntegerField(default=0)
    is_required = models.BooleanField(default=True)

    class Meta:
        ordering = ("order", "id")

    def __str__(self):
        return self.name


class ServiceChecklist(TimeStampedModel):
    service_order = models.ForeignKey(
        "service_orders.ServiceOrder",
        on_delete=models.CASCADE,
        related_name="checklists",
    )
    checklist_template = models.ForeignKey(
        ChecklistTemplate, on_delete=models.PROTECT, related_name="service_checklists"
    )
    completed_by = models.ForeignKey(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("id",)
        unique_together = (("service_order", "checklist_template"),)

    def __str__(self):
        return f"{self.service_order} · {self.checklist_template}"


class ServiceChecklistItem(TimeStampedModel):
    class Status(models.TextChoices):
        OK = "ok", "OK"
        FAIL = "fail", "Falla"
        REQUIRES_REPLACEMENT = "requires_replacement", "Requiere reemplazo"
        NOT_APPLICABLE = "not_applicable", "No aplica"
        PENDING = "pending", "Pendiente"

    class Priority(models.TextChoices):
        LOW = "low", "Baja"
        MEDIUM = "medium", "Media"
        HIGH = "high", "Alta"
        CRITICAL = "critical", "Crítica"

    service_checklist = models.ForeignKey(
        ServiceChecklist, on_delete=models.CASCADE, related_name="items"
    )
    template_item = models.ForeignKey(
        ChecklistTemplateItem, on_delete=models.PROTECT, related_name="+"
    )
    status = models.CharField(
        max_length=30, choices=Status.choices, default=Status.PENDING
    )
    notes = models.TextField(blank=True)
    recommended_product = models.ForeignKey(
        "inventory.Product",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    priority = models.CharField(
        max_length=20, choices=Priority.choices, blank=True, default=""
    )

    class Meta:
        ordering = ("template_item__order", "id")

    def __str__(self):
        return f"{self.template_item} ({self.status})"
