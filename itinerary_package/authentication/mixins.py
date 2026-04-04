import logging

logger = logging.getLogger('travelDNA')

class LoggingMixin:
    def initial(self, request, *args, **kwargs):
        user = request.user
        username = user.username if user.is_authenticated else "Anonymous"  # Safe access

        logger.info(f"Request: {request.method} {request.path} - User: {username}")
        super().initial(request, *args, **kwargs)

    def finalize_response(self, request, response, *args, **kwargs):
        user = request.user
        username = user.username if user.is_authenticated else "Anonymous"

        logger.info(f"Response: {request.method} {request.path} - Status: {response.status_code} - User: {username}")
        return super().finalize_response(request, response, *args, **kwargs)