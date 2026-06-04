from rest_framework.generics import RetrieveUpdateAPIView
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser

from .models import CompanyProfile
from .permissions import IsAdminOrReadOnly
from .serializers import CompanyProfileSerializer


class CompanyProfileView(RetrieveUpdateAPIView):
    """Perfil de empresa (singleton). GET para cualquier autenticado; PUT/PATCH
    solo admin. Acepta multipart para subir el logo."""

    serializer_class = CompanyProfileSerializer
    permission_classes = [IsAdminOrReadOnly]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_object(self):
        return CompanyProfile.load()
