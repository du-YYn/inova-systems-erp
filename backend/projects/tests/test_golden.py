"""F1: golden tests — Python engine vs the ORIGINAL v34 JS simulator.

Fixtures in golden/*.json were extracted by golden_extract.js running the
real compute()+subSteps() of inova-cockpit-v34.html (doc 08 §5.2). They are
the executable spec: exact equality date by date, day by day, flag by flag.
A divergence is ALWAYS a bug in the Python port, never in the fixture.
"""
import json
from datetime import date
from pathlib import Path

import pytest

from projects.scheduling import CronogramaParams, gerar_game_plan

GOLDEN_DIR = Path(__file__).parent / 'golden'
GOLDEN_FILES = sorted(GOLDEN_DIR.glob('*.json'))


def _parse_date(value):
    return date.fromisoformat(value) if value else None


def params_from_fixture(raw: dict) -> CronogramaParams:
    return CronogramaParams(
        prazo_total=raw['prazo_total'],
        modo=raw['modo'],
        data_onboarding=_parse_date(raw['data_onboarding']),
        pct_doc=raw['pct_doc'],
        pct_dev=raw['pct_dev'],
        pct_aud=raw['pct_aud'],
        peso_val=raw['peso_val'],
        peso_hom=raw['peso_hom'],
        peso_ent=raw['peso_ent'],
        reupd_fds=raw['reupd_fds'],
        considerar_carnaval=raw['considerar_carnaval'],
        considerar_corpus=raw['considerar_corpus'],
        data_reuniao_validacao=_parse_date(raw['data_reuniao_validacao']),
        data_reuniao_apresentacao=_parse_date(raw['data_reuniao_apresentacao']),
        data_reuniao_graduacao=_parse_date(raw['data_reuniao_graduacao']),
    )


def plan_to_comparable(plan) -> dict:
    """GamePlan → dict in the exact shape of the golden fixtures."""
    return {
        'capped': plan.capped,
        'total_gap': plan.total_gap,
        'entrega': plan.entrega.isoformat(),
        'entrega_base': plan.entrega_base.isoformat(),
        'fases': [
            {
                'key': f.key,
                'label': f.label,
                'dias': f.dias,
                'pct': f.pct,
                'cum_prev': f.cum_prev,
                'cum_end': f.cum_end,
                'inicio': f.inicio.isoformat(),
                'fim': f.fim.isoformat(),
                'sub_passos': [
                    {
                        'kind': s.kind,
                        'label': s.label,
                        'data': s.data.isoformat(),
                        'pos': s.pos,
                        'single': s.single,
                        'ws': s.ws,
                    }
                    for s in f.sub_passos
                ],
            }
            for f in plan.fases
        ],
        'reunioes': {
            key: {
                'data_natural': r.data_natural.isoformat(),
                'gap': r.gap,
                'marcada': r.data_marcada is not None,
            }
            for key, r in plan.reunioes.items()
        },
        'feriados': [
            {'data': h.data.isoformat(), 'nome': h.nome} for h in plan.feriados
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


def test_golden_fixtures_present():
    """Doc 08 §5.2 requires at least 14 scenarios."""
    assert len(GOLDEN_FILES) >= 14, (
        f'expected >= 14 golden fixtures, found {len(GOLDEN_FILES)} in {GOLDEN_DIR}'
    )


@pytest.mark.parametrize(
    'golden_file', GOLDEN_FILES, ids=[f.stem for f in GOLDEN_FILES]
)
def test_engine_matches_v34_simulator(golden_file):
    fixture = json.loads(golden_file.read_text(encoding='utf-8'))
    params = params_from_fixture(fixture['params'])
    plan = gerar_game_plan(params)
    actual = plan_to_comparable(plan)
    expected = fixture['expected']

    # compare piecewise first for readable failure messages
    assert actual['capped'] == expected['capped']
    assert actual['total_gap'] == expected['total_gap']
    assert actual['entrega'] == expected['entrega']
    assert actual['entrega_base'] == expected['entrega_base']
    assert actual['reunioes'] == expected['reunioes']
    assert actual['feriados'] == expected['feriados']
    assert actual['reupd_info'] == expected['reupd_info']
    assert len(actual['fases']) == len(expected['fases'])
    for actual_fase, expected_fase in zip(actual['fases'], expected['fases']):
        assert actual_fase == expected_fase, (
            f"fase {expected_fase['key']} diverge do simulador v34"
        )
    # belt and suspenders: full equality
    assert actual == expected
