from rest_framework import filters, viewsets

from .models import Customer
from .serializers import CustomerSerializer


class CustomerViewSet(viewsets.ModelViewSet):
    serializer_class = CustomerSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["name", "identification_number", "phone", "email"]

    def get_queryset(self):
        qs = Customer.objects.all()
        include_inactive = self.request.query_params.get("include_inactive")
        if include_inactive not in ("1", "true", "True"):
            qs = qs.filter(is_active=True)
        return qs

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active", "updated_at"])
