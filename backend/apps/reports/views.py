from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from django.db.models import Count, DecimalField, F, Q, Sum
from django.db.models.functions import Coalesce, TruncMonth
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.billing.models import Invoice, InvoiceLine, Payment
from apps.core import roles
from apps.core.permissions import role_required
from apps.inventory.models import Product
from apps.field_jobs.models import FieldJob
from apps.field_jobs.models import PilotEarning, AssistantDay, FieldExpense, FieldPayment, FieldCollection
from apps.purchasing.models import PurchaseOrder
from apps.service_orders.models import ServiceOrder, ServiceOrderPart

Financial = role_required(*roles.FINANCIAL_READ)

PENDING_STATUSES = (
    ServiceOrder.Status.RECEIVED,
    ServiceOrder.Status.IN_DIAGNOSTIC,
    ServiceOrder.Status.QUOTED,
    ServiceOrder.Status.APPROVED,
    ServiceOrder.Status.IN_PROGRESS,
)
SALES_STATUSES = (
    Invoice.Status.ISSUED,
    Invoice.Status.PARTIALLY_PAID,
    Invoice.Status.PAID,
)
DECIMAL = DecimalField(max_digits=18, decimal_places=2)
FIELD_INVOICE = Q(invoice_type=Invoice.InvoiceType.FIELD_JOB) | Q(field_job__isnull=False)
REPORT_PARAMETERS = [
    OpenApiParameter("from", OpenApiTypes.DATE),
    OpenApiParameter("to", OpenApiTypes.DATE),
    OpenApiParameter("segment", OpenApiTypes.STR, enum=["workshop", "field"], default="workshop"),
]


def _segment_invoices(qs, request):
    segment = request.query_params.get("segment", "workshop")
    if segment == "field":
        return qs.filter(FIELD_INVOICE)
    if segment == "workshop":
        return qs.exclude(FIELD_INVOICE)
    raise ValidationError({"segment": "Usa workshop o field."})


def _parse_date(value, field):
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        raise ValidationError({field: "Fecha inválida (use YYYY-MM-DD)."})


def _date_range(request):
    return (
        _parse_date(request.query_params.get("from"), "from"),
        _parse_date(request.query_params.get("to"), "to"),
    )


def _apply_range(qs, field, date_from, date_to):
    if date_from:
        qs = qs.filter(**{f"{field}__gte": date_from})
    if date_to:
        qs = qs.filter(**{f"{field}__lte": date_to})
    return qs


def _inventory_value():
    return Product.objects.filter(is_active=True).aggregate(
        value=Coalesce(
            Sum(F("stock_quantity") * F("average_cost"), output_field=DECIMAL),
            0,
            output_field=DECIMAL,
        )
    )["value"]


def _low_stock_qs():
    return (
        Product.objects.filter(is_active=True, minimum_stock__gt=0)
        .annotate(available=F("stock_quantity") - F("reserved_quantity"))
        .filter(available__lte=F("minimum_stock"))
    )


def _status_counts():
    rows = ServiceOrder.objects.values("status").annotate(count=Count("id"))
    return {row["status"]: row["count"] for row in rows}


def _top_customers(limit=10):
    return list(
        ServiceOrder.objects.values("customer", "customer__name")
        .annotate(count=Count("id"))
        .order_by("-count")[:limit]
    )


def _top_failing_equipment(limit=10):
    return list(
        ServiceOrder.objects.filter(equipment__isnull=False)
        .values("equipment", "equipment__name")
        .annotate(count=Count("id"))
        .order_by("-count")[:limit]
    )


class DashboardReport(APIView):
    permission_classes = [Financial]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        today = timezone.localdate()
        month_start = today.replace(day=1)
        sales_month = (
            Invoice.objects.filter(
                status__in=SALES_STATUSES, issue_date__gte=month_start
            ).aggregate(
                total=Coalesce(Sum("total", output_field=DECIMAL), 0, output_field=DECIMAL)
            )["total"]
        )
        pending = Invoice.objects.filter(
            status__in=(Invoice.Status.ISSUED, Invoice.Status.PARTIALLY_PAID)
        ).aggregate(
            count=Count("id"),
            amount=Coalesce(Sum("balance_due", output_field=DECIMAL), 0, output_field=DECIMAL),
        )
        purchases = list(
            PurchaseOrder.objects.exclude(status=PurchaseOrder.Status.CANCELLED)
            .values("supplier", "supplier__name")
            .annotate(total=Sum("grand_total"), count=Count("id"))
            .order_by("-total")[:5]
        )
        return Response(
            {
                "inventory": {
                    "total_products": Product.objects.filter(is_active=True).count(),
                    "total_stock_value": _inventory_value(),
                    "low_stock_count": _low_stock_qs().count(),
                },
                "service_orders_by_status": _status_counts(),
                "invoices": {
                    "pending_count": pending["count"],
                    "pending_amount": pending["amount"],
                    "sales_this_month": sales_month,
                },
                "top_customers": _top_customers(5),
                "top_failing_equipment": _top_failing_equipment(5),
                "purchases_by_supplier": purchases,
            }
        )


class LowStockReport(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        low = _low_stock_qs().values(
            "id",
            "sku",
            "name",
            "stock_quantity",
            "reserved_quantity",
            "minimum_stock",
        )
        items = []
        for p in low:
            p["available_quantity"] = p["stock_quantity"] - p["reserved_quantity"]
            items.append(p)
        return Response(
            {
                "summary": {
                    "total_products": Product.objects.filter(is_active=True).count(),
                    "total_stock_value": _inventory_value(),
                },
                "low_stock": items,
            }
        )


class ServiceOrdersReport(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        date_from, date_to = _date_range(request)
        orders = _apply_range(ServiceOrder.objects.all(), "received_date", date_from, date_to)

        by_status = {
            row["status"]: row["count"]
            for row in orders.values("status").annotate(count=Count("id"))
        }
        finished_by_tech = list(
            orders.filter(
                status__in=(
                    ServiceOrder.Status.FINISHED,
                    ServiceOrder.Status.INVOICED,
                    ServiceOrder.Status.DELIVERED,
                )
            )
            .values("technician", "technician__full_name")
            .annotate(count=Count("id"))
            .order_by("-count")
        )
        most_used = list(
            ServiceOrderPart.objects.filter(
                status=ServiceOrderPart.Status.USED, service_order__in=orders
            )
            .values("product", "product__sku", "product__name")
            .annotate(total_quantity=Sum("quantity"))
            .order_by("-total_quantity")[:10]
        )
        return Response(
            {
                "by_status": by_status,
                "pending": orders.filter(status__in=PENDING_STATUSES).count(),
                "waiting_parts": orders.filter(
                    status=ServiceOrder.Status.WAITING_PARTS
                ).count(),
                "finished_by_technician": finished_by_tech,
                "most_used_parts": most_used,
                "top_customers": _top_customers(10),
                "top_failing_equipment": _top_failing_equipment(10),
            }
        )


class FieldJobsReport(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=OpenApiTypes.OBJECT, parameters=REPORT_PARAMETERS[:2])
    def get(self, request):
        date_from, date_to = _date_range(request)
        scheduled = _apply_range(FieldJob.objects.exclude(status=FieldJob.Status.CANCELLED), "scheduled_date", date_from, date_to)
        completed = _apply_range(
            FieldJob.objects.filter(status__in=(FieldJob.Status.DONE, FieldJob.Status.INVOICED)),
            "done_date", date_from, date_to,
        )
        by_type = list(completed.values("job_type").annotate(
            count=Count("id"),
            hectares=Coalesce(Sum("actual_hectares"), 0, output_field=DECIMAL),
            quintals=Coalesce(Sum("applied_quintals"), 0, output_field=DECIMAL),
        ).order_by("job_type"))
        return Response({
            "scheduled_count": scheduled.count(),
            "completed_count": completed.count(),
            "actual_hectares": sum((row["hectares"] for row in by_type), Decimal("0")),
            "applied_quintals": sum((row["quintals"] for row in by_type), Decimal("0")),
            "by_type": by_type,
        })


class FieldFinanceReport(APIView):
    permission_classes = [Financial]

    @extend_schema(responses=OpenApiTypes.OBJECT, parameters=REPORT_PARAMETERS[:2])
    def get(self, request):
        date_from, date_to = _date_range(request)

        def period(qs, field):
            return _apply_range(qs, field, date_from, date_to)

        def total(qs, field="amount"):
            return qs.aggregate(value=Coalesce(Sum(field), 0, output_field=DECIMAL))["value"]

        pilots = period(PilotEarning.objects.all(), "earned_date")
        assistants = period(AssistantDay.objects.all(), "date")
        expenses = period(FieldExpense.objects.all(), "date")
        from apps.field_jobs.collections import accounts_queryset, account_row
        jobs = list(period(accounts_queryset().select_related('pilot_earning'), 'done_date'))
        invoices = period(Invoice.objects.filter(invoice_type=Invoice.InvoiceType.FIELD_JOB, field_job__isnull=True, status__in=SALES_STATUSES), "issue_date")
        pilot_cost, assistant_cost, general_cost = total(pilots), total(assistants), total(expenses)
        revenue = sum((job.total for job in jobs), Decimal('0')) + total(invoices, "total")
        paid = total(period(FieldPayment.objects.all(), "payment_date")) + total(period(FieldExpense.objects.filter(payment_date__isnull=False), "payment_date"))
        collected = total(period(FieldCollection.objects.all(), 'payment_date')) + total(period(Payment.objects.filter(
            invoice__invoice_type=Invoice.InvoiceType.FIELD_JOB, invoice__field_job__isnull=True,
            invoice__status__in=SALES_STATUSES,
        ), "payment_date"))
        missing = period(FieldJob.objects.filter(status__in=("done", "invoiced"), pilot_earning__isnull=True), "done_date")
        by_customer, by_pilot, by_month = {}, {}, {}
        for job in jobs:
            row = account_row(job)
            earning = getattr(job, 'pilot_earning', None)
            pilot_cost_for_job = earning.amount if earning else Decimal('0')
            for groups, key, name in ((by_customer, job.customer_id, job.customer.name), (by_pilot, job.pilot_id, row['pilot_name']), (by_month, job.done_date.strftime('%Y-%m') if job.done_date else 'Sin fecha', '')):
                item = groups.setdefault(key, {'id': key, 'name': name, 'count': 0, 'hectares': Decimal('0'), 'quintals': Decimal('0'), 'revenue': Decimal('0'), 'collected': Decimal('0'), 'balance_due': Decimal('0'), 'pilot_cost': Decimal('0'), 'margin_before_general_costs': Decimal('0'), 'unpriced_count': 0})
                item['count'] += 1
                item['hectares'] += job.actual_hectares or Decimal('0')
                item['quintals'] += job.applied_quintals or Decimal('0')
                item['revenue'] += job.total
                item['collected'] += job.collected
                item['balance_due'] += row['balance_due']
                item['pilot_cost'] += pilot_cost_for_job
                item['margin_before_general_costs'] += job.total - pilot_cost_for_job
                item['unpriced_count'] += int(earning is None)
        return Response({
            "revenue": revenue, "pilot_cost": pilot_cost, "assistant_cost": assistant_cost,
            "general_cost": general_cost, "total_cost": pilot_cost + assistant_cost + general_cost,
            "operating_result": revenue - pilot_cost - assistant_cost - general_cost,
            "paid_in_period": paid,
            "collected_in_period": collected,
            'cash_flow_in_period': collected - paid,
            "pending_cost": total(pilots.filter(payment__isnull=True)) + total(assistants.filter(payment__isnull=True)) + total(expenses.filter(payment_date__isnull=True)),
            "receivable": sum((max(job.balance, Decimal('0')) for job in jobs), Decimal('0')) + total(invoices, "balance_due"),
            'by_customer': sorted(by_customer.values(), key=lambda row: row['revenue'], reverse=True),
            'by_pilot': sorted(by_pilot.values(), key=lambda row: row['revenue'], reverse=True),
            'by_month': [by_month[key] for key in sorted(by_month)],
            'unlinked_invoice_count': invoices.count(),
            "unpriced_jobs": list(missing.values("id", "number", "pilot_id", "pilot__name", "actual_hectares", "done_date")),
            "expenses_by_category": list(expenses.values("category").annotate(total=Sum("amount")).order_by("category")),
        })


class SalesReport(APIView):
    permission_classes = [Financial]

    @extend_schema(responses=OpenApiTypes.OBJECT, parameters=REPORT_PARAMETERS)
    def get(self, request):
        date_from, date_to = _date_range(request)
        invoices = _apply_range(
            _segment_invoices(Invoice.objects.filter(status__in=SALES_STATUSES), request),
            "issue_date",
            date_from,
            date_to,
        )
        by_month = [
            {
                "month": row["month"].strftime("%Y-%m"),
                "total": row["total"],
                "count": row["count"],
            }
            for row in invoices.annotate(month=TruncMonth("issue_date"))
            .values("month")
            .annotate(
                total=Coalesce(Sum("total", output_field=DECIMAL), 0, output_field=DECIMAL),
                count=Count("id"),
            )
            .order_by("month")
        ]
        pending = list(
            _apply_range(_segment_invoices(Invoice.objects.filter(
                status__in=(Invoice.Status.ISSUED, Invoice.Status.PARTIALLY_PAID)
            ), request), "issue_date", date_from, date_to)
            .values("invoice_number", "customer__name", "total", "balance_due", "status")
        )
        return Response({"sales_by_month": by_month, "pending_invoices": pending})


class ProfitReport(APIView):
    permission_classes = [Financial]

    @extend_schema(responses=OpenApiTypes.OBJECT, parameters=REPORT_PARAMETERS)
    def get(self, request):
        date_from, date_to = _date_range(request)
        invoices = _apply_range(
            _segment_invoices(Invoice.objects.filter(status__in=SALES_STATUSES), request),
            "issue_date",
            date_from,
            date_to,
        ).annotate(
            cost=Coalesce(
                Sum(F("lines__unit_cost") * F("lines__quantity"), output_field=DECIMAL),
                0,
                output_field=DECIMAL,
            ),
            margin=Coalesce(
                Sum("lines__margin_amount", output_field=DECIMAL), 0, output_field=DECIMAL
            ),
        )
        by_invoice = [
            {
                "invoice_number": inv.invoice_number,
                "revenue": inv.total,
                "cost": inv.cost,
                "margin": inv.margin,
            }
            for inv in invoices
        ]
        by_part = list(
            InvoiceLine.objects.filter(
                product__isnull=False, invoice__in=invoices.values("id")
            )
            .values("product", "product__sku", "product__name")
            .annotate(
                total_quantity=Sum("quantity"),
                total_margin=Coalesce(
                    Sum("margin_amount", output_field=DECIMAL), 0, output_field=DECIMAL
                ),
            )
            .order_by("-total_margin")
        )
        totals = {
            "revenue": sum((row["revenue"] for row in by_invoice), 0),
            "cost": sum((row["cost"] for row in by_invoice), 0),
            "margin": sum((row["margin"] for row in by_invoice), 0),
        }
        return Response(
            {"by_invoice": by_invoice, "by_part": by_part, "totals": totals}
        )


class EquipmentHistoryReport(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        from apps.equipment.models import Equipment

        equipment_id = request.query_params.get("equipment")
        if not equipment_id:
            raise ValidationError({"equipment": "Parámetro requerido."})
        try:
            equipment = Equipment.objects.get(pk=int(equipment_id))
        except (TypeError, ValueError):
            raise ValidationError({"equipment": "Debe ser un id numérico."})
        except Equipment.DoesNotExist:
            raise NotFound("Equipo no encontrado.")

        orders = list(
            equipment.service_orders.values(
                "service_order_number",
                "status",
                "service_type",
                "received_date",
                "finished_date",
                "total_amount",
            )
        )
        return Response(
            {
                "equipment": {
                    "id": equipment.id,
                    "name": equipment.name,
                    "serial_number": equipment.serial_number,
                },
                "service_orders": orders,
            }
        )


class BelowFloorSaleItemSerializer(serializers.Serializer):
    """Una línea vendida bajo el piso de precio vigente del producto."""

    document = serializers.CharField()
    document_type = serializers.ChoiceField(choices=["invoice", "service_order"])
    date = serializers.CharField(allow_null=True)
    created_by = serializers.CharField(allow_null=True)
    product_id = serializers.IntegerField()
    product_sku = serializers.CharField()
    product_name = serializers.CharField()
    quantity = serializers.CharField()
    unit_price = serializers.CharField()
    price_floor = serializers.CharField()
    difference = serializers.CharField()
    difference_percentage = serializers.CharField()


class BelowFloorSalesResponseSerializer(serializers.Serializer):
    items = BelowFloorSaleItemSerializer(many=True)
    count = serializers.IntegerField()


class BelowFloorSalesReport(APIView):
    """Líneas vendidas por debajo del piso de precio vigente del producto.

    Los borradores quedan fuera porque aún no representan ventas confirmadas.
    """

    permission_classes = [Financial]

    @extend_schema(responses=BelowFloorSalesResponseSerializer)
    def get(self, request):
        date_from, date_to = _date_range(request)

        lines = _apply_range(
            InvoiceLine.objects.filter(
                product__isnull=False,
                product__min_sale_price__gt=0,
                unit_price__lt=F("product__min_sale_price"),
                # Solo facturas que representan una venta real: fuera los
                # borradores (propuestas pendientes de aceptación) y las
                # anuladas (ventas que no ocurrieron).
                invoice__status__in=SALES_STATUSES,
            ).exclude(Q(invoice__invoice_type=Invoice.InvoiceType.FIELD_JOB) | Q(invoice__field_job__isnull=False))
            .select_related("product", "invoice", "invoice__created_by"),
            "invoice__issue_date",
            date_from,
            date_to,
        )

        parts = _apply_range(
            ServiceOrderPart.objects.filter(
                product__min_sale_price__gt=0,
                unit_price__lt=F("product__min_sale_price"),
                # Solo piezas efectivamente consumidas (no reservadas, ni
                # pendientes de compra, ni devueltas) en órdenes que no se
                # cancelaron.
                status=ServiceOrderPart.Status.USED,
            )
            .exclude(service_order__status=ServiceOrder.Status.CANCELLED)
            .select_related("product", "service_order", "service_order__created_by"),
            "service_order__received_date",
            date_from,
            date_to,
        )

        items = [
            _below_floor_row(
                document=line.invoice.invoice_number,
                document_type="invoice",
                date=line.invoice.issue_date,
                created_by=line.invoice.created_by,
                product=line.product,
                unit_price=line.unit_price,
                quantity=line.quantity,
            )
            for line in lines
        ] + [
            _below_floor_row(
                document=part.service_order.service_order_number,
                document_type="service_order",
                date=part.service_order.received_date,
                created_by=part.service_order.created_by,
                product=part.product,
                unit_price=part.unit_price,
                quantity=part.quantity,
            )
            for part in parts
        ]
        items.sort(key=lambda row: (row["date"] or ""), reverse=True)
        return Response({"items": items, "count": len(items)})


def _below_floor_row(*, document, document_type, date, created_by, product, unit_price, quantity):
    floor = product.min_sale_price
    difference = floor - unit_price
    percentage = (difference / floor * 100) if floor else Decimal("0")
    return {
        "document": document,
        "document_type": document_type,
        "date": date.isoformat() if date else None,
        "created_by": getattr(created_by, "full_name", None),
        "product_id": product.id,
        "product_sku": product.sku,
        "product_name": product.name,
        "quantity": str(quantity),
        "unit_price": str(unit_price),
        "price_floor": str(floor),
        "difference": str(difference.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
        "difference_percentage": str(
            percentage.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        ),
    }
