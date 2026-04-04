# yourapp/middleware.py

import jwt
from django.conf import settings
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser
from urllib.parse import parse_qs
import logging

logger = logging.getLogger(__name__)

class JWTAuthMiddleware:
    """
    Custom middleware to authenticate WebSocket connection using JWT.
    Supports both headers and query parameters for Next.js compatibility.
    Expects: 
    - Headers: Authorization: Bearer <token>
    - Query: ?token=<jwt_token>
    """

    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        scope['user'] = AnonymousUser()  # default

        token = None
        
        # Method 1: Try to get token from headers (for API clients)
        headers = dict(scope.get("headers", []))
        auth_header = headers.get(b'authorization', None)

        if auth_header:
            try:
                auth_data = auth_header.decode().split()
                if len(auth_data) == 2 and auth_data[0].lower() == "bearer":
                    token = auth_data[1]
                elif len(auth_data) == 1:
                    token = auth_data[0]
            except Exception as e:
                logger.warning(f"Failed to parse authorization header: {e}")

        # Method 2: Try to get token from query parameters (for Next.js WebSocket)
        if not token and 'query_string' in scope:
            try:
                query_string = scope['query_string'].decode()
                query_params = parse_qs(query_string)
                token = query_params.get('token', [None])[0]
            except Exception as e:
                logger.warning(f"Failed to parse query parameters: {e}")

        # Authenticate user if token is found
        if token:
            try:
                # Use Django REST framework JWT settings
                from rest_framework_simplejwt.tokens import AccessToken
                from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
                
                # Decode and validate token
                access_token = AccessToken(token)
                user_id = access_token['user_id']
                
                if user_id:
                    user = await database_sync_to_async(User.objects.get)(id=user_id)
                    
                    # Additional security checks
                    if user.is_active and not user.deleted:
                        scope['user'] = user
                        logger.info(f"WebSocket authenticated for user: {user.email}")
                    else:
                        logger.warning(f"WebSocket authentication failed - user inactive/deleted: {user_id}")
                        scope['user'] = AnonymousUser()
                else:
                    logger.warning("WebSocket authentication failed - no user_id in token")
                    
            except (InvalidToken, TokenError) as e:
                logger.warning(f"WebSocket authentication failed - invalid token: {e}")
                scope['user'] = AnonymousUser()
            except User.DoesNotExist:
                logger.warning(f"WebSocket authentication failed - user not found")
                scope['user'] = AnonymousUser()
            except Exception as e:
                logger.error(f"WebSocket authentication error: {e}")
                scope['user'] = AnonymousUser()
        else:
            logger.info("WebSocket connection without authentication token")

        return await self.inner(scope, receive, send)