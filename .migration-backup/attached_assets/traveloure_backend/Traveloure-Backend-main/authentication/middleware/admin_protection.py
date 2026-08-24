"""
Admin Endpoint Protection Middleware
Restricts access to admin endpoints
"""
from django.http import JsonResponse, HttpResponseForbidden
from django.utils.deprecation import MiddlewareMixin
import os


class AdminProtectionMiddleware(MiddlewareMixin):
    """
    Protects admin endpoints with IP whitelist and additional authentication
    """
    
    # Admin paths to protect
    PROTECTED_PATHS = [
        '/admin/',
        '/api/admin/',
        '/api/docs/',
        '/swagger/',
        '/redoc/',
        '/graphql/',
    ]
    
    # Whitelisted IPs (configure via environment variable)
    # Format: comma-separated IPs, e.g., "127.0.0.1,192.168.1.100"
    ALLOWED_IPS = os.getenv('ADMIN_ALLOWED_IPS', '127.0.0.1').split(',')
    
    def get_client_ip(self, request):
        """Get client IP address"""
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip = x_forwarded_for.split(',')[0].strip()
        else:
            ip = request.META.get('REMOTE_ADDR')
        return ip
    
    def is_protected_path(self, path):
        """Check if path is protected"""
        return any(path.startswith(protected) for protected in self.PROTECTED_PATHS)
    
    def is_allowed_ip(self, ip):
        """Check if IP is whitelisted"""
        # Remove whitespace from configured IPs
        allowed_ips = [ip.strip() for ip in self.ALLOWED_IPS]
        return ip in allowed_ips or '0.0.0.0' in allowed_ips
    
    def process_request(self, request):
        # Skip if not a protected path
        if not self.is_protected_path(request.path):
            return None
        
        # Allow in DEBUG mode (development)
        from django.conf import settings
        if settings.DEBUG:
            return None
        
        # Check IP whitelist
        client_ip = self.get_client_ip(request)
        
        if not self.is_allowed_ip(client_ip):
            # Log the attempt
            import logging
            logger = logging.getLogger('travelDNA')
            logger.warning(f"Blocked admin access attempt from {client_ip} to {request.path}")
            
            # Return 403 Forbidden
            if request.path.startswith('/api/'):
                return JsonResponse({
                    'error': 'Access Forbidden',
                    'detail': 'You do not have permission to access this resource.',
                }, status=403)
            else:
                return HttpResponseForbidden(
                    '<h1>403 Forbidden</h1>'
                    '<p>You do not have permission to access this resource.</p>'
                )
        
        # IP is whitelisted, check if user is authenticated and is staff
        if request.user.is_authenticated:
            if not (request.user.is_staff or request.user.is_superuser):
                return JsonResponse({
                    'error': 'Access Forbidden',
                    'detail': 'Admin privileges required.',
                }, status=403)
        
        # Allow access
        return None
