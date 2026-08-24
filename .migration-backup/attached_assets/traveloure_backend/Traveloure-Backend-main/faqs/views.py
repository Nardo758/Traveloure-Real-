from django.shortcuts import render
from .models import FAQ
from .serializers import FAQSerializer
from rest_framework.viewsets import ModelViewSet
from authentication.utils import CustomPagination
from rest_framework.permissions import BasePermission, SAFE_METHODS

class FAQPermission(BasePermission):
    """
    Allow GET requests to anyone.
    Allow other methods only to staff and superusers.
    """

    def has_permission(self, request, view):
        # Allow GET (and other safe methods if needed)
        if request.method in SAFE_METHODS:
            return True

        # For write operations
        print(request.user, request.user.is_authenticated, request.user.is_staff, request.user.is_superuser)
        return (
            request.user
            and request.user.is_authenticated
            and request.user.is_staff
            and request.user.is_superuser
        )


class FAQViewSet(ModelViewSet):
    queryset = FAQ.objects.all().order_by('-created_at')
    serializer_class = FAQSerializer
    permission_classes = [FAQPermission]
    pagination_class = CustomPagination