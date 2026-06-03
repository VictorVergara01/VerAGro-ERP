from django.contrib import admin

from .models import Customer


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ("name", "customer_type", "identification_number", "phone", "is_active")
    list_filter = ("customer_type", "is_active")
    search_fields = ("name", "identification_number", "phone", "email")
