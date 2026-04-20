from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .services import SSOConfigError, build_launch_url


class PresentationLaunchView(APIView):
    """Issue a one-time SSO URL for the authenticated user to open the
    Inova Apresentação product in a new tab without re-authenticating."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "presentation_launch"

    def post(self, request):
        try:
            url = build_launch_url(request.user)
        except SSOConfigError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response({"url": url}, status=status.HTTP_200_OK)
