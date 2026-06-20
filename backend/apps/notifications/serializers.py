from rest_framework import serializers


class PushTokenSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=255)
