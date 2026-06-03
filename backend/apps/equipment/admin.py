from django.contrib import admin

from .models import Equipment, EquipmentType


@admin.register(EquipmentType)
class EquipmentTypeAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active")
    search_fields = ("name",)


@admin.register(Equipment)
class EquipmentAdmin(admin.ModelAdmin):
    list_display = ("name", "equipment_type", "owner_type", "customer", "status")
    list_filter = ("status", "owner_type", "equipment_type")
    search_fields = ("name", "serial_number", "internal_code", "brand", "model")
