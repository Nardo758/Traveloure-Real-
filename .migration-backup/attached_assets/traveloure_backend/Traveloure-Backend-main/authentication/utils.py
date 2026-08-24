from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.response import Response
from django.template.loader import render_to_string
from django.conf import settings
from django.core.mail import EmailMessage
from rest_framework.pagination import PageNumberPagination
import django_filters
from .models import User, ServiceProviderForm

def generate_tokens(user):
    refresh = RefreshToken.for_user(user)

    return {
        "refresh": str(refresh),
        "access": str(refresh.access_token),
        "user": {
            "email": user.email,
            "name": f"{user.first_name} {user.last_name}".strip(),
            "image": user.image.url if user.image else None,
            "id": str(user.id),
            "first_name": user.first_name,
            "last_name": user.last_name
        }
    }

def send_verification_mail(self=None, request=None, user=None,email=None,token=None,subject=None, template=None,reverse_name = None,uid=None):
    if self and hasattr(self, 'context') and 'request' in self.context:
        request = self.context['request']
    verification_link = None
    if reverse_name == "forget_reset":
        verification_link = f"{settings.FRONTEND_URL}/reset-password/?uid={uid}&token={token}"
    if reverse_name == 'verify_email':
        verification_link = f"{settings.FRONTEND_URL}/verify-email/?token={token}"
    
    # Add logging
    import logging
    logger = logging.getLogger('travelDNA')
    logger.info(f"Sending email to: {email}")
    logger.info(f"Verification link: {verification_link}")
    logger.info(f"Email settings: HOST={settings.EMAIL_HOST}, PORT={settings.EMAIL_PORT}, USER={settings.EMAIL_HOST_USER}")
    
    email_context = {
        'subject': subject,
        'user': user,
        'verification_link': verification_link
    }
    email_html_message = render_to_string(template, email_context)
    
    # Add SMTP debugging
    import smtplib
    import logging
    logger = logging.getLogger('travelDNA')
    
    try:
        # Create SMTP connection with debugging
        smtp = smtplib.SMTP(settings.EMAIL_HOST, settings.EMAIL_PORT)
        smtp.set_debuglevel(1)  # Enable verbose debug output
        smtp.ehlo()
        if settings.EMAIL_USE_TLS:
            smtp.starttls()
        smtp.ehlo()
        smtp.login(settings.EMAIL_HOST_USER, settings.EMAIL_HOST_PASSWORD)
        logger.info("SMTP login successful")
        smtp.quit()
        
        # Continue with normal email sending
        email_obj = EmailMessage(
            subject=email_context['subject'],
            body=email_html_message,
            from_email=settings.EMAIL_HOST_USER,
            to=[email],
        )
        email_obj.content_subtype = 'html'
        email_obj.send()
        logger.info(f"Email sent successfully to {email}")
        return user
    except Exception as e:
        logger.error(f"Email sending failed: {str(e)}")
        raise e

# def get_log_details(request):
#     ip = request.META.get('HTTP_X_FORWARDED_FOR')
#     if ip:
#         ip = ip.split(',')[0]  # Get the first IP in the list
#     else:
#         ip = request.META.get('REMOTE_ADDR', '')
#     # try:
#         # resp = requests.get(f"https://ipapi.co/{ip}/json")
#         # data = resp.json()
#         # location = f"{data.get('city', 'Unknown')}, {data.get('region', 'Unknown')}"
#     # except Exception:
#     #     location= "Unknown"
#     location = "Unknown"
#     user_agent = get_user_agent(request)
#     browser = f"{user_agent.browser.family} {user_agent.browser.version_string}"
#     return ip, location, browser

import string, random
from django.utils.text import slugify
from authentication.models import User

def generate_unique_username(first_name, last_name, max_attempts=100):
    base_username = slugify(f"{first_name}.{last_name}")
    username = base_username

    for _ in range(max_attempts):
        if not User.objects.filter(username=username).exists():
            return username
        # Append random number to ensure uniqueness
        suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=4))
        username = f"{base_username}{suffix}"
    
    raise Exception("Unable to generate unique username after multiple attempts.")


def generate_random_password(length=10):
        return ''.join(random.choices(string.ascii_letters + string.digits, k=length))


class CustomPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 100

    def get_paginated_response(self, data):
        return Response({
            'count':self.page.paginator.count,
            'total_pages':self.page.paginator.num_pages,
            'data': data,
            'status': True
        })
    

class ServiceProviderFilter(django_filters.FilterSet):
    status = django_filters.CharFilter(method='filter_by_status', label='Form Status')
    is_active = django_filters.BooleanFilter(field_name='is_active')
    created_at_after = django_filters.DateFilter(field_name='created_at', lookup_expr='gte')
    created_at_before = django_filters.DateFilter(field_name='created_at', lookup_expr='lte')
    country = django_filters.CharFilter(lookup_expr='icontains')
    city = django_filters.CharFilter(lookup_expr='icontains')

    class Meta:
        model = User
        fields = ['is_active', 'country', 'city']

    def filter_by_status(self, queryset, name, value):
        """Filters users based on their related ServiceProviderForm status."""
        user_ids = ServiceProviderForm.objects.filter(status=value).values_list('user_id', flat=True)
        return queryset.filter(id__in=user_ids)