from django.db import transaction
from rest_framework import serializers

from apps.inventory.price_range import PriceFloorMixin

from .models import Invoice, InvoiceLine, Payment
from .services import recalculate_invoice


class InvoiceLineSerializer(PriceFloorMixin, serializers.ModelSerializer):
    product_sku = serializers.CharField(source="product.sku", read_only=True)

    def validate(self, attrs):
        invoice = attrs.get('invoice', getattr(self.instance, 'invoice', None))
        old = getattr(self.instance, 'invoice', None)
        if (invoice and invoice.field_job_id) or (old and old.field_job_id):
            raise serializers.ValidationError('Los importes de campo se conservan según el cierre del trabajo.')
        return super().validate(attrs)

    class Meta:
        model = InvoiceLine
        fields = (
            "id",
            "invoice",
            "product",
            "product_sku",
            "description",
            "quantity",
            "unit_price",
            "price_floor",
            "below_min_price",
            "unit_cost",
            "margin_amount",
            "discount_amount",
            "tax_amount",
            "total",
            "line_type",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "margin_amount",
            "total",
            "created_at",
            "updated_at",
        )
        extra_kwargs = {"invoice": {"required": False}}


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = (
            "id",
            "invoice",
            "payment_date",
            "amount",
            "method",
            "reference_number",
            "notes",
            "created_by",
            "created_at",
        )
        read_only_fields = ("id", "invoice", "created_by", "created_at")


class InvoiceSerializer(serializers.ModelSerializer):
    lines = InvoiceLineSerializer(many=True, required=False)
    payments = PaymentSerializer(many=True, read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    customer_phone = serializers.CharField(source="customer.phone", read_only=True)
    customer_whatsapp = serializers.CharField(
        source="customer.whatsapp", read_only=True
    )
    fiscal = serializers.SerializerMethodField()

    def validate(self, attrs):
        if self.instance and self.instance.field_job_id:
            if set(attrs) - {'notes', 'issue_date', 'due_date'}:
                raise serializers.ValidationError('La factura de campo conserva cliente e importes del trabajo realizado.')
            due = attrs.get('due_date')
            if due and self.instance.field_job.done_date and due < self.instance.field_job.done_date:
                raise serializers.ValidationError({'due_date': 'El vencimiento no puede ser anterior al trabajo.'})
        elif not self.instance and attrs.get('invoice_type') == Invoice.InvoiceType.FIELD_JOB:
            raise serializers.ValidationError('Genera la factura desde el trabajo de campo.')
        return attrs

    def get_fiscal(self, obj):
        doc = getattr(obj, "fiscal", None)
        if not doc:
            return None
        return {
            "cufe": doc.cufe,
            "status": doc.fiscal_status,
            "status_display": doc.get_fiscal_status_display(),
            "protocol": doc.protocol,
            "environment": doc.environment,
            "issued_at": doc.issued_at,
        }

    class Meta:
        model = Invoice
        fields = (
            "id",
            "invoice_number",
            "invoice_type",
            "customer",
            "customer_name",
            "customer_phone",
            "customer_whatsapp",
            "service_order",
            "field_job",
            "status",
            "issue_date",
            "due_date",
            "subtotal",
            "discount_percentage",
            "tax_percentage",
            "discount_amount",
            "tax_amount",
            "total",
            "paid_amount",
            "balance_due",
            "notes",
            "created_by",
            "lines",
            "payments",
            "fiscal",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "field_job",
            "id",
            "invoice_number",
            "status",
            "subtotal",
            "discount_amount",
            "tax_amount",
            "total",
            "paid_amount",
            "balance_due",
            "created_by",
            "created_at",
            "updated_at",
        )

    @transaction.atomic
    def create(self, validated_data):
        lines_data = validated_data.pop("lines", [])
        invoice = Invoice.objects.create(**validated_data)
        for line in lines_data:
            line.pop("invoice", None)
            InvoiceLine.objects.create(invoice=invoice, **line)
        recalculate_invoice(invoice)
        invoice.refresh_from_db()
        return invoice

    @transaction.atomic
    def update(self, instance, validated_data):
        if instance.field_job_id:
            from apps.field_jobs.models import FieldJob
            job = FieldJob.objects.select_for_update().get(pk=instance.field_job_id)
            instance = Invoice.objects.select_for_update().get(pk=instance.pk)
            if instance.status != Invoice.Status.DRAFT:
                raise serializers.ValidationError('Solo se edita una factura en borrador.')
            if 'due_date' in validated_data:
                job.due_date = validated_data['due_date']
                job.save(update_fields=['due_date', 'updated_at'])
        # Si vienen líneas, se reemplazan por completo (factura editable solo en
        # borrador; estrategia simple sin reconciliación por id).
        lines_data = validated_data.pop("lines", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if lines_data is not None:
            instance.lines.all().delete()
            for line in lines_data:
                line.pop("invoice", None)
                InvoiceLine.objects.create(invoice=instance, **line)
        recalculate_invoice(instance)
        instance.refresh_from_db()
        return instance


class InvoiceSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Invoice
        fields = (
            "id",
            "invoice_number",
            "invoice_type",
            "status",
            "issue_date",
            "total",
            "balance_due",
        )
