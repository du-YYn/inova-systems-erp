"""F1 · Motor de Cronograma (Game Plan).

Pure-function port of the v34 simulator (inova-cockpit-v34.html):
``gerar_game_plan(params)`` — same input, same output, no I/O, no now().

Public API:
    gerar_game_plan, CronogramaParams, GamePlan
"""
from .engine import gerar_game_plan
from .types import (
    CronogramaParams,
    Fase,
    Feriado,
    GamePlan,
    ReuniaoCliente,
    ReUpdateInfo,
    SubPasso,
)

__all__ = [
    'gerar_game_plan',
    'CronogramaParams',
    'GamePlan',
    'Fase',
    'SubPasso',
    'ReuniaoCliente',
    'ReUpdateInfo',
    'Feriado',
]
