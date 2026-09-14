from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from rest_framework.routers import SimpleRouter

from apps.core.views import CompanyProfileView
from apps.users.views import UserListView, UserManagementViewSet

users_router = SimpleRouter()
users_router.register("user-management", UserManagementViewSet, basename="user-management")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "api/docs/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="swagger-ui",
    ),
    path("api/auth/", include("apps.users.urls")),
    path("api/users/", UserListView.as_view(), name="user-list"),
    path("api/", include(users_router.urls)),
    path("api/company/", CompanyProfileView.as_view(), name="company-profile"),
    path("api/", include("apps.customers.urls")),
    path("api/", include("apps.equipment.urls")),
    path("api/", include("apps.inventory.urls")),
    path("api/", include("apps.suppliers.urls")),
    path("api/", include("apps.purchasing.urls")),
    path("api/", include("apps.service_orders.urls")),
    path("api/", include("apps.checklists.urls")),
    path("api/", include("apps.billing.urls")),
    path("api/", include("apps.field_jobs.urls")),
    path("api/", include("apps.reports.urls")),
]

# Servir archivos de media en desarrollo (fotos de órdenes).
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
