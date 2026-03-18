from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    RegisterView, LoginView, TwoFactorVerifyView, TwoFactorSetupView,
    ProfileView, ChangePasswordView, LogoutView,
    PasswordResetRequestView, PasswordResetConfirmView, UserListView, UserDetailView,
    CookieTokenRefreshView,
)
from .views_employee import EmployeeProfileViewSet, UserSkillViewSet, AbsenceViewSet

router = DefaultRouter()
router.register(r'employee-profiles', EmployeeProfileViewSet, basename='employee-profiles')
router.register(r'skills', UserSkillViewSet, basename='skills')
router.register(r'absences', AbsenceViewSet, basename='absences')

urlpatterns = [
    path('register/', RegisterView.as_view(), name='register'),
    path('login/', LoginView.as_view(), name='login'),
    path('logout/', LogoutView.as_view(), name='logout'),
    path('refresh/', CookieTokenRefreshView.as_view(), name='token_refresh'),
    path('2fa/setup/', TwoFactorSetupView.as_view(), name='2fa_setup'),
    path('2fa/verify/', TwoFactorVerifyView.as_view(), name='2fa_verify'),
    path('profile/', ProfileView.as_view(), name='profile'),
    path('change-password/', ChangePasswordView.as_view(), name='change_password'),
    path('password-reset/', PasswordResetRequestView.as_view(), name='password_reset'),
    path('password-reset/confirm/', PasswordResetConfirmView.as_view(), name='password_reset_confirm'),
    path('users/', UserListView.as_view(), name='user_list'),
    path('users/<int:pk>/', UserDetailView.as_view(), name='user_detail'),
    path('', include(router.urls)),
]
