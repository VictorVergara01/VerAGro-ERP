from django.contrib import admin

from .models import InventoryMovement, Product, ProductCategory


@admin.register(ProductCategory)
class ProductCategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active")
    search_fields = ("name",)


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("sku", "name", "category", "stock_quantity", "reserved_quantity", "is_active")
    list_filter = ("is_active", "category")
    search_fields = ("sku", "name", "barcode", "brand", "model")


@admin.register(InventoryMovement)
class InventoryMovementAdmin(admin.ModelAdmin):
    list_display = ("product", "movement_type", "quantity", "unit_cost", "created_at")
    list_filter = ("movement_type",)
    search_fields = ("product__sku", "product__name")
