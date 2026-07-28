from rest_framework.routers import SimpleRouter

from .views import (
    EquipmentTypeViewSet,
    EquipmentViewSet,
    EquipmentModelViewSet,
    EquipmentComponentViewSet,
)

router = SimpleRouter()
# Registrar 'equipment/types', 'equipment/models' y 'equipment/components' ANTES de 'equipment' para
# que las rutas fijas no sean capturadas como /equipment/{pk}/.
router.register(r"equipment/types", EquipmentTypeViewSet, basename="equipment-type")
router.register(r"equipment/models", EquipmentModelViewSet, basename="equipment-model")
router.register(r"equipment/components", EquipmentComponentViewSet, basename="equipment-component")
router.register(r"equipment", EquipmentViewSet, basename="equipment")

urlpatterns = router.urls
