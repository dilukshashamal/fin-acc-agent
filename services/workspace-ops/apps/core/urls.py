from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from .views import ClientViewSet, EngagementViewSet, TaskViewSet, DeveloperSetupView, DocumentViewSet

router = DefaultRouter()
router.register(r'clients', ClientViewSet, basename='client')
router.register(r'engagements', EngagementViewSet, basename='engagement')
router.register(r'tasks', TaskViewSet, basename='task')
router.register(r'documents', DocumentViewSet, basename='document')

urlpatterns = [
    path('', include(router.urls)),
    
    # Auth endpoints
    path('auth/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    
    # Dev onboarding/seed endpoint
    path('auth/dev-setup/', DeveloperSetupView.as_view(), name='dev_setup'),
]
