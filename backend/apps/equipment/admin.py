from django.contrib import admin

from .models import Equipment, EquipmentModel, EquipmentType


@admin.register(EquipmentType)
class EquipmentTypeAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active")
    search_fields = ("name",)


@admin.register(EquipmentModel)
class EquipmentModelAdmin(admin.ModelAdmin):
    list_display = ("brand", "name", "model_code", "revision", "equipment_type", "is_active")
    list_filter = ("brand", "equipment_type", "is_active")
    search_fields = ("brand", "name", "model_code")


@admin.register(Equipment)
class EquipmentAdmin(admin.ModelAdmin):
    list_display = ("name", "equipment_type", "catalog_model", "owner_type", "customer", "status")
    list_filter = ("status", "owner_type", "equipment_type", "catalog_model")
    search_fields = ("name", "serial_number", "internal_code", "brand", "model")
