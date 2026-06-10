"""F1: stateless simulation endpoint of the Game Plan engine.

POST /api/v1/projects/cronograma/simular/ — IsAuthenticated, no side
effects (no persistence, no audit mutation). The persisting endpoint
(ScheduleVersion + ProjectPhase) comes in F5.
"""
import logging

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .scheduling import gerar_game_plan
from .serializers_scheduling import CronogramaParamsSerializer, serialize_game_plan

logger = logging.getLogger('projects')


class _CronogramaSimulateThrottle(ScopedRateThrottle):
    """F1: pure-compute endpoint, but rate-limited per user against flood
    (STRIDE DoS, doc 08 §8.1) — scope cronograma_simulate (60/min)."""
    scope = 'cronograma_simulate'


@extend_schema(tags=['projects'])
class CronogramaSimularView(APIView):
    """Simula o Game Plan a partir dos parâmetros — sem efeito colateral."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [_CronogramaSimulateThrottle]

    def post(self, request):
        serializer = CronogramaParamsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            plan = gerar_game_plan(serializer.to_params())
        except ValueError as exc:
            # serializer ranges mirror the dataclass — defensive only
            return Response({'detail': str(exc)},
                            status=status.HTTP_400_BAD_REQUEST)
        return Response(serialize_game_plan(plan))
