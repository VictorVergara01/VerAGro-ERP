from rest_framework import filters, generics, permissions, viewsets

from apps.core import roles
from apps.core.permissions import role_required

from .models import User
from .serializers import UserManagementSerializer, UserSerializer


class MeView(generics.RetrieveAPIView):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user


class UserListView(generics.ListAPIView):
    """Listado read-only de usuarios activos (para selectores; p.ej. asignar técnico).

    Sin paginación (alimenta selectores). Filtro opcional ?role=.
    """

    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        qs = User.objects.filter(is_active=True).order_by("full_name")
        role = self.request.query_params.get("role")
        if role:
            qs = qs.filter(role=role)
        return qs


UsersWrite = role_required(*roles.USERS_WRITE)


class UserManagementViewSet(viewsets.ModelViewSet):
    """Gestión de usuarios desde Configuración (admins). Soft delete."""

    serializer_class = UserManagementSerializer
    permission_classes = [UsersWrite]
    filter_backends = [filters.SearchFilter]
    search_fields = ["email", "full_name"]
    queryset = User.objects.all().order_by("full_name")

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active", "updated_at"])
