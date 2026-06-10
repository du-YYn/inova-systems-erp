"""F1: tests for engine.compute_meeting_gaps() — meeting rescheduling.

offV/offA/offG offsets, cumulative gaps (val pushes apr which pushes grad),
delay_antes per offset, dates earlier than the natural date are ignored.
"""
from datetime import date
from functools import partial

from projects.scheduling.calendar import add_business_days, holiday_map
from projects.scheduling.engine import compute_meeting_gaps, distribute_days
from projects.scheduling.types import CronogramaParams

ONB = date(2026, 6, 10)


def build(params):
    """Helper: distribution + cum offsets + add_x for the given params."""
    days, _ = distribute_days(params)
    cum_prev = {}
    cum = 0
    for key in ('doc', 'val', 'dev', 'aud', 'hom', 'ent'):
        cum_prev[key] = cum
        cum += days[key]
    hmap = holiday_map(params.data_onboarding.year, 3,
                       carnaval=params.considerar_carnaval,
                       corpus=params.considerar_corpus)
    add_x = partial(add_business_days, holidays=hmap)
    return days, cum_prev, add_x


def make_params(**kwargs):
    defaults = dict(data_onboarding=ONB)
    defaults.update(kwargs)
    return CronogramaParams(**defaults)


class TestOffsets:
    def test_default_offsets(self):
        # default: doc 7, val 2, dev 23, aud 4, hom 7, ent 2
        params = make_params()
        days, cum_prev, add_x = build(params)
        gaps = compute_meeting_gaps(params, cum_prev, days, add_x)
        assert gaps.off_v == 8    # cum_prev val (7) + 1
        assert gaps.off_a == 37   # cum_prev hom (36) + 1
        assert gaps.off_g == 44   # cum_prev ent (43) + max(1, round(2/2))

    def test_natural_dates(self):
        params = make_params()
        days, cum_prev, add_x = build(params)
        gaps = compute_meeting_gaps(params, cum_prev, days, add_x)
        assert gaps.nat_v == date(2026, 6, 22)  # onb + 8 business days
        assert gaps.nat_a == date(2026, 8, 3)   # onb + 37 business days
        assert gaps.nat_g == date(2026, 8, 12)  # onb + 44 business days


class TestGaps:
    def test_no_dates_no_gaps(self):
        params = make_params()
        days, cum_prev, add_x = build(params)
        gaps = compute_meeting_gaps(params, cum_prev, days, add_x)
        assert (gaps.gap_v, gaps.gap_a, gaps.gap_g) == (0, 0, 0)
        assert gaps.total_gap == 0

    def test_date_before_natural_is_ignored(self):
        params = make_params(data_reuniao_validacao=date(2026, 6, 19))
        days, cum_prev, add_x = build(params)
        gaps = compute_meeting_gaps(params, cum_prev, days, add_x)
        assert gaps.gap_v == 0
        assert gaps.total_gap == 0

    def test_date_equal_natural_is_ignored(self):
        params = make_params(data_reuniao_validacao=date(2026, 6, 22))
        days, cum_prev, add_x = build(params)
        gaps = compute_meeting_gaps(params, cum_prev, days, add_x)
        assert gaps.gap_v == 0

    def test_validation_gap(self):
        # natural Mon 2026-06-22; rescheduled to Wed 2026-06-24 → 2 business days
        params = make_params(data_reuniao_validacao=date(2026, 6, 24))
        days, cum_prev, add_x = build(params)
        gaps = compute_meeting_gaps(params, cum_prev, days, add_x)
        assert gaps.gap_v == 2
        assert gaps.total_gap == 2
        # natural apresentação shifts with gapV: onb + (37+2) business days
        assert gaps.nat_a == add_x(ONB, 39)

    def test_gap_counts_steps_landing_on_or_after_target(self):
        # natural Mon 2026-06-22; target Sat 2026-06-27 (not a business day)
        # steps: 23, 24, 25, 26, 29 → 5th step passes the target → gap 5
        params = make_params(data_reuniao_validacao=date(2026, 6, 27))
        days, cum_prev, add_x = build(params)
        gaps = compute_meeting_gaps(params, cum_prev, days, add_x)
        assert gaps.gap_v == 5

    def test_cumulative_gaps(self):
        # gapV=2 → natA = onb+39; reschedule apr +1 → natG = onb+(44+2+1)
        params = make_params(
            data_reuniao_validacao=date(2026, 6, 24),
            data_reuniao_apresentacao=None,
            data_reuniao_graduacao=None,
        )
        days, cum_prev, add_x = build(params)
        gaps = compute_meeting_gaps(params, cum_prev, days, add_x)
        nat_a_shifted = gaps.nat_a
        params2 = make_params(
            data_reuniao_validacao=date(2026, 6, 24),
            data_reuniao_apresentacao=add_x(nat_a_shifted, 1),
        )
        gaps2 = compute_meeting_gaps(params2, cum_prev, days, add_x)
        assert gaps2.gap_v == 2
        assert gaps2.gap_a == 1
        assert gaps2.nat_g == add_x(ONB, 44 + 2 + 1)
        assert gaps2.total_gap == 3

    def test_all_three_gaps_sum(self):
        params = make_params(data_reuniao_validacao=date(2026, 6, 24))
        days, cum_prev, add_x = build(params)
        g1 = compute_meeting_gaps(params, cum_prev, days, add_x)
        apr = add_x(g1.nat_a, 2)
        params = make_params(
            data_reuniao_validacao=date(2026, 6, 24),
            data_reuniao_apresentacao=apr,
        )
        g2 = compute_meeting_gaps(params, cum_prev, days, add_x)
        grad = add_x(g2.nat_g, 3)
        params = make_params(
            data_reuniao_validacao=date(2026, 6, 24),
            data_reuniao_apresentacao=apr,
            data_reuniao_graduacao=grad,
        )
        g3 = compute_meeting_gaps(params, cum_prev, days, add_x)
        assert (g3.gap_v, g3.gap_a, g3.gap_g) == (2, 2, 3)
        assert g3.total_gap == 7


class TestDelayAntes:
    def test_delay_before_each_offset(self):
        params = make_params(data_reuniao_validacao=date(2026, 6, 24))
        days, cum_prev, add_x = build(params)
        gaps = compute_meeting_gaps(params, cum_prev, days, add_x)
        assert gaps.delay_antes(7) == 0    # before offV
        assert gaps.delay_antes(8) == 2    # at offV
        assert gaps.delay_antes(37) == 2   # at offA (no apr gap)
        assert gaps.delay_antes(45) == 2

    def test_delay_accumulates(self):
        days, cum_prev, add_x = build(make_params())
        params = make_params(
            data_reuniao_validacao=date(2026, 6, 24),       # gapV=2
            data_reuniao_apresentacao=add_x(ONB, 40),       # natA=onb+39 → gapA=1
        )
        gaps = compute_meeting_gaps(params, cum_prev, days, add_x)
        assert gaps.gap_v == 2
        assert gaps.gap_a == 1
        assert gaps.delay_antes(8) == 2
        assert gaps.delay_antes(36) == 2
        assert gaps.delay_antes(37) == 3
        assert gaps.delay_antes(44) == 3
