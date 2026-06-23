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
        "total",
    )
    list_filter = ("job_type", "status", "scheduled_date", "crop")
    search_fields = ("number", "location", "crop", "customer__name")
    readonly_fields = ("number", "total", "created_at", "updated_at")
