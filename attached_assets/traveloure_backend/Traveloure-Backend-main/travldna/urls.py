"""
URL configuration for travldna project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.1/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.shortcuts import render
from subscription.views import PaymentSuccessView
from django.shortcuts import redirect
from django.contrib.auth.decorators import login_required
import os
from dotenv import load_dotenv

load_dotenv()


# @login_required
def facebook_after_login(request):
    domain = os.environ.get('DOMAIN_URL', 'https://traveloure.com').rstrip('/')
    
    access_token = request.session.get('access_token')
    refresh_token = request.session.get('refresh_token')
    fb_info = request.session.get('fb_info', {})
    
    if access_token and refresh_token:
        # Clear tokens from session
        del request.session['access_token']
        del request.session['refresh_token']
        if 'fb_info' in request.session:
            del request.session['fb_info']
        
        # Force session save
        request.session.save()
        
        # Redirect with tokens
        redirect_url = f"{domain}/token-callback?access={access_token}&refresh={refresh_token}"
    else:
        # Fallback: try to get user info and generate tokens manually
        if fb_info and fb_info.get('email'):
            try:
                from authentication.models import User
                from rest_framework_simplejwt.tokens import RefreshToken
                
                user = User.objects.get(email=fb_info['email'])
                if user:
                    refresh = RefreshToken.for_user(user)
                    access_token = str(refresh.access_token)
                    refresh_token = str(refresh)
                    
                    redirect_url = f"{domain}/token-callback?access={access_token}&refresh={refresh_token}"
                else:
                    redirect_url = f"{domain}/login?error=user_not_found"
            except Exception as e:
                redirect_url = f"{domain}/login?error=token_generation_failed"
        else:
            redirect_url = f"{domain}/login?error=no_tokens"
    
    return redirect(redirect_url) 

urlpatterns = [
    path('facebook/', facebook_after_login, name='facebook_after_login'),
    path('admin/', admin.site.urls),
    path('auth/', include('authentication.urls')),
    path('auth/', include('social_django.urls', namespace='social')),
    path('plan/', include('subscription.urls')),
    path('ai/', include('ai_itinerary.urls')),
    path('service/', include('serviceproviderapp.urls')),
    path('payment-success/', PaymentSuccessView.as_view(), name='payment-success'),
    path('viator/', include('viatorbooking.urls')),
    path('faqs/', include('faqs.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
