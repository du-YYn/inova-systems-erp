"""F1: business calendar — exact port of the v34 simulator calendar.

Gauss/computus easter, fixed national + SP (9 de julho) holidays, movable
holidays with toggles, business-day predicates and date stepping.
"""
from datetime import date, timedelta
from typing import Dict, Optional

# Fixed holidays: (month, day, name) — national + SP (doc 07 §4)
FIXED_HOLIDAYS = (
    (1, 1, 'Confraternização Universal'),
    (4, 21, 'Tiradentes'),
    (5, 1, 'Dia do Trabalho'),
    (7, 9, 'Revolução Constitucionalista (SP)'),
    (9, 7, 'Independência'),
    (10, 12, 'Nossa Senhora Aparecida'),
    (11, 2, 'Finados'),
    (11, 15, 'Proclamação da República'),
    (11, 20, 'Consciência Negra'),
    (12, 25, 'Natal'),
)

# Guard limits mirror the v34 JS loops (defensive upper bounds).
_GUARD = 100000


def easter(year: int) -> date:
    """Easter Sunday (Gauss/computus) — same formula as the v34 JS."""
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    el = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * el) // 451
    month = (h + el - 7 * m + 114) // 31
    day = ((h + el - 7 * m + 114) % 31) + 1
    return date(year, month, day)


def holiday_map(start_year: int, span: int = 3, *,
                carnaval: bool = True, corpus: bool = True) -> Dict[date, str]:
    """Holiday map covering start_year..start_year+span (inclusive).

    span=3 covers ~3 years past the onboarding year — margin for
    reschedules (doc 07 §4).
    """
    holidays: Dict[date, str] = {}
    for year in range(start_year, start_year + span + 1):
        for month, day, name in FIXED_HOLIDAYS:
            holidays[date(year, month, day)] = name
        easter_day = easter(year)
        holidays[easter_day - timedelta(days=2)] = 'Sexta-feira Santa'
        if carnaval:
            holidays[easter_day - timedelta(days=48)] = 'Carnaval'
            holidays[easter_day - timedelta(days=47)] = 'Carnaval'
        if corpus:
            holidays[easter_day + timedelta(days=60)] = 'Corpus Christi'
    return holidays


def is_business_day(day: date, holidays: Dict[date, str]) -> bool:
    """Mon-Fri and not a holiday."""
    return day.weekday() <= 4 and day not in holidays


def add_business_days(start: date, n: int, holidays: Dict[date, str]) -> date:
    """Advance n business days from start (n=0 returns start)."""
    current = start
    count = 0
    guard = 0
    while count < n and guard < _GUARD:
        current += timedelta(days=1)
        if is_business_day(current, holidays):
            count += 1
        guard += 1
    return current


def add_calendar_days(start: date, n: int) -> date:
    return start + timedelta(days=n)
