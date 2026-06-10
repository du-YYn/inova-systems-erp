"""F1: Game Plan engine — faithful port of the v34 simulator compute().

``gerar_game_plan(params)`` is a pure function: same input → same output,
no I/O, no ``datetime.now()``. Fidelity to the simulator wins over
"prettier" math — including JS Math.round semantics and the fine-adjustment
loop that may leave the phase sum above the deadline for tiny prazos
(golden tests pin this behavior).
"""
import math
from dataclasses import dataclass
from datetime import date, timedelta
from functools import partial
from typing import Callable, Dict, Optional, Tuple

from .calendar import add_business_days, add_calendar_days, holiday_map
from .substeps import expand_substeps
from .types import (
    MODO_UTEIS,
    CronogramaParams,
    Fase,
    Feriado,
    GamePlan,
    ReuniaoCliente,
    ReUpdateInfo,
)

PISO_AUTO = 3
PHASE_ORDER = ('doc', 'val', 'dev', 'aud', 'hom', 'ent')

# key → (label, ajustavel/ctrl, is_dev, is_end)
PHASE_DEFS = {
    'doc': ('Documentação', True, False, False),
    'val': ('Validação e assinatura', False, False, False),
    'dev': ('Desenvolvimento', True, True, False),
    'aud': ('Auditoria interna', True, False, False),
    'hom': ('Homologação', False, False, False),
    'ent': ('Entrega ou Implementação', False, False, True),
}

_GUARD = 100000


def js_round(x: float) -> int:
    """JS Math.round for non-negative values: half rounds up (2.5 → 3)."""
    return math.floor(x + 0.5)


def distribute_days(params: CronogramaParams) -> Tuple[Dict[str, int], bool]:
    """Distribute prazo_total across the 6 phases (doc 07 §3).

    Returns ({'doc': d, 'val': d, ...}, capped).
    """
    total = params.prazo_total
    doc_d = js_round(total * params.pct_doc / 100)
    dev_d = js_round(total * params.pct_dev / 100)
    aud_d = js_round(total * params.pct_aud / 100)

    capped = False
    controlled = doc_d + dev_d + aud_d
    if controlled > total - PISO_AUTO:
        scale = (total - PISO_AUTO) / controlled
        doc_d = max(0, js_round(doc_d * scale))
        dev_d = max(1, js_round(dev_d * scale))
        aud_d = max(0, js_round(aud_d * scale))
        controlled = doc_d + dev_d + aud_d
        capped = True

    rem = max(0, total - controlled)
    wsum = params.peso_val + params.peso_hom + params.peso_ent
    if wsum <= 0:
        wsum = 1
    auto = {
        'val': max(1, js_round(rem * params.peso_val / wsum)),
        'hom': max(1, js_round(rem * params.peso_hom / wsum)),
        'ent': max(1, js_round(rem * params.peso_ent / wsum)),
    }

    # Fine adjustment (v34): surplus → hom; deficit taken from hom/val/ent
    # while value > 1 — break when no candidate (sum may stay above total).
    diff = total - (doc_d + dev_d + aud_d + auto['val'] + auto['hom'] + auto['ent'])
    guard = 0
    while diff != 0 and guard < 5000:
        if diff > 0:
            auto['hom'] += 1
            diff -= 1
        else:
            candidate = next((k for k in ('hom', 'val', 'ent') if auto[k] > 1), None)
            if candidate is None:
                break
            auto[candidate] -= 1
            diff += 1
        guard += 1

    return (
        {'doc': doc_d, 'val': auto['val'], 'dev': dev_d,
         'aud': aud_d, 'hom': auto['hom'], 'ent': auto['ent']},
        capped,
    )


@dataclass(frozen=True)
class MeetingGaps:
    """Offsets, natural dates and cumulative gaps of the 3 client meetings."""

    off_v: int
    off_a: int
    off_g: int
    nat_v: date
    nat_a: date
    nat_g: date
    gap_v: int
    gap_a: int
    gap_g: int

    @property
    def total_gap(self) -> int:
        return self.gap_v + self.gap_a + self.gap_g

    def delay_antes(self, offset: int) -> int:
        """Accumulated delay applied to a day-offset (doc 07 §8)."""
        return (
            (self.gap_v if offset >= self.off_v else 0)
            + (self.gap_a if offset >= self.off_a else 0)
            + (self.gap_g if offset >= self.off_g else 0)
        )


def _steps_between(start: date, target: Optional[date],
                   one_step: Callable[[date], date]) -> int:
    """Counting steps from start until landing on/after target (v34)."""
    if target is None or target <= start:
        return 0
    current = start
    steps = 0
    guard = 0
    while current < target and guard < _GUARD:
        current = one_step(current)
        steps += 1
        guard += 1
    return steps


def compute_meeting_gaps(
    params: CronogramaParams,
    cum_prev: Dict[str, int],
    days: Dict[str, int],
    add_x: Callable[[date, int], date],
) -> MeetingGaps:
    """Meeting reschedules: cumulative gaps offV → offA → offG (doc 07 §8)."""
    onb = params.data_onboarding
    off_v = cum_prev['val'] + 1
    off_a = cum_prev['hom'] + 1
    grad_idx = max(1, js_round(days['ent'] / 2))
    off_g = cum_prev['ent'] + grad_idx

    def one_step(d: date) -> date:
        return add_x(d, 1)

    nat_v = add_x(onb, off_v)
    gap_v = _steps_between(nat_v, params.data_reuniao_validacao, one_step)
    nat_a = add_x(onb, off_a + gap_v)
    gap_a = _steps_between(nat_a, params.data_reuniao_apresentacao, one_step)
    nat_g = add_x(onb, off_g + gap_v + gap_a)
    gap_g = _steps_between(nat_g, params.data_reuniao_graduacao, one_step)

    return MeetingGaps(
        off_v=off_v, off_a=off_a, off_g=off_g,
        nat_v=nat_v, nat_a=nat_a, nat_g=nat_g,
        gap_v=gap_v, gap_a=gap_a, gap_g=gap_g,
    )


def date_phases(
    fases: Dict[str, Fase],
    gaps: MeetingGaps,
    add_x: Callable[[date, int], date],
    onb: date,
) -> None:
    """Set inicio/fim on each phase applying meeting delays (doc 07 §5)."""
    for fase in fases.values():
        start_offset = fase.cum_prev + 1
        fase.inicio = add_x(onb, start_offset + gaps.delay_antes(start_offset))
        fase.fim = add_x(onb, fase.cum_end + gaps.delay_antes(fase.cum_end))


def gerar_game_plan(params: CronogramaParams) -> GamePlan:
    """Generate the full Game Plan (doc 07) — pure function."""
    days, capped = distribute_days(params)

    holidays = None
    if params.modo == MODO_UTEIS:
        holidays = holiday_map(
            params.data_onboarding.year, 3,
            carnaval=params.considerar_carnaval,
            corpus=params.considerar_corpus,
        )
        add_x = partial(add_business_days, holidays=holidays)
    else:
        add_x = add_calendar_days

    fases: Dict[str, Fase] = {}
    cum = 0
    for key in PHASE_ORDER:
        label, ajustavel, is_dev, is_end = PHASE_DEFS[key]
        if key == 'doc':
            pct = params.pct_doc
        elif key == 'dev':
            pct = params.pct_dev
        elif key == 'aud':
            pct = params.pct_aud
        else:
            pct = js_round(days[key] / params.prazo_total * 100) if params.prazo_total else 0
        fase = Fase(key=key, label=label, dias=days[key], pct=pct,
                    ajustavel=ajustavel, is_dev=is_dev, is_end=is_end)
        fase.cum_prev = cum
        cum += fase.dias
        fase.cum_end = cum
        fases[key] = fase

    cum_prev = {key: fases[key].cum_prev for key in PHASE_ORDER}
    gaps = compute_meeting_gaps(params, cum_prev, days, add_x)
    date_phases(fases, gaps, add_x, params.data_onboarding)

    entrega_base = add_x(params.data_onboarding, params.prazo_total)
    entrega = add_x(params.data_onboarding, params.prazo_total + gaps.total_gap)

    reupd_info: Optional[ReUpdateInfo] = None
    for key in PHASE_ORDER:
        fase = fases[key]
        steps, info = expand_substeps(
            key, fase.cum_prev, fase.dias,
            data_onboarding=params.data_onboarding,
            modo=params.modo,
            holidays=holidays,
            reupd_fds=params.reupd_fds,
            add_x=add_x,
            delay_antes=gaps.delay_antes,
        )
        fase.sub_passos = steps
        if info is not None:
            reupd_info = info

    feriados = []
    if params.modo == MODO_UTEIS:
        current = params.data_onboarding
        guard = 0
        while guard < _GUARD:
            current = current + timedelta(days=1)
            if current > entrega:
                break
            name = holidays.get(current)
            if name and current.weekday() <= 4:
                feriados.append(Feriado(data=current, nome=name))
            guard += 1

    reunioes = {
        'val': ReuniaoCliente(key='val', data_natural=gaps.nat_v,
                              data_marcada=params.data_reuniao_validacao,
                              gap=gaps.gap_v),
        'apr': ReuniaoCliente(key='apr', data_natural=gaps.nat_a,
                              data_marcada=params.data_reuniao_apresentacao,
                              gap=gaps.gap_a),
        'grad': ReuniaoCliente(key='grad', data_natural=gaps.nat_g,
                               data_marcada=params.data_reuniao_graduacao,
                               gap=gaps.gap_g),
    }

    unit = 'dias úteis' if params.modo == MODO_UTEIS else 'dias corridos'
    avisos = []
    if capped:
        avisos.append(
            'A soma dos tempos ajustáveis passou do prazo. '
            'Os valores foram reduzidos pra caber. '
            'Diminua algum pra ter controle exato.'
        )
    if (params.modo == MODO_UTEIS and reupd_info is not None
            and reupd_info.requested > reupd_info.available):
        avisos.append(
            f'O re-update pediu {reupd_info.requested} dia(s) de fim de semana, '
            f'mas só cabem {reupd_info.available} nesse intervalo. '
            f'Apliquei {reupd_info.used}. Pra mais que isso, a entrega teria '
            'que mudar ou outra fase encurtar.'
        )
    if gaps.total_gap > 0:
        avisos.append(
            f'Reunião remarcada com o cliente: o prazo estendeu '
            f'{gaps.total_gap} {unit}. A entrega era '
            f'{entrega_base.strftime("%d/%m/%Y")} e passou pra '
            f'{entrega.strftime("%d/%m/%Y")}.'
        )

    return GamePlan(
        params=params,
        fases=[fases[key] for key in PHASE_ORDER],
        entrega=entrega,
        entrega_base=entrega_base,
        total_gap=gaps.total_gap,
        capped=capped,
        reunioes=reunioes,
        feriados=feriados,
        reupd_info=reupd_info,
        avisos=avisos,
    )
