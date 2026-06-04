from rest_framework import generics, permissions

from .models import User
from .serializers import UserSerializer


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
