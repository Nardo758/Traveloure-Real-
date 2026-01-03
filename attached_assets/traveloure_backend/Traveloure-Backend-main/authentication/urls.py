from django.urls import path, include
from .views import *
from .google_auth_views import GoogleCallbackView
from rest_framework.routers import DefaultRouter
from .views_api.auth_api import *
from .views_api.category_api import *
from .views_api.local_expert import SearchLocalExertAPIView, LocalExpertCreate, RetrieveLocalExpertStatus, LocalExpertAdminListAPIView, LocalExpertAdminDetailUpdateAPIView, LocalExpertMyApplicationAPIView, LocalExpertDashboardAPIView, LocalExpertByCountryAPIView, LocalExpertBusinessProfileAPIView, LocalExpertEarningsView
from .views_api.service_provider import CreateServiceProviderFormView, RetrieveServiceProviderStatus, ManageServiceProviderFormListView, ManageServiceProviderFormDetailUpdateView, ServiceProviderMyApplicationAPIView, ServiceProviderDashboardAPIView, ServiceProviderByCountryAPIView

urlpatterns = [
    path('register/',UserRegistrationAPIView.as_view(),name='signup'),
    path('tokenverify/<str:token>/',EmailVerificationAPIView.as_view(),name='email_verify'),
    path('login/',UserLoginAPIView.as_view(),name='signin'),
    path('logout/',LogoutAPIView.as_view(),name='signout'),
    path('refresh-token/',TokenRefreshAPIView.as_view(),name='user_refresh_token'),
    path('resend-email/',ResendEmailVerificationAPIView.as_view(),name='resend_email'),
    path('forget-password/',ForgotPasswordAPIView.as_view(),name='forget_password'),
    path('forget-reset-password/<str:uidb64>/<str:token>/',ForgetResetPasswordAPIView.as_view(),name='forget_reset'), 
    path('change-password/',ChangePasswordAPIView.as_view(),name='change_password'),
    path('toggle/<str:id>/',RoleToggleView.as_view(),name='toggle_role'),

    path('profile/',UserProfile.as_view(),name='get_profile'),
    path('profile/<str:id>/',UserProfileUpdateView.as_view(),name='update_profile'),

    path('travel-preference/<str:user_id>/',TravelPreferenceAPIView.as_view(),name='retrieve_update_travel_preference'),

    path("google-callback/", GoogleCallbackView.as_view(), name="google_login"),
    path("facebook-login-success/", FacebookLoginSuccessView.as_view(), name="facebook_login_success"),
    path("weather/future/", get_future_weather, name="get_future_weather"),
    path("local-experts/", SearchLocalExertAPIView.as_view(), name="search_local_experts"),
    path("facebook/token/", FacebookTokenAPIView.as_view(), name="facebook_token"),

    #local Expert Registeration
    path('local-expert/create/', LocalExpertCreate.as_view(), name='local-expert-create'),
    path('local-expert/status/', RetrieveLocalExpertStatus.as_view(), name='local-expert-status'),
    
    #Manage Local Expert API's
    path('manage-localexpert/',LocalExpertAdminListAPIView.as_view(),name = 'list_localExpert'),
    path('manage-localexpert/<int:pk>/',LocalExpertAdminDetailUpdateAPIView.as_view(),name = 'retrieve_update_localExpert'),

    path('local-expert/my-application/', LocalExpertMyApplicationAPIView.as_view(), name='local-expert-my-application'),
    # Local Expert Business profile
    path('my-business-profile/', LocalExpertBusinessProfileAPIView.as_view(), name='local-expert-business-profile'),
    path('my-earnings/', LocalExpertEarningsView.as_view(), name='local-expert-earnings'),


    path('service-provider/my-application/', ServiceProviderMyApplicationAPIView.as_view(), name='service-provider-my-application'),

    path('service-provider/create/', CreateServiceProviderFormView.as_view(), name='service-provider-create'),
    path('service-provider/status/', RetrieveServiceProviderStatus.as_view(), name='service-provider-status'),
    path('manage-serviceprovider/',ManageServiceProviderFormListView.as_view(),name = 'list_serviceprovider'),
    path('manage-serviceprovider/<int:pk>/',ManageServiceProviderFormDetailUpdateView.as_view(),name = 'retrieve_update_serviceprovider'),

    path('service-provider/dashboard/',ServiceProviderDashboardAPIView.as_view(),name = 'dashboard_serviceprovider'),
    path('local-expert/dashboard/',LocalExpertDashboardAPIView.as_view(),name = 'dashboard_local_expert'),

    path('service-provider/view/<str:country_name>/',ServiceProviderByCountryAPIView.as_view(),name="list_sp_by_country"),
    path('local-expert/view/<str:country_name>/',LocalExpertByCountryAPIView.as_view(),name="list_le_by_country"),


    # Category & SubCategory API's
    path('category/',CategoryAPIView.as_view(),name="list_create_category"),
    path('category/<str:id>/',CategoryDetailAPIView.as_view(),name="update_delete_category"),
    path('subcategory/',SubCategoryAPIView.as_view(),name="list_create_subcategory"),
    path('subcategory/<str:id>/',SubCategoryDetailAPIView.as_view(),name="update_delete_subcategory"),
]
