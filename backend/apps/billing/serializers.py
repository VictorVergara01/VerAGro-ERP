from django.db import transaction
from rest_framework import serializers

from .models import Invoice, InvoiceLine, Payment, Quote, QuoteLine
from .services import recalculate_invoice, recalculate_quote


class QuoteLineSerializer(serializers.ModelSerializer):
    product_sku = serializers.CharField(source="product.sku", read_only=True)

    class Meta:
        model = QuoteLine
        fields = (
            "id",
            "quote",
            "product",
            "product_sku",
            "description",
            "quantity",
            "unit_price",
            "discount_amount",
            "tax_amount",
            "total",
            "line_type",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "total", "created_at", "updated_at")
        extra_kwargs = {"quote": {"required": False}}


class QuoteSerializer(serializers.ModelSerializer):
    lines = QuoteLineSerializer(many=True, required=False)
    customer_name = serializers.CharField(source="customer.name", read_only=True)

    class Meta:
        model = Quote
        fields = (
            "id",
            "quote_number",
            "customer",
            "customer_name",
            "service_order",
            "status",
            "issue_date",
            "expiration_date",
            "subtotal",
            "discount_amount",
            "tax_amount",
            "total",
            "notes",
            "terms",
            "created_by",
            "lines",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "quote_number",
            "status",
            "subtotal",
            "total",
            "created_by",
            "created_at",
            "updated_at",
        )

    @transaction.atomic
    def create(self, validated_data):
        lines_data = validated_data.pop("lines", [])
        quote = Quote.objects.create(**validated_data)
        for line in lines_data:
            line.pop("quote", None)
            QuoteLine.objects.create(quote=quote, **line)
        recalculate_quote(quote)
        quote.refresh_from_db()
        return quote


class InvoiceLineSerializer(serializers.ModelSerializer):
    product_sku = serializers.CharField(source="product.sku", read_only=True)

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

    class Meta:
        model = Invoice
        fields = (
            "id",
            "invoice_number",
            "invoice_type",
            "customer",
            "customer_name",
            "service_order",
            "quote",
            "status",
            "issue_date",
            "due_date",
            "subtotal",
            "discount_amount",
            "tax_amount",
            "total",
            "paid_amount",
            "balance_due",
            "notes",
            "created_by",
            "lines",
            "payments",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "invoice_number",
            "status",
            "subtotal",
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
