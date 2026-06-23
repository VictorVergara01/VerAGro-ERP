from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import PushDevice
from .serializers import PushTokenSerializer


class RegisterPushView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = PushTokenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        token = serializer.validated_data["token"]
        # Upsert: el token es único; si ya existe (aunque sea de otro usuario),
        # se reasigna al usuario actual (el dispositivo cambió de dueño).
        PushDevice.objects.update_or_create(token=token, defaults={"user": request.user})
        return Response({"detail": "ok"})

    def delete(self, request):
        serializer = PushTokenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # Solo el dueño actual del token puede darlo de baja.
        PushDevice.objects.filter(
            user=request.user, token=serializer.validated_data["token"]
        ).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
