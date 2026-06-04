from rest_framework.routers import SimpleRouter

from .views import (
    ServiceOrderPartViewSet,
    ServiceOrderPhotoViewSet,
    ServiceOrderViewSet,
)

router = SimpleRouter()
router.register(r"service-orders", ServiceOrderViewSet, basename="service-order")
router.register(
    r"service-order-parts", ServiceOrderPartViewSet, basename="service-order-part"
)
router.register(
    r"service-order-photos", ServiceOrderPhotoViewSet, basename="service-order-photo"
)

urlpatterns = router.urls
