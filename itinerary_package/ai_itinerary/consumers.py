# consumers.py
from channels.generic.websocket import AsyncJsonWebsocketConsumer
import json
from .models import UserAndExpertChat
from .serializers import UserAndExpertChatSerializer
from django.contrib.auth.models import AnonymousUser
from channels.db import database_sync_to_async
from django.db.models import Q
import logging

logger = logging.getLogger(__name__)

def chat_group_name(a_id, b_id) -> str:
    # deterministic room name for a 1:1 chat
    a, b = sorted([str(a_id), str(b_id)])
    return f"chat_{a}_{b}"


class ChatConsumer(AsyncJsonWebsocketConsumer):
    """
    Enhanced WebSocket consumer for chat functionality.
    Supports both authenticated and unauthenticated connections.
    Production-ready with comprehensive error handling and security.
    """

    async def connect(self):
        """Handle WebSocket connection with authentication and security checks."""
        try:
            user = self.scope["user"]
            url_user_id = self.scope["url_route"]["kwargs"]["user_id"]

            # Security check: Only allow authenticated users
            if not user.is_authenticated:
                logger.warning(f"WebSocket connection rejected - unauthenticated user")
                await self.close(code=4001)  # Custom code for authentication required
                return

            # Security check: User can only connect to their own chat
            if str(user.id) != str(url_user_id):
                logger.warning(f"WebSocket connection rejected - user {user.id} trying to access {url_user_id}")
                await self.close(code=4003)  # Custom code for forbidden
                return

            # Additional security checks
            if user.deleted:
                logger.warning(f"WebSocket connection rejected - deleted user {user.id}")
                await self.close(code=4002)  # Custom code for account deleted
                return

            self.user = user
            self.personal_group = f"user_{user.id}"

            # Join personal group for notifications
            await self.channel_layer.group_add(self.personal_group, self.channel_name)
            await self.accept()

            # Send connection confirmation
            await self.send_json({
                "type": "connection_established",
                "user_id": str(user.id),
                "message": "WebSocket connection established successfully"
            })

            logger.info(f"WebSocket connected for user: {user.email}")

        except Exception as e:
            logger.error(f"WebSocket connection error: {e}")
            await self.close(code=1011)  # Internal error

    async def disconnect(self, close_code):
        """Handle WebSocket disconnection."""
        try:
            # Leave personal group
            await self.channel_layer.group_discard(self.personal_group, self.channel_name)

            # Leave active chat group if joined
            if hasattr(self, "active_chat_group"):
                await self.channel_layer.group_discard(self.active_chat_group, self.channel_name)

            logger.info(f"WebSocket disconnected for user: {getattr(self, 'user', 'unknown')}")

        except Exception as e:
            logger.error(f"WebSocket disconnect error: {e}")

    async def receive_json(self, content, **kwargs):
        """Handle incoming JSON messages with comprehensive validation."""
        try:
            action = content.get("action")

            if not action:
                await self.send_json({
                    "type": "error",
                    "error": "Missing 'action' field",
                    "code": "MISSING_ACTION"
                })
                return

            # Route to appropriate handler
            if action == "join_chat":
                await self._handle_join_chat(content)
            elif action == "leave_chat":
                await self._handle_leave_chat(content)
            elif action == "send_message":
                await self._handle_send_message(content)
            elif action == "ping":
                await self._handle_ping(content)
            else:
                await self.send_json({
                    "type": "error",
                    "error": f"Unknown action: {action}",
                    "code": "UNKNOWN_ACTION"
                })

        except Exception as e:
            logger.error(f"Error processing message: {e}")
            await self.send_json({
                "type": "error",
                "error": "Internal server error",
                "code": "INTERNAL_ERROR"
            })

    async def _handle_join_chat(self, content):
        """Handle joining a specific chat room."""
        try:
            receiver_id = str(content.get("receiver_id"))
            
            if not receiver_id:
                await self.send_json({
                    "type": "error",
                    "error": "Missing receiver_id",
                    "code": "MISSING_RECEIVER_ID"
                })
                return

            # Validate receiver exists and is not the same as sender
            if receiver_id == str(self.user.id):
                await self.send_json({
                    "type": "error",
                    "error": "Cannot chat with yourself",
                    "code": "SELF_CHAT_NOT_ALLOWED"
                })
                return

            # Check if receiver exists
            receiver_exists = await self._check_user_exists(receiver_id)
            if not receiver_exists:
                await self.send_json({
                    "type": "error",
                    "error": "Receiver not found",
                    "code": "RECEIVER_NOT_FOUND"
                })
                return

            self.active_chat_group = chat_group_name(self.user.id, receiver_id)
            await self.channel_layer.group_add(self.active_chat_group, self.channel_name)
            
            await self.send_json({
                "type": "joined_chat",
                "room": self.active_chat_group,
                "receiver_id": receiver_id
            })

            logger.info(f"User {self.user.id} joined chat with {receiver_id}")

        except Exception as e:
            logger.error(f"Error joining chat: {e}")
            await self.send_json({
                "type": "error",
                "error": "Failed to join chat",
                "code": "JOIN_CHAT_ERROR"
            })

    async def _handle_leave_chat(self, content):
        """Handle leaving a specific chat room."""
        try:
            if hasattr(self, "active_chat_group"):
                room_name = self.active_chat_group
                await self.channel_layer.group_discard(self.active_chat_group, self.channel_name)
                del self.active_chat_group
                
                await self.send_json({
                    "type": "left_chat",
                    "room": room_name
                })

                logger.info(f"User {self.user.id} left chat room {room_name}")
            else:
                await self.send_json({
                    "type": "error",
                    "error": "Not in any chat room",
                    "code": "NOT_IN_CHAT"
                })

        except Exception as e:
            logger.error(f"Error leaving chat: {e}")
            await self.send_json({
                "type": "error",
                "error": "Failed to leave chat",
                "code": "LEAVE_CHAT_ERROR"
            })

    async def _handle_send_message(self, content):
        """Handle sending a message with validation."""
        try:
            receiver_id = str(content.get("receiver_id"))
            message = (content.get("message") or "").strip()

            # Validation
            if not receiver_id:
                await self.send_json({
                    "type": "error",
                    "error": "Missing receiver_id",
                    "code": "MISSING_RECEIVER_ID"
                })
                return

            if not message:
                await self.send_json({
                    "type": "error",
                    "error": "Message cannot be empty",
                    "code": "EMPTY_MESSAGE"
                })
                return

            if len(message) > 1000:  # Limit message length
                await self.send_json({
                    "type": "error",
                    "error": "Message too long (max 1000 characters)",
                    "code": "MESSAGE_TOO_LONG"
                })
                return

            # Check if receiver exists
            receiver_exists = await self._check_user_exists(receiver_id)
            if not receiver_exists:
                await self.send_json({
                    "type": "error",
                    "error": "Receiver not found",
                    "code": "RECEIVER_NOT_FOUND"
                })
                return

            # Save the message
            chat = await self._save_message(receiver_id=receiver_id, message=message)
            serialized = UserAndExpertChatSerializer(chat).data

            # Notify receiver's personal group
            await self.channel_layer.group_send(
                f"user_{receiver_id}",
                {"type": "new_message_notification", "payload": serialized}
            )

            # Publish to the 1:1 chat group
            room = chat_group_name(self.user.id, receiver_id)
            await self.channel_layer.group_send(
                room,
                {"type": "chat_message", "payload": serialized}
            )

            # Send confirmation to sender
            await self.send_json({
                "type": "message_sent",
                "message": serialized
            })

            logger.info(f"Message sent from {self.user.id} to {receiver_id}")

        except Exception as e:
            logger.error(f"Error sending message: {e}")
            await self.send_json({
                "type": "error",
                "error": "Failed to send message",
                "code": "SEND_MESSAGE_ERROR"
            })

    async def _handle_ping(self, content):
        """Handle ping messages for connection health check."""
        await self.send_json({
            "type": "pong",
            "timestamp": content.get("timestamp")
        })

    # Event handlers (names map to 'type' above)
    async def new_message_notification(self, event):
        """Handle new message notifications."""
        await self.send_json({
            "type": "notification",
            "message": event["payload"]
        })

    async def chat_message(self, event):
        """Handle chat messages."""
        await self.send_json({
            "type": "chat_message",
            "message": event["payload"]
        })

    @database_sync_to_async
    def _save_message(self, receiver_id: str, message: str):
        """Save message to database."""
        try:
            chat = UserAndExpertChat.objects.create(
                sender=self.user,
                receiver_id=receiver_id,
                message=message
            )
            # Re-fetch with related fields
            return UserAndExpertChat.objects.select_related("sender", "receiver").get(id=chat.id)
        except Exception as e:
            logger.error(f"Error saving message: {e}")
            raise

    @database_sync_to_async
    def _check_user_exists(self, user_id: str):
        """Check if user exists and is active."""
        from django.contrib.auth import get_user_model
        User = get_user_model()
        try:
            user = User.objects.get(id=user_id, is_active=True, deleted=False)
            return True
        except User.DoesNotExist:
            return False