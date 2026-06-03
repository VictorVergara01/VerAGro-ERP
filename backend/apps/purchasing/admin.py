from django.contrib import admin

from .models import PurchaseAdditionalCost, PurchaseOrder, PurchaseOrderLine


class PurchaseOrderLineInline(admin.TabularInline):
    model = PurchaseOrderLine
    extra = 0
    readonly_fields = (
        "line_subtotal",
        "allocated_extra_cost",
        "landed_unit_cost",
        "calculated_sale_price",
        "quantity_received",
    )


class PurchaseAdditionalCostInline(admin.TabularInline):
    model = PurchaseAdditionalCost
    extra = 0


@admin.register(PurchaseOrder)
class PurchaseOrderAdmin(admin.ModelAdmin):
    list_display = (
        "order_number",
        "supplier",
        "status",
        "order_date",
        "grand_total",
        "currency",
    )
    list_filter = ("status", "currency")
    search_fields = ("order_number", "supplier__name", "notes")
    readonly_fields = (
        "subtotal_products",
        "additional_costs_total",
        "grand_total",
    )
    inlines = (PurchaseOrderLineInline, PurchaseAdditionalCostInline)


@admin.register(PurchaseOrderLine)
class PurchaseOrderLineAdmin(admin.ModelAdmin):
    list_display = (
        "purchase_order",
        "product",
        "quantity_ordered",
        "quantity_received",
        "landed_unit_cost",
    )
    search_fields = ("purchase_order__order_number", "product__sku", "product__name")


@admin.register(PurchaseAdditionalCost)
class PurchaseAdditionalCostAdmin(admin.ModelAdmin):
    list_display = ("purchase_order", "name", "amount", "allocation_method")
    search_fields = ("purchase_order__order_number", "name")
