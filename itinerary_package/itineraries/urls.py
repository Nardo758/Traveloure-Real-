from rest_framework.routers import DefaultRouter
from django.urls import path, include
from .views import *

router = DefaultRouter()
router.register(r'categories', ItineraryCategoryViewSet, basename='category')
router.register(r'itineraries', ItineraryViewSet, basename='itinerary')
router.register(r'itinerary-days', ItineraryDayViewSet, basename='itineraryday')
router.register(r'itinerary-points', ItineraryPointViewSet, basename='itinerarypoint')
router.register(r'itinerary-media', ItineraryMediaViewSet, basename='itinerary-media')
router.register(r'itineraries-all', ItineraryListViewSet, basename='itinerary-all')
router.register(r'itineraries-saved', SavedItineraryViewSet, basename='saved-itinerary')



urlpatterns = [
    path('', include(router.urls)),
    path('like/', ItineraryLikeView.as_view(), name='like-itinerary'),
    path('likes/', AllItineraryLikesListView.as_view(), name='all-itinerary-likes'),
    path('<int:itinerary_id>/likes/', ItineraryLikesListView.as_view(), name='get-itinerary-likes'),
    path('report/', ItineraryReportView.as_view(), name='report-itinerary'),
    path('reports/', AllItineraryReportsListView.as_view(), name='report-itinerary'),
    path('<int:itinerary_id>/reports/', ItineraryReportsListView.as_view(), name='get-itinerary-reports'),

]