from django.contrib import admin

from .models import FieldJob, FieldPlot, FieldPlotProduct


@admin.register(FieldJob)
class FieldJobAdmin(admin.ModelAdmin):
    list_display = (
        "number",
        "job_type",
        "status",
        "customer",
        "scheduled_date",
        "hectares",
        "total",
    )
    list_filter = ("job_type", "status", "scheduled_date", "crop")
    search_fields = ("number", "location", "crop", "customer__name")
    readonly_fields = ("number", "total", "created_at", "updated_at")


class FieldPlotProductInline(admin.TabularInline):
    model = FieldPlotProduct
    extra = 0


@admin.register(FieldPlot)
class FieldPlotAdmin(admin.ModelAdmin):
    list_display = ("name", "customer", "hectares", "crop", "water_per_hectare", "is_active")
    list_filter = ("is_active", "crop")
    search_fields = ("name", "location", "customer__name")
    readonly_fields = ("created_at", "updated_at")
    inlines = [FieldPlotProductInline]
