from django.urls import path

from .views import (
    DashboardReport,
    EquipmentHistoryReport,
    LowStockReport,
    ProfitReport,
    SalesReport,
    ServiceOrdersReport,
)

urlpatterns = [
    path("reports/dashboard/", DashboardReport.as_view(), name="reports-dashboard"),
    path("reports/low-stock/", LowStockReport.as_view(), name="reports-low-stock"),
    path(
        "reports/service-orders/",
        ServiceOrdersReport.as_view(),
        name="reports-service-orders",
    ),
    path("reports/sales/", SalesReport.as_view(), name="reports-sales"),
    path("reports/profit/", ProfitReport.as_view(), name="reports-profit"),
    path(
        "reports/equipment-history/",
        EquipmentHistoryReport.as_view(),
        name="reports-equipment-history",
    ),
]
