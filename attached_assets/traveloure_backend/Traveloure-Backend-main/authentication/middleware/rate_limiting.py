"""
Rate Limiting Middleware
Prevents brute force attacks and API abuse
"""
from django.core.cache import cache
from django.http import JsonResponse
from django.utils.deprecation import MiddlewareMixin
import hashlib


class RateLimitMiddleware(MiddlewareMixin):
    """
    Simple rate limiting middleware
    Uses Django cache backend (configure Redis for production)
    """
    
    # Rate limits per endpoint type
    RATE_LIMITS = {
        '/auth/login/': {'requests': 5, 'window': 300},  # 5 requests per 5 minutes
        '/auth/register/': {'requests': 3, 'window': 600},  # 3 requests per 10 minutes
        '/auth/refresh-token/': {'requests': 10, 'window': 60},  # 10 per minute
        '/api/': {'requests': 100, 'window': 60},  # 100 per minute for API
        'default': {'requests': 60, 'window': 60},  # 60 per minute default
    }
    
    def get_client_ip(self, request):
        """Get client IP address"""
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip = x_forwarded_for.split(',')[0]
        else:
            ip = request.META.get('REMOTE_ADDR')
        return ip
    
    def get_rate_limit_key(self, request):
        """Generate cache key for rate limiting"""
        ip = self.get_client_ip(request)
        path = request.path
        # Hash to keep key size reasonable
        key_data = f"{ip}:{path}"
        return f"rate_limit:{hashlib.md5(key_data.encode()).hexdigest()}"
    
    def get_rate_limit_config(self, path):
        """Get rate limit configuration for path"""
        # Check specific endpoints first
        for endpoint, config in self.RATE_LIMITS.items():
            if endpoint != 'default' and path.startswith(endpoint):
                return config
        
        # Check if it's an API endpoint
        if path.startswith('/api/'):
            return self.RATE_LIMITS['/api/']
        
        # Default
        return self.RATE_LIMITS['default']
    
    def process_request(self, request):
        # Skip rate limiting for static files and media
        if request.path.startswith('/static/') or request.path.startswith('/media/'):
            return None
        
        # Skip rate limiting in DEBUG mode (development)
        from django.conf import settings
        if settings.DEBUG:
            return None
        
        key = self.get_rate_limit_key(request)
        config = self.get_rate_limit_config(request.path)
        
        # Get current request count
        request_count = cache.get(key, 0)
        
        if request_count >= config['requests']:
            # Rate limit exceeded
            return JsonResponse({
                'error': 'Rate limit exceeded',
                'detail': f"Too many requests. Please try again in {config['window']} seconds.",
                'retry_after': config['window']
            }, status=429)
        
        # Increment counter
        cache.set(key, request_count + 1, config['window'])
        
        # Add rate limit headers to response
        request.rate_limit_remaining = config['requests'] - request_count - 1
        request.rate_limit_limit = config['requests']
        
        return None
    
    def process_response(self, request, response):
        """Add rate limit headers to response"""
        if hasattr(request, 'rate_limit_remaining'):
            response['X-RateLimit-Limit'] = request.rate_limit_limit
            response['X-RateLimit-Remaining'] = request.rate_limit_remaining
        
        return response
