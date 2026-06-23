from django.urls import path

from .views import RegisterPushView

urlpatterns = [
    path("push/register/", RegisterPushView.as_view(), name="push-register"),
    path("push/unregister/", RegisterPushView.as_view(), name="push-unregister"),
]
