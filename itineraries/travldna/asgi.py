"""
ASGI config for travldna project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/5.1/howto/deployment/asgi/
"""
import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'travldna.settings')

import django
django.setup()

from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application
from ai_itinerary.middleware import JWTAuthMiddleware

# Import websocket patterns after Django is set up
try:
    from ai_itinerary.routing import websocket_urlpatterns
    print("Loaded WebSocket URL patterns:", websocket_urlpatterns)
except Exception as e:
    print("Error importing websocket patterns:", e)
    websocket_urlpatterns = []

application = ProtocolTypeRouter({
    "http": get_asgi_application(),
    "websocket": JWTAuthMiddleware(
        URLRouter(
            websocket_urlpatterns
        )
    ),
})