from django.contrib import admin

from .models import FieldJob


@admin.register(FieldJob)
class FieldJobAdmin(admin.ModelAdmin):
    list_display = (
        "number",
        "job_type",
        "status",
        "customer",
        "scheduled_date",
        "hectares",
        "quintals",
        "total",
    )
    list_filter = ("job_type", "status", "scheduled_date")
    search_fields = ("number", "location", "crop", "customer__name", "applied_product")
    readonly_fields = ("number", "total", "created_at", "updated_at")
