from rest_framework import serializers

from .models import FieldJob


class FieldJobSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    equipment_name = serializers.CharField(source="equipment.name", read_only=True, default="")
    technician_name = serializers.CharField(
        source="technician.full_name", read_only=True, default=""
    )
    job_type_display = serializers.CharField(source="get_job_type_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    application_rate_unit_display = serializers.CharField(
        source="get_application_rate_unit_display", read_only=True, default=""
    )
    invoice_number = serializers.SerializerMethodField()

    def get_invoice_number(self, obj):
        # Número de la factura activa (no cancelada) del trabajo, si existe.
        invoice = next(
            (inv for inv in obj.invoices.all() if inv.status != "cancelled"),
            None,
        )
        return invoice.invoice_number if invoice else None

    class Meta:
        model = FieldJob
        fields = (
            "id",
            "number",
            "job_type",
            "job_type_display",
            "status",
            "status_display",
            "customer",
            "customer_name",
            "equipment",
            "equipment_name",
            "technician",
            "technician_name",
            "scheduled_date",
            "done_date",
            "location",
            "crop",
            "applied_product",
            "hectares",
            "quintals",
            "unit_price",
            "total",
            "notes",
            "application_rate",
            "application_rate_unit",
            "application_rate_unit_display",
            "tank_volume_liters",
            "water_per_hectare",
            "latitude",
            "longitude",
            "wind_speed_kmh",
            "temperature_celsius",
            "humidity_percentage",
            "weather_notes",
            "invoice_number",
            "created_by",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "number",
            "status",
            "done_date",
            "total",
            "created_by",
            "created_at",
            "updated_at",
        )
