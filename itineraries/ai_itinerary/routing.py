from django.urls import path,re_path
from .consumers import ChatConsumer

websocket_urlpatterns = [
    # path('ws/chat/<uuid:user_id>/<uuid:expert_id>/', ChatConsumer.as_asgi()),
    re_path(r"ws/chat/(?P<user_id>[0-9a-f-]+)/$", ChatConsumer.as_asgi()),
]
