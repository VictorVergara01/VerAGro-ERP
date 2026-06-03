from rest_framework.routers import SimpleRouter

from .views import SupplierProductViewSet, SupplierViewSet

router = SimpleRouter()
router.register(r"suppliers", SupplierViewSet, basename="supplier")
router.register(r"supplier-products", SupplierProductViewSet, basename="supplier-product")

urlpatterns = router.urls
