from django.contrib import admin

from .models import (
    ChecklistTemplate,
    ChecklistTemplateItem,
    ServiceChecklist,
    ServiceChecklistItem,
)


class ChecklistTemplateItemInline(admin.TabularInline):
    model = ChecklistTemplateItem
    extra = 0


@admin.register(ChecklistTemplate)
class ChecklistTemplateAdmin(admin.ModelAdmin):
    list_display = ("name", "equipment_type", "is_active")
    list_filter = ("is_active", "equipment_type")
    search_fields = ("name",)
    inlines = (ChecklistTemplateItemInline,)


class ServiceChecklistItemInline(admin.TabularInline):
    model = ServiceChecklistItem
    extra = 0
    readonly_fields = ("template_item",)


@admin.register(ServiceChecklist)
class ServiceChecklistAdmin(admin.ModelAdmin):
    list_display = ("service_order", "checklist_template", "completed_at")
    search_fields = ("service_order__service_order_number", "checklist_template__name")
    inlines = (ServiceChecklistItemInline,)
