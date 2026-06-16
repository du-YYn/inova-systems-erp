"""F1: sub-steps per phase — exact port of the v34 SUBS dict + subSteps().

Three kinds: 'bloco' (fraction of the phase by weight ``w``, one row per
worked day, last block absorbs the remainder), 'marco' (milestone at
start/end/here) and 'recorrente' (weekly, Fridays, skipping holidays in
``uteis`` mode). The hom 're-update' block carries ``crunch``: weekend days
inside its interval can be added as extra worked rows (doc 07 §7).
"""
import math
from datetime import date, timedelta
from typing import Callable, Dict, List, Optional, Tuple

from .types import MODO_UTEIS, ReUpdateInfo, SubPasso

# Identical to the v34 simulator (doc 07 §6).
SUBS = {
    'doc': [
        {'t': 'bloco', 'l': 'Produção da documentação', 'w': 60},
        {'t': 'bloco', 'l': 'Design e wireframes', 'w': 25},
        {'t': 'bloco', 'l': 'Revisão interna e apresentação', 'w': 15},
        {'t': 'marco', 'l': 'Documentação pronta pra validar', 'at': 'end'},
        {'t': 'marco', 'l': 'Agendar a reunião de validação com o cliente', 'at': 'end'},
    ],
    'val': [
        {'t': 'marco', 'l': 'Reunião de validação com o cliente (refina ou muda)', 'at': 'start'},
        {'t': 'bloco', 'l': 'Dev ajusta a documentação e envia ao Jurídico', 'w': 100},
        {'t': 'marco', 'l': 'Cliente assina, baseline oficial', 'at': 'end'},
    ],
    'dev': [
        {'t': 'marco', 'l': 'Início (quebra a documentação em fases)', 'at': 'start'},
        {'t': 'recorrente', 'l': 'Atualização semanal pro cliente', 'dia': 5},
        {'t': 'marco', 'l': 'Desenvolvimento concluído, pronto pra auditoria', 'at': 'end'},
    ],
    'aud': [
        {'t': 'bloco', 'l': 'Testes (fluxos, regras, permissões, integrações, design)', 'w': 60},
        {'t': 'bloco', 'l': 'Correção dos bugs encontrados', 'w': 40},
        {'t': 'marco', 'l': 'Auditoria aprovada, reunião de apresentação agendada', 'at': 'end'},
    ],
    'hom': [
        {'t': 'marco', 'l': 'Apresentação e liberação do acesso', 'at': 'start'},
        {'t': 'bloco', 'l': 'Janela de teste do cliente', 'w': 55},
        {'t': 'bloco', 'l': 're-update', 'w': 45, 'crunch': True},
        {'t': 'marco', 'l': 'Cliente aprovou', 'at': 'end'},
    ],
    'ent': [
        {'t': 'marco', 'l': 'Registro da versão entregue (release, baseline, deploy)', 'at': 'start'},
        {'t': 'marco', 'l': 'Graduação (Fechado) ou subida no ambiente (Recorrente)', 'at': 'here'},
        {'t': 'marco', 'l': 'Plano de recorrência definido e passagem pro suporte', 'at': 'end'},
    ],
}


def _js_round(x: float) -> int:
    """JS Math.round for non-negative values: half rounds up."""
    return math.floor(x + 0.5)


def expand_substeps(
    phase_key: str,
    cum_prev: int,
    days: int,
    *,
    data_onboarding: date,
    modo: str,
    holidays: Optional[Dict[date, str]],
    reupd_fds: int,
    add_x: Callable[[date, int], date],
    delay_antes: Callable[[int], int],
) -> Tuple[List[SubPasso], Optional[ReUpdateInfo]]:
    """Dated sub-steps of one phase — port of v34 subSteps(pkey,cumPrev,D,ctx).

    Returns (steps, reupd_info). reupd_info is non-None whenever a crunch
    block was processed (even with 0 weekend days applied).
    """
    defs = SUBS.get(phase_key, [])

    def at(offset: int) -> date:
        return add_x(data_onboarding, offset + delay_antes(offset))

    blocks = [s for s in defs if s['t'] == 'bloco']
    total_weight = sum(s['w'] for s in blocks) or 1
    block_days: List[int] = []
    assigned = 0
    for idx, block in enumerate(blocks):
        if idx == len(blocks) - 1:
            value = days - assigned          # last absorbs the remainder
        else:
            value = max(0, _js_round(days * block['w'] / total_weight))
        block_days.append(value)
        assigned += value

    out: List[SubPasso] = []
    reupd_info: Optional[ReUpdateInfo] = None
    offset = 0
    block_index = 0

    for step in defs:
        if step['t'] == 'bloco':
            dd = block_days[block_index]
            block_index += 1
            block_offset = offset
            offset += dd
            rows = [
                {'date': at(cum_prev + block_offset + di), 'ws': False}
                for di in range(1, dd + 1)
            ]
            if step.get('crunch'):
                available = 0
                used = 0
                if modo == MODO_UTEIS and dd > 0 and reupd_fds > 0:
                    start_date = rows[0]['date']
                    end_date = rows[dd - 1]['date']
                    weekends: List[date] = []
                    current = start_date
                    guard = 0
                    while guard < 400:
                        current = current + timedelta(days=1)
                        if current >= end_date:
                            break
                        if current.weekday() >= 5:   # Sat/Sun
                            weekends.append(current)
                        guard += 1
                    available = len(weekends)
                    used = min(reupd_fds, available)
                    for wi in range(used):
                        rows.append({'date': weekends[wi], 'ws': True})
                    rows.sort(key=lambda r: r['date'])
                reupd_info = ReUpdateInfo(
                    base=dd,
                    requested=reupd_fds,
                    available=available,
                    used=used,
                    total=dd + used,
                )
            nn = len(rows)
            for ix, row in enumerate(rows):
                pos = 'ini' if ix == 0 else ('fim' if ix == nn - 1 else 'mid')
                out.append(SubPasso(
                    kind='bloco', label=step['l'], data=row['date'],
                    pos=pos, single=nn == 1, ws=row['ws'],
                ))
        elif step['t'] == 'marco':
            if step['at'] == 'start':
                idx = 1
            elif step['at'] == 'end':
                idx = days
            else:  # 'here'
                idx = offset if offset > 0 else max(1, _js_round(days / 2))
            out.append(SubPasso(kind='marco', label=step['l'],
                                data=at(cum_prev + idx)))
        elif step['t'] == 'recorrente':
            first = at(cum_prev + 1)
            last = at(cum_prev + days)
            current = first
            guard = 0
            target_weekday = step.get('dia', 5) % 7   # JS getDay(): 5 = Friday
            while current <= last and guard < 3000:
                # JS getDay(): Sun=0..Sat=6; Python weekday(): Mon=0..Sun=6
                js_day = (current.weekday() + 1) % 7
                if js_day == target_weekday:
                    skip = (modo == MODO_UTEIS and holidays is not None
                            and current in holidays)
                    if not skip:
                        out.append(SubPasso(kind='rec', label=step['l'],
                                            data=current))
                current = current + timedelta(days=1)
                guard += 1

    return out, reupd_info
