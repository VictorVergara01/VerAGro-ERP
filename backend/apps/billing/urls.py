from rest_framework.routers import SimpleRouter

from .views import (
    InvoiceLineViewSet,
    InvoiceViewSet,
    QuoteLineViewSet,
    QuoteViewSet,
)

router = SimpleRouter()
router.register(r"quotes", QuoteViewSet, basename="quote")
router.register(r"quote-lines", QuoteLineViewSet, basename="quote-line")
router.register(r"invoices", InvoiceViewSet, basename="invoice")
router.register(r"invoice-lines", InvoiceLineViewSet, basename="invoice-line")

urlpatterns = router.urls
