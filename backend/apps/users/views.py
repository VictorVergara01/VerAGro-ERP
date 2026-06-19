from rest_framework import filters, generics, permissions, viewsets
from rest_framework.exceptions import PermissionDenied, ValidationError

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

    @staticmethod
    def _is_super(user):
        return user.role == roles.SUPER_ADMIN

    @staticmethod
    def _is_last_active_super(exclude_pk):
        return not (
            User.objects.filter(role=roles.SUPER_ADMIN, is_active=True)
            .exclude(pk=exclude_pk)
            .exists()
        )

    def perform_create(self, serializer):
        target_role = serializer.validated_data.get("role")
        if target_role == roles.SUPER_ADMIN and not self._is_super(self.request.user):
            raise PermissionDenied(
                "Solo un super administrador puede crear super administradores."
            )
        serializer.save()

    def perform_update(self, serializer):
        instance = serializer.instance
        actor = self.request.user
        data = serializer.validated_data
        new_role = data.get("role", instance.role)
        new_active = data.get("is_active", instance.is_active)

        touches_super = instance.role == roles.SUPER_ADMIN or new_role == roles.SUPER_ADMIN
        if touches_super and not self._is_super(actor):
            raise PermissionDenied(
                "Solo un super administrador puede gestionar super administradores."
            )

        if instance.pk == actor.pk:
            if new_role != instance.role:
                raise ValidationError({"role": "No puedes cambiar tu propio rol."})
            if not new_active:
                raise ValidationError({"is_active": "No puedes desactivar tu propia cuenta."})

        if instance.role == roles.SUPER_ADMIN and instance.is_active:
            if (new_role != roles.SUPER_ADMIN or not new_active) and self._is_last_active_super(
                instance.pk
            ):
                raise ValidationError(
                    "No puedes desactivar ni degradar al último super administrador activo."
                )

        serializer.save()

    def perform_destroy(self, instance):
        actor = self.request.user
        if instance.role == roles.SUPER_ADMIN and not self._is_super(actor):
            raise PermissionDenied(
                "Solo un super administrador puede desactivar super administradores."
            )
        if instance.pk == actor.pk:
            raise ValidationError({"is_active": "No puedes desactivar tu propia cuenta."})
        if (
            instance.role == roles.SUPER_ADMIN
            and instance.is_active
            and self._is_last_active_super(instance.pk)
        ):
            raise ValidationError(
                "No puedes desactivar al último super administrador activo."
            )
        instance.is_active = False
        instance.save(update_fields=["is_active", "updated_at"])
