from django.contrib import admin

from .models import Equipment, EquipmentModel, EquipmentType, EquipmentComponent


@admin.register(EquipmentType)
class EquipmentTypeAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active")
    search_fields = ("name",)


class EquipmentComponentInline(admin.TabularInline):
    model = EquipmentComponent
    fields = ("code", "name", "component_type", "parent", "diagram_key", "sort_order", "is_active")
    extra = 0


@admin.register(EquipmentModel)
class EquipmentModelAdmin(admin.ModelAdmin):
    list_display = ("brand", "name", "model_code", "revision", "equipment_type", "is_active")
    list_filter = ("brand", "equipment_type", "is_active")
    search_fields = ("brand", "name", "model_code")
    inlines = [EquipmentComponentInline]


@admin.register(EquipmentComponent)
class EquipmentComponentAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "component_type", "equipment_model", "parent", "sort_order", "is_active")
    list_filter = ("equipment_model", "component_type", "is_active")
    search_fields = ("name", "code")


@admin.register(Equipment)
class EquipmentAdmin(admin.ModelAdmin):
    list_display = ("name", "equipment_type", "catalog_model", "owner_type", "customer", "status")
    list_filter = ("status", "owner_type", "equipment_type", "catalog_model")
    search_fields = ("name", "serial_number", "internal_code", "brand", "model")
