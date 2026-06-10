"""F1: tests for engine.distribute_days() — exact replica of v34 compute().

Includes JS rounding semantics (Math.round = floor(x+0.5)), PISO_AUTO=3,
capped rescale and the fine adjustment loop (surplus → hom; deficit taken
from hom/val/ent while value > 1, break when no candidate).
"""
from datetime import date

from projects.scheduling.engine import distribute_days, js_round
from projects.scheduling.types import CronogramaParams


def make_params(**kwargs):
    defaults = dict(data_onboarding=date(2026, 6, 10))
    defaults.update(kwargs)
    return CronogramaParams(**defaults)


class TestJsRound:
    def test_half_rounds_up(self):
        # JS Math.round(2.5) == 3 — Python round(2.5) == 2 would break fidelity
        assert js_round(2.5) == 3
        assert js_round(0.5) == 1
        assert js_round(1.5) == 2

    def test_below_half_rounds_down(self):
        assert js_round(2.4) == 2
        assert js_round(0.37) == 0


class TestDistributeDefault:
    def test_default_45_uteis(self):
        days, capped = distribute_days(make_params())
        assert days == {'doc': 7, 'val': 2, 'dev': 23, 'aud': 4, 'hom': 7, 'ent': 2}
        assert sum(days.values()) == 45
        assert capped is False

    def test_mode_does_not_affect_distribution(self):
        days_u, _ = distribute_days(make_params(modo='uteis'))
        days_c, _ = distribute_days(make_params(modo='corridos'))
        assert days_u == days_c


class TestDistributeCapped:
    def test_capped_30_70_25(self):
        # 30+70+25 = 125% of 45 → 14+32+11=57 > 42 → rescale by 42/57
        days, capped = distribute_days(
            make_params(pct_doc=30, pct_dev=70, pct_aud=25)
        )
        assert capped is True
        assert days == {'doc': 10, 'val': 1, 'dev': 24, 'aud': 8, 'hom': 1, 'ent': 1}
        assert sum(days.values()) == 45

    def test_not_capped_at_exact_boundary(self):
        # controlled == prazo - PISO_AUTO is NOT capped (strict >)
        # 45: need doc+dev+aud == 42 → 20% (9) + 60% (27) + 13% (6) = 42
        days, capped = distribute_days(
            make_params(pct_doc=20, pct_dev=60, pct_aud=13)
        )
        assert capped is False
        assert days['doc'] + days['dev'] + days['aud'] == 42


class TestFineAdjustment:
    def test_surplus_goes_to_hom(self):
        # total=10, 0/20/0: doc=0 dev=2 aud=0; rem=8 w 5/17/5:
        # val=1 hom=5 ent=1 → sum 9, diff +1 → hom 6
        days, capped = distribute_days(
            make_params(prazo_total=10, pct_doc=0, pct_dev=20, pct_aud=0)
        )
        assert days == {'doc': 0, 'val': 1, 'dev': 2, 'aud': 0, 'hom': 6, 'ent': 1}
        assert sum(days.values()) == 10
        assert capped is False

    def test_deficit_breaks_when_no_candidate_above_one(self):
        # prazo=5 (mínimo): replica fielmente o v34 — quando hom/val/ent
        # estão todos em 1, o loop quebra e a soma fica ACIMA do prazo (6).
        days, capped = distribute_days(make_params(prazo_total=5))
        assert capped is True
        assert days == {'doc': 1, 'val': 1, 'dev': 2, 'aud': 0, 'hom': 1, 'ent': 1}
        assert sum(days.values()) == 6  # fidelidade > soma exata


class TestParamRanges:
    def test_prazo_below_min_rejected(self):
        try:
            make_params(prazo_total=4)
            assert False, 'should have raised'
        except ValueError:
            pass

    def test_prazo_above_max_rejected(self):
        try:
            make_params(prazo_total=401)
            assert False, 'should have raised'
        except ValueError:
            pass

    def test_pct_ranges(self):
        for kwargs in (
            {'pct_doc': 41}, {'pct_doc': -1},
            {'pct_dev': 19}, {'pct_dev': 81},
            {'pct_aud': 31}, {'pct_aud': -1},
        ):
            try:
                make_params(**kwargs)
                assert False, f'should have raised for {kwargs}'
            except ValueError:
                pass

    def test_peso_ranges(self):
        for kwargs in (
            {'peso_val': 0}, {'peso_val': 61},
            {'peso_hom': 0}, {'peso_hom': 61},
            {'peso_ent': 0}, {'peso_ent': 61},
        ):
            try:
                make_params(**kwargs)
                assert False, f'should have raised for {kwargs}'
            except ValueError:
                pass

    def test_reupd_range(self):
        for value in (-1, 9):
            try:
                make_params(reupd_fds=value)
                assert False, f'should have raised for {value}'
            except ValueError:
                pass

    def test_modo_invalid(self):
        try:
            make_params(modo='mensal')
            assert False, 'should have raised'
        except ValueError:
            pass

    def test_valid_boundaries_accepted(self):
        make_params(prazo_total=5)
        make_params(prazo_total=400)
        make_params(pct_doc=0, pct_dev=20, pct_aud=0)
        make_params(pct_doc=40, pct_dev=80, pct_aud=30)
        make_params(peso_val=1, peso_hom=1, peso_ent=1)
        make_params(peso_val=60, peso_hom=60, peso_ent=60)
        make_params(reupd_fds=8)
