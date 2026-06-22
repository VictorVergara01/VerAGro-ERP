from rest_framework import serializers

from .models import FieldJob, FieldJobProduct


class FieldJobProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = FieldJobProduct
        fields = ("id", "name", "dose_per_hectare", "unit")


class FieldJobSerializer(serializers.ModelSerializer):
    products = FieldJobProductSerializer(many=True, required=False)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    equipment_name = serializers.CharField(
        source="equipment.name", read_only=True, default=""
    )
    technician_name = serializers.CharField(
        source="technician.full_name", read_only=True, default=""
    )
    job_type_display = serializers.CharField(
        source="get_job_type_display", read_only=True
    )
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    crop_display = serializers.CharField(source="get_crop_display", read_only=True)
    invoice_number = serializers.SerializerMethodField()

    def get_invoice_number(self, obj):
        invoice = next(
            (inv for inv in obj.invoices.all() if inv.status != "cancelled"),
            None,
        )
        return invoice.invoice_number if invoice else None

    def validate_products(self, value):
        if len(value) > 10:
            raise serializers.ValidationError("Máximo 10 químicos por trabajo.")
        return value

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
            "crop_display",
            "crop_other",
            "products",
            "hectares",
            "unit_price",
            "total",
            "tank_volume_liters",
            "water_per_hectare",
            "notes",
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

    def create(self, validated_data):
        products = validated_data.pop("products", [])
        job = super().create(validated_data)
        for product in products:
            FieldJobProduct.objects.create(field_job=job, **product)
        return job

    def update(self, instance, validated_data):
        products = validated_data.pop("products", None)
        job = super().update(instance, validated_data)
        if products is not None:
            job.products.all().delete()
            for product in products:
                FieldJobProduct.objects.create(field_job=job, **product)
        return job
