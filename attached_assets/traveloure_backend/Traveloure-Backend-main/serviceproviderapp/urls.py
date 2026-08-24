from django.urls import path
from .views import AllServiceListCreateView, AllServiceRetrieveUpdateDestroyView,ServiceStatusUpdateView,AllAvailableServiceView, PayForServiceView, ServiceDashboardView

urlpatterns = [
    path('', AllAvailableServiceView.as_view(), name='all-services'),
    path('services/', AllServiceListCreateView.as_view(), name='service-list-create'),
    path('services/<uuid:id>/', AllServiceRetrieveUpdateDestroyView.as_view(), name='service-detail'),
    path('services/update-status/', ServiceStatusUpdateView.as_view(), name='service-update-status'),
    path('dashboard/', ServiceDashboardView.as_view(), name='service-dashboard'),

    path('pay/<str:service_id>/', PayForServiceView.as_view(), name='pay-service'),
]
