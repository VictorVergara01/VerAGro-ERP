from rest_framework.routers import SimpleRouter

from .views import FieldJobViewSet, FieldPlotViewSet

router = SimpleRouter()
router.register(r"field-jobs", FieldJobViewSet, basename="field-job")
router.register(r"field-plots", FieldPlotViewSet, basename="field-plot")

urlpatterns = router.urls
