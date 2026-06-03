from django.urls import path
from rest_framework.routers import SimpleRouter

from .views import (
    AdjustmentCreateView,
    CategoryViewSet,
    LowStockListView,
    ProductViewSet,
)

router = SimpleRouter()
router.register(r"inventory/products", ProductViewSet, basename="product")
router.register(r"inventory/categories", CategoryViewSet, basename="product-category")

urlpatterns = [
    path("inventory/adjustments/", AdjustmentCreateView.as_view(), name="inventory-adjustment"),
    path("inventory/low-stock/", LowStockListView.as_view(), name="inventory-low-stock"),
] + router.urls
