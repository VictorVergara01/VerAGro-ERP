from django.contrib import admin

from .models import Invoice, InvoiceLine, Payment


class InvoiceLineInline(admin.TabularInline):
    model = InvoiceLine
    extra = 0
    readonly_fields = ("margin_amount", "total")


class PaymentInline(admin.TabularInline):
    model = Payment
    extra = 0


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = (
        "invoice_number",
        "invoice_type",
        "customer",
        "status",
        "total",
        "balance_due",
    )
    list_filter = ("status", "invoice_type")
    search_fields = ("invoice_number", "customer__name")
    readonly_fields = ("subtotal", "total", "paid_amount", "balance_due")
    inlines = (InvoiceLineInline, PaymentInline)


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ("invoice", "payment_date", "amount", "method")
    list_filter = ("method",)
    search_fields = ("invoice__invoice_number", "reference_number")
