from rest_framework.permissions import BasePermission
from rest_framework.exceptions import PermissionDenied


class CategoryPermission(BasePermission):
    def has_permission(self, request, view):
        if request.method == 'GET':
            # Allow GET requests for all users, regardless of is_staff
            return True

        if request.user.is_staff:
            # Allow all methods (POST, PUT, PATCH, DELETE) for staff users
            return True
        
        # For non-staff users, deny access to anything other than GET
        raise PermissionDenied("You do not have permission to perform this action.")
    