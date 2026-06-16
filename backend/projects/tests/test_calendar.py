"""F1: tests for projects/scheduling/calendar.py (pure functions, no DB).

Faithful port of the v34 simulator calendar logic: Gauss easter, fixed
national + SP holidays, movable holidays with toggles, business-day math.
"""
from datetime import date

from projects.scheduling.calendar import (
    add_business_days,
    add_calendar_days,
    easter,
    holiday_map,
    is_business_day,
)


class TestEaster:
    """Gauss/computus algorithm — known dates 2024..2030."""

    def test_known_easter_dates(self):
        assert easter(2024) == date(2024, 3, 31)
        assert easter(2025) == date(2025, 4, 20)
        assert easter(2026) == date(2026, 4, 5)
        assert easter(2027) == date(2027, 3, 28)
        assert easter(2028) == date(2028, 4, 16)
        assert easter(2029) == date(2029, 4, 1)
        assert easter(2030) == date(2030, 4, 21)


class TestHolidayMap:
    def test_fixed_national_and_sp_holidays(self):
        hmap = holiday_map(2026, span=0)
        assert hmap[date(2026, 1, 1)] == 'Confraternização Universal'
        assert hmap[date(2026, 4, 21)] == 'Tiradentes'
        assert hmap[date(2026, 5, 1)] == 'Dia do Trabalho'
        assert hmap[date(2026, 7, 9)] == 'Revolução Constitucionalista (SP)'
        assert hmap[date(2026, 9, 7)] == 'Independência'
        assert hmap[date(2026, 10, 12)] == 'Nossa Senhora Aparecida'
        assert hmap[date(2026, 11, 2)] == 'Finados'
        assert hmap[date(2026, 11, 15)] == 'Proclamação da República'
        assert hmap[date(2026, 11, 20)] == 'Consciência Negra'
        assert hmap[date(2026, 12, 25)] == 'Natal'

    def test_movable_holidays_2026(self):
        hmap = holiday_map(2026, span=0)
        # Easter 2026-04-05
        assert hmap[date(2026, 4, 3)] == 'Sexta-feira Santa'
        assert hmap[date(2026, 2, 16)] == 'Carnaval'
        assert hmap[date(2026, 2, 17)] == 'Carnaval'
        assert hmap[date(2026, 6, 4)] == 'Corpus Christi'

    def test_carnaval_toggle_off(self):
        hmap = holiday_map(2026, span=0, carnaval=False)
        assert date(2026, 2, 16) not in hmap
        assert date(2026, 2, 17) not in hmap
        # other movables still present
        assert date(2026, 4, 3) in hmap
        assert date(2026, 6, 4) in hmap

    def test_corpus_toggle_off(self):
        hmap = holiday_map(2026, span=0, corpus=False)
        assert date(2026, 6, 4) not in hmap
        assert date(2026, 2, 16) in hmap

    def test_span_covers_following_years(self):
        # span=3 → years 2026..2029 inclusive (~3 years of margin)
        hmap = holiday_map(2026, span=3)
        for year in (2026, 2027, 2028, 2029):
            assert hmap[date(year, 12, 25)] == 'Natal'
        assert date(2030, 12, 25) not in hmap


class TestIsBusinessDay:
    def test_weekend_is_not_business_day(self):
        hmap = holiday_map(2026, span=0)
        assert is_business_day(date(2026, 6, 13), hmap) is False  # Saturday
        assert is_business_day(date(2026, 6, 14), hmap) is False  # Sunday

    def test_holiday_is_not_business_day(self):
        hmap = holiday_map(2026, span=0)
        assert is_business_day(date(2026, 7, 9), hmap) is False  # SP holiday (Thu)

    def test_regular_weekday_is_business_day(self):
        hmap = holiday_map(2026, span=0)
        assert is_business_day(date(2026, 6, 10), hmap) is True  # Wednesday


class TestAddBusinessDays:
    def test_zero_returns_start(self):
        hmap = holiday_map(2026, span=0)
        assert add_business_days(date(2026, 6, 10), 0, hmap) == date(2026, 6, 10)

    def test_simple_next_day(self):
        hmap = holiday_map(2026, span=0)
        assert add_business_days(date(2026, 6, 10), 1, hmap) == date(2026, 6, 11)

    def test_crosses_weekend(self):
        hmap = holiday_map(2026, span=0)
        # Friday + 1 business day = Monday
        assert add_business_days(date(2026, 6, 12), 1, hmap) == date(2026, 6, 15)

    def test_crosses_sp_holiday(self):
        hmap = holiday_map(2026, span=0)
        # Wed Jul 8 + 1 → skips Thu Jul 9 (Revolução Constitucionalista) → Fri Jul 10
        assert add_business_days(date(2026, 7, 8), 1, hmap) == date(2026, 7, 10)

    def test_crosses_christmas_and_new_year(self):
        hmap = holiday_map(2026, span=1)
        # Thu Dec 24 + 1 → skips Fri Dec 25 (Natal) + weekend → Mon Dec 28
        assert add_business_days(date(2026, 12, 24), 1, hmap) == date(2026, 12, 28)
        # Thu Dec 31 + 1 → skips Fri Jan 1 + weekend → Mon Jan 4
        assert add_business_days(date(2026, 12, 31), 1, hmap) == date(2027, 1, 4)

    def test_multiple_days(self):
        hmap = holiday_map(2026, span=0)
        # 8 business days after Wed 2026-06-10 → Mon 2026-06-22
        assert add_business_days(date(2026, 6, 10), 8, hmap) == date(2026, 6, 22)


class TestAddCalendarDays:
    def test_simple(self):
        assert add_calendar_days(date(2026, 6, 10), 5) == date(2026, 6, 15)

    def test_crosses_month(self):
        assert add_calendar_days(date(2026, 6, 28), 5) == date(2026, 7, 3)

    def test_zero(self):
        assert add_calendar_days(date(2026, 6, 10), 0) == date(2026, 6, 10)
