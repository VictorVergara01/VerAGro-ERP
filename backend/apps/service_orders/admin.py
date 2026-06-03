from django.contrib import admin

from .models import ServiceOrder, ServiceOrderPart


class ServiceOrderPartInline(admin.TabularInline):
    model = ServiceOrderPart
    extra = 0
    readonly_fields = ("total_price",)


@admin.register(ServiceOrder)
class ServiceOrderAdmin(admin.ModelAdmin):
    list_display = (
        "service_order_number",
        "customer",
        "equipment",
        "service_type",
        "status",
        "total_amount",
    )
    list_filter = ("status", "service_type")
    search_fields = ("service_order_number", "customer__name", "customer_complaint")
    readonly_fields = ("total_amount",)
    inlines = (ServiceOrderPartInline,)


@admin.register(ServiceOrderPart)
class ServiceOrderPartAdmin(admin.ModelAdmin):
    list_display = ("service_order", "product", "quantity", "status", "total_price")
    list_filter = ("status",)
    search_fields = ("service_order__service_order_number", "product__sku")
