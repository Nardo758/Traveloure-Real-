from rest_framework.permissions import BasePermission
from rest_framework.exceptions import PermissionDenied


class ServiceCreatePermission(BasePermission):
    def has_permission(self, request, view):
        user = request.user

        if not user.is_authenticated:
            raise PermissionDenied("You are not authenticated.")

        if user.is_superuser and user.is_staff:
            return True

        if not getattr(user, 'is_service_provider', False):
            raise PermissionDenied("You are not allowed to perform this action.")

        return True
