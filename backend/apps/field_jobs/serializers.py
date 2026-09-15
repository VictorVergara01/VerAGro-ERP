from rest_framework import serializers

from .models import FieldJob, FieldJobProduct, FieldPlot, FieldPlotProduct


class FieldJobProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = FieldJobProduct
        fields = ("id", "name", "dose_per_hectare", "unit")


class FieldJobSerializer(serializers.ModelSerializer):
    products = FieldJobProductSerializer(many=True, required=False)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    plot = serializers.PrimaryKeyRelatedField(
        queryset=FieldPlot.objects.all(),
        required=False,
        allow_null=True,
    )
    plot_name = serializers.CharField(source="plot.name", read_only=True, default="")
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

    def validate(self, attrs):
        # El lote es un enlace informativo: debe ser del mismo cliente del trabajo.
        # En PATCH parcial, cliente y lote se resuelven contra la instancia.
        plot = attrs.get("plot", getattr(self.instance, "plot", None))
        customer = attrs.get("customer", getattr(self.instance, "customer", None))
        if plot is not None and customer is not None and plot.customer_id != customer.id:
            raise serializers.ValidationError(
                {"plot": "El lote no pertenece al cliente del trabajo."}
            )
        # Desactivar un lote no debe congelar los trabajos que ya lo referencian:
        # solo se rechaza un lote inactivo cuando el pedido intenta enlazarlo de nuevo
        # (crear, o cambiar el lote de un trabajo existente), no cuando el trabajo
        # simplemente re-envía el lote que ya tenía.
        previous_plot = getattr(self.instance, "plot", None) if self.instance else None
        if plot is not None and plot != previous_plot and not plot.is_active:
            raise serializers.ValidationError(
                {"plot": "No se puede enlazar un lote desactivado."}
            )
        return attrs

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
            "plot",
            "plot_name",
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
        # Sin esto, DRF auto-genera un UniqueTogetherValidator (customer, name) a partir
        # del UniqueConstraint condicional del modelo: hace match exacto por case-sensitivity
        # y dispara antes que validate() de abajo, tapando su mensaje con uno genérico bajo
        # non_field_errors. validate() ya cubre esta regla mejor (case-insensitive, solo
        # activos, excluye la instancia en edición), así que es la única fuente de verdad.
        validators = []

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
