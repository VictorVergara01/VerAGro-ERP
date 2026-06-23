from django.db import models

from apps.core.models import TimeStampedModel


class PushDevice(TimeStampedModel):
    user = models.ForeignKey(
        "users.User", on_delete=models.CASCADE, related_name="push_devices"
    )
    token = models.CharField(max_length=255, unique=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.user_id}:{self.token[:16]}"
