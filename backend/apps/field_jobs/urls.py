from rest_framework.routers import SimpleRouter

from .views import FieldJobViewSet, FieldPlotViewSet
from .finance import FieldPilotViewSet, RateViewSet, AssistantViewSet, EarningViewSet, DayViewSet, ExpenseViewSet, PaymentViewSet
from .collections import FieldAccountViewSet

router = SimpleRouter()
router.register(r"field-jobs", FieldJobViewSet, basename="field-job")
router.register(r"field-plots", FieldPlotViewSet, basename="field-plot")
router.register(r"field-pilot-rates", RateViewSet, basename="field-pilot-rate")
router.register(r"field-pilots", FieldPilotViewSet, basename="field-pilot")
router.register(r"field-accounts", FieldAccountViewSet, basename="field-account")
router.register(r"field-assistants", AssistantViewSet, basename="field-assistant")
router.register(r"field-pilot-earnings", EarningViewSet, basename="field-pilot-earning")
router.register(r"field-assistant-days", DayViewSet, basename="field-assistant-day")
router.register(r"field-expenses", ExpenseViewSet, basename="field-expense")
router.register(r"field-payments", PaymentViewSet, basename="field-payment")

urlpatterns = router.urls
