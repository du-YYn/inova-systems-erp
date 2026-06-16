"""F1: serializers of the cronograma simulate endpoint.

Input mirrors CronogramaParams (ranges validated here AND in the dataclass
— serializer is the only entry door, dataclass is the last line of defense).
Output is the GamePlan flattened to JSON-safe primitives (ISO dates).
"""
from rest_framework import serializers

from .scheduling import CronogramaParams, GamePlan
from .scheduling.types import MODOS


class CronogramaParamsSerializer(serializers.Serializer):
    """Validates the simulation parameters (doc 07 §2)."""

    prazo_total = serializers.IntegerField(min_value=5, max_value=400, default=45)
    modo = serializers.ChoiceField(choices=MODOS, default='uteis')
    data_onboarding = serializers.DateField()
    pct_doc = serializers.IntegerField(min_value=0, max_value=40, default=15)
    pct_dev = serializers.IntegerField(min_value=20, max_value=80, default=50)
    pct_aud = serializers.IntegerField(min_value=0, max_value=30, default=8)
    peso_val = serializers.IntegerField(min_value=1, max_value=60, default=5)
    peso_hom = serializers.IntegerField(min_value=1, max_value=60, default=17)
    peso_ent = serializers.IntegerField(min_value=1, max_value=60, default=5)
    reupd_fds = serializers.IntegerField(min_value=0, max_value=8, default=0)
    considerar_carnaval = serializers.BooleanField(default=True)
    considerar_corpus = serializers.BooleanField(default=True)
    data_reuniao_validacao = serializers.DateField(
        required=False, allow_null=True, default=None)
    data_reuniao_apresentacao = serializers.DateField(
        required=False, allow_null=True, default=None)
    data_reuniao_graduacao = serializers.DateField(
        required=False, allow_null=True, default=None)

    def to_params(self) -> CronogramaParams:
        return CronogramaParams(**self.validated_data)


def _iso(value):
    return value.isoformat() if value is not None else None


def serialize_game_plan(plan: GamePlan) -> dict:
    """GamePlan → JSON-safe dict (ISO dates, doc 07 §9)."""
    return {
        'prazo_total': plan.params.prazo_total,
        'modo': plan.params.modo,
        'unidade': 'dias úteis' if plan.params.modo == 'uteis' else 'dias corridos',
        'data_onboarding': _iso(plan.params.data_onboarding),
        'entrega': _iso(plan.entrega),
        'entrega_base': _iso(plan.entrega_base),
        'total_gap': plan.total_gap,
        'capped': plan.capped,
        'avisos': list(plan.avisos),
        'fases': [
            {
                'key': fase.key,
                'label': fase.label,
                'dias': fase.dias,
                'pct': fase.pct,
                'cum_prev': fase.cum_prev,
                'cum_end': fase.cum_end,
                'inicio': _iso(fase.inicio),
                'fim': _iso(fase.fim),
                'ajustavel': fase.ajustavel,
                'is_dev': fase.is_dev,
                'is_end': fase.is_end,
                'sub_passos': [
                    {
                        'kind': s.kind,
                        'label': s.label,
                        'data': _iso(s.data),
                        'pos': s.pos,
                        'single': s.single,
                        'ws': s.ws,
                    }
                    for s in fase.sub_passos
                ],
            }
            for fase in plan.fases
        ],
        'reunioes': {
            key: {
                'data_natural': _iso(r.data_natural),
                'data_marcada': _iso(r.data_marcada),
                'gap': r.gap,
                'remarcada': r.remarcada,
            }
            for key, r in plan.reunioes.items()
        },
        'feriados': [
            {'data': _iso(h.data), 'nome': h.nome} for h in plan.feriados
        ],
        'reupd_info': (
            {
                'base': plan.reupd_info.base,
                'requested': plan.reupd_info.requested,
                'available': plan.reupd_info.available,
                'used': plan.reupd_info.used,
                'total': plan.reupd_info.total,
            }
            if plan.reupd_info is not None else None
        ),
    }
