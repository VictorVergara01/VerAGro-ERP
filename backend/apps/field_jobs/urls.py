from rest_framework.routers import SimpleRouter

from .views import FieldJobViewSet

router = SimpleRouter()
router.register(r"field-jobs", FieldJobViewSet, basename="field-job")

urlpatterns = router.urls
