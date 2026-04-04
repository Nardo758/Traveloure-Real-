from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from .models import User
from .utils import generate_tokens
from django.core.files.base import ContentFile
import requests  # <-- Make sure this is imported

class GoogleCallbackView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        try:
            data = request.data
            email = data.get('email')
            name = data.get('name')
            picture = data.get('picture')
            google_id = data.get('google_id')
            id_token = data.get('id_token')

            if not email:
                return Response({'error': 'Email is required', 'status': False}, status=400)

            user = User.objects.filter(email=email).first()
            if not user:
                username = email.split('@')[0]
                first_name = name.split(' ')[0] if name else ''
                last_name = ' '.join(name.split(' ')[1:]) if name and len(name.split(' ')) > 1 else ''
                user = User.objects.create(
                email=email,
                username=username,
                first_name=first_name,
                last_name=last_name,
                is_email_verified=True,
                is_active=True
            )
                # Save profile picture
                if picture:
                    try:
                        response = requests.get(picture)
                        if response.status_code == 200:
                            avatar_content = ContentFile(response.content)
                            user.image.save(f"{user.id}_avatar.jpg", avatar_content)
                    except Exception as e:
                        print(f"Error downloading profile picture: {e}")
            try:
                tokens = generate_tokens(user)
                return Response({
                    'access': tokens['access'],
                    'refresh': tokens['refresh'],
                    'user': {
                        'email': user.email,
                        'name': f"{user.first_name} {user.last_name}".strip(),
                        'image': user.image.url if user.image else None,
                        "is_local_expert": True if user.is_local_expert else False,
                        "id" : str(user.id),
                        "first_name" : user.first_name,
                        "last_name" : user.last_name,
                    }
                }, status=200)
            except Exception as e:
                return Response({'error': f"Token error: {str(e)}", 'status': False}, status=400)

        except Exception as e:
            return Response({'error': f"Outer error: {str(e)}", 'status': False}, status=400)