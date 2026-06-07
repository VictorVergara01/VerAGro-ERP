from rest_framework.generics import RetrieveUpdateAPIView
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser

from apps.core import roles
from apps.core.permissions import RoleWriteOrReadOnly

from .models import CompanyProfile
from .serializers import CompanyProfileSerializer


class CompanyProfileView(RetrieveUpdateAPIView):
    """Perfil de empresa (singleton). GET para cualquier autenticado; PUT/PATCH
    solo super_admin. Acepta multipart para subir el logo."""

    serializer_class = CompanyProfileSerializer
    permission_classes = [RoleWriteOrReadOnly(*roles.COMPANY_CONFIG_WRITE)]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_object(self):
        return CompanyProfile.load()
