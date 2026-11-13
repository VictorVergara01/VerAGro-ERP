from rest_framework.routers import SimpleRouter

from .views import (
    InvoiceLineViewSet,
    InvoiceViewSet,
)

router = SimpleRouter()
router.register(r"invoices", InvoiceViewSet, basename="invoice")
router.register(r"invoice-lines", InvoiceLineViewSet, basename="invoice-line")

urlpatterns = router.urls
