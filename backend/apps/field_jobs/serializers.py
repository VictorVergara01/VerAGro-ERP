from rest_framework import serializers

from .models import FieldJob, FieldJobProduct, FieldPlot, FieldPlotProduct


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


class FieldPlotProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = FieldPlotProduct
        fields = ("id", "name", "dose_per_hectare", "unit")


class FieldPlotSerializer(serializers.ModelSerializer):
    products = FieldPlotProductSerializer(many=True, required=False)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    crop_display = serializers.CharField(source="get_crop_display", read_only=True)

    class Meta:
        model = FieldPlot
        fields = (
            "id",
            "customer",
            "customer_name",
            "name",
            "hectares",
            "crop",
            "crop_display",
            "crop_other",
            "location",
            "water_per_hectare",
            "notes",
            "products",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "is_active", "created_at", "updated_at")

    def validate_products(self, value):
        if len(value) > 10:
            raise serializers.ValidationError("Máximo 10 químicos por lote.")
        return value

    def validate(self, attrs):
        # En PATCH parcial attrs solo trae lo enviado; se completa con la instancia
        # para poder chequear el par (cliente, nombre) contra los lotes activos.
        customer = attrs.get(
            "customer", getattr(self.instance, "customer", None) if self.instance else None
        )
        name = attrs.get(
            "name", getattr(self.instance, "name", "") if self.instance else ""
        )
        qs = FieldPlot.objects.filter(
            customer=customer, name__iexact=name, is_active=True
        )
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                {"name": "Ya existe un lote activo con ese nombre para este cliente."}
            )
        return attrs

    def create(self, validated_data):
        products = validated_data.pop("products", [])
        plot = super().create(validated_data)
        for product in products:
            FieldPlotProduct.objects.create(plot=plot, **product)
        return plot

    def update(self, instance, validated_data):
        products = validated_data.pop("products", None)
        plot = super().update(instance, validated_data)
        if products is not None:
            plot.products.all().delete()
            for product in products:
                FieldPlotProduct.objects.create(plot=plot, **product)
        return plot
