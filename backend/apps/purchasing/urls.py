from rest_framework.routers import SimpleRouter

from .views import (
    PurchaseAdditionalCostViewSet,
    PurchaseOrderLineViewSet,
    PurchaseOrderViewSet,
)

router = SimpleRouter()
router.register(r"purchase-orders", PurchaseOrderViewSet, basename="purchase-order")
router.register(
    r"purchase-order-lines", PurchaseOrderLineViewSet, basename="purchase-order-line"
)
router.register(
    r"purchase-additional-costs",
    PurchaseAdditionalCostViewSet,
    basename="purchase-additional-cost",
)

urlpatterns = router.urls
