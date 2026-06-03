from django.contrib import admin

from .models import Supplier, SupplierProduct


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = ("name", "country", "contact_person", "is_active")
    list_filter = ("is_active", "country")
    search_fields = ("name", "legal_name", "email", "contact_person")


@admin.register(SupplierProduct)
class SupplierProductAdmin(admin.ModelAdmin):
    list_display = ("supplier", "product", "last_cost", "currency", "is_preferred")
    list_filter = ("is_preferred", "currency")
    search_fields = ("supplier__name", "product__sku", "product__name", "supplier_sku")
