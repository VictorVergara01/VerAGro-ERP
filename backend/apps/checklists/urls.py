from rest_framework.routers import SimpleRouter

from .views import (
    ChecklistTemplateItemViewSet,
    ChecklistTemplateViewSet,
    ServiceChecklistItemViewSet,
    ServiceChecklistViewSet,
)

router = SimpleRouter()
router.register(
    r"checklists/templates", ChecklistTemplateViewSet, basename="checklist-template"
)
router.register(
    r"checklists/template-items",
    ChecklistTemplateItemViewSet,
    basename="checklist-template-item",
)
router.register(
    r"service-checklists", ServiceChecklistViewSet, basename="service-checklist"
)
router.register(
    r"service-checklist-items",
    ServiceChecklistItemViewSet,
    basename="service-checklist-item",
)

urlpatterns = router.urls
