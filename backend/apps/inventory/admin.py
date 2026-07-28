from django.contrib import admin

from .models import InventoryMovement, Product, ProductCategory, ProductCompatibility


@admin.register(ProductCategory)
class ProductCategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active")
    search_fields = ("name",)


class ProductCompatibilityInline(admin.TabularInline):
    model = ProductCompatibility
    fields = ("equipment_model", "component", "is_primary", "notes")
    extra = 0


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("sku", "name", "category", "stock_quantity", "reserved_quantity", "is_active")
    list_filter = ("is_active", "category")
    search_fields = ("sku", "name", "barcode", "brand", "model")
    inlines = [ProductCompatibilityInline]


@admin.register(InventoryMovement)
class InventoryMovementAdmin(admin.ModelAdmin):
    list_display = ("product", "movement_type", "quantity", "unit_cost", "created_at")
    list_filter = ("movement_type",)
    search_fields = ("product__sku", "product__name")


@admin.register(ProductCompatibility)
class ProductCompatibilityAdmin(admin.ModelAdmin):
    list_display = ("product", "equipment_model", "component", "is_primary")
    list_filter = ("equipment_model", "is_primary")
    search_fields = ("product__sku", "product__name")
