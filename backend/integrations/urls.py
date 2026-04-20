from django.urls import path

from .views import PresentationLaunchView

urlpatterns = [
    path("presentations/launch/", PresentationLaunchView.as_view(), name="presentation-launch"),
]
