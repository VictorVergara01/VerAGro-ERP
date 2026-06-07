from datetime import date

from django.db.models import Count, DecimalField, F, Sum
from django.db.models.functions import Coalesce, TruncMonth
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.billing.models import Invoice, InvoiceLine
from apps.core import roles
from apps.core.permissions import role_required
from apps.inventory.models import Product
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


class SalesReport(APIView):
    permission_classes = [Financial]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        date_from, date_to = _date_range(request)
        invoices = _apply_range(
            Invoice.objects.filter(status__in=SALES_STATUSES),
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
            Invoice.objects.filter(
                status__in=(Invoice.Status.ISSUED, Invoice.Status.PARTIALLY_PAID)
            )
            .values("invoice_number", "customer__name", "total", "balance_due", "status")
        )
        return Response({"sales_by_month": by_month, "pending_invoices": pending})


class ProfitReport(APIView):
    permission_classes = [Financial]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        date_from, date_to = _date_range(request)
        invoices = _apply_range(
            Invoice.objects.filter(status__in=SALES_STATUSES),
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
