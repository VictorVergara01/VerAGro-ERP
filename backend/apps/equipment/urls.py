from rest_framework.routers import DefaultRouter

from .views import EquipmentTypeViewSet, EquipmentViewSet

router = DefaultRouter()
# Registrar 'equipment/types' ANTES de 'equipment' para que la ruta fija
# no sea capturada como /equipment/{pk}/.
router.register(r"equipment/types", EquipmentTypeViewSet, basename="equipment-type")
router.register(r"equipment", EquipmentViewSet, basename="equipment")

urlpatterns = router.urls
