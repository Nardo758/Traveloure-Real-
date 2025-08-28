from django.urls import path,include
from . import views
from rest_framework.routers import DefaultRouter

router = DefaultRouter()
router.register(r'chats/(?P<receiver_id>[^/.]+)', views.ChatViewSet, basename='chat')


urlpatterns = [

    path("", include(router.urls)),

    # Trip creation and place search
    path('trips/create/', views.TripCreateView.as_view(), name='trip-create'),
    
    # Save places and hotel search
    path('places/save/', views.SaveSelectedPlacesView.as_view(), name='save-places'),
    
    # Save hotels and service search
    path('hotels/save/', views.SaveSelectedHotelsView.as_view(), name='save-hotels'),
    
    # Save services and generate itinerary
    path('services/save/', views.SaveSelectedServicesView.as_view(), name='save-services'),
    
    path('my-itineraries/', views.ListItineraryAPIView.as_view(), name='list-itinerary'),
    path('itinerary/<str:trip_id>/', views.UpdateItinerary.as_view(), name='update-itinerary'),
    path('expert-itinerary/<str:trip_id>/', views.ExpertUpdatedItineraryView.as_view(), name='expert-itinerary'),
    path('save-itinerary/<str:id>/', views.DecisionExpertUpdatedItineraryAPIView.as_view(), name='save-itinerary'),

    path("chat/<str:pk>/", views.ItineraryChatAPIView.as_view(), name="get_create_itinerary_expert_chat"),
    path("expert-assigned/", views.ItineraryAssigningToExpertAPIView.as_view(), name="expert-assigned-create"),
    path("expert-invitation/", views.ExpertItineraryDecisionAPIView.as_view(), name="expert-invitation"),
    path('reviews/create/', views.ReviewCreateAPIView.as_view(), name='create-review'),
    path('reviews/expert/<str:expert_id>/', views.PublicExpertReviewListAPIView.as_view(), name='public-expert-reviews'),
    path('my-reviews/', views.MyWrittenReviewsAPIView.as_view(), name='my-written-reviews'),

    path("discover/", views.DiscoverPlacesAPIView.as_view(), name="discover-places"),
    path("categories/", views.CategoryListAPIView.as_view(), name="category-list"),
    
    path("preferences/", views.TouristPreferenceListCreateAPIView.as_view(), name="preferences-list-create"),
    path("preferences/delete/", views.TouristPreferenceDestroyAPIView.as_view(), name="preferences-delete"),

    path("preferences/activity/", views.TouristPreferenceActivityListCreateAPIView.as_view(), name="activity-preferences-list-create"),
    path("preferences/activity/<str:activity_id>/", views.TouristPreferenceActivityDestroyAPIView.as_view(), name="activity-preferences-delete"),

    path("preferences/event/", views.TouristPreferenceEventListCreateAPIView.as_view(), name="event-preferences-list-create"),
    path("preferences/event/<str:event_id>/", views.TouristPreferenceEventDestroyAPIView.as_view(), name="event-preferences-delete"),


    path("guide/create/trip/", views.GenerateItineraryView.as_view(), name="create_guide_trip"),

    # path('explore/',views.TripExploreView.as_view(),name = "explore_trip"),
    path('generate-explore/',views.TripSubmitView.as_view(),name = "ai_generate_explore_trip"),
    path('my-itineraries/<str:id>/', views.GeneratedItineraryDetailAPIView.as_view(), name='generated-itinerary-detail'),


    path('share/<str:id>/',views.ShareAItineraryAPIView.as_view(), name="share_itinerary"),


    # path('aff-explore/',views.AffiliateTripExploreAPIView.as_view(),name="affliliate_explore"),
    path('affiliate-platforms/bulk-create/', views.AffiliatePlatformBulkCreateAPIView.as_view(), name='affiliate-platforms-bulk-create'),
    path('affiliate-platforms/bulk-upsert/', views.AffiliatePlatformBulkUpsertAPIView.as_view(), name='affiliate-platforms-bulk-upsert'),
    path('affiliate-explore/', views.AffiliatePlatformExploreAPIView.as_view(), name='affiliate-platform-explore'),

    path("chats/", views.ChatListAPI.as_view(), name="chat-list"),
    
    # Local Experts
    path("local-experts/", views.LocalExpertListAPIView.as_view(), name="local-experts-list"),
] 
