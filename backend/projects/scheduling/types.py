"""F1: dataclasses of the scheduling engine (validated parameter ranges).

All dates are timezone-naive ``datetime.date`` (Brasil-only, doc 07 §1).
``CronogramaParams`` mirrors doc 07 §2 — invalid ranges raise ValueError.
"""
from dataclasses import dataclass, field
from datetime import date
from typing import Optional

MODO_UTEIS = 'uteis'
MODO_CORRIDOS = 'corridos'
MODOS = (MODO_UTEIS, MODO_CORRIDOS)

# (field, min, max) — doc 07 §2
_RANGES = (
    ('prazo_total', 5, 400),
    ('pct_doc', 0, 40),
    ('pct_dev', 20, 80),
    ('pct_aud', 0, 30),
    ('peso_val', 1, 60),
    ('peso_hom', 1, 60),
    ('peso_ent', 1, 60),
    ('reupd_fds', 0, 8),
)


@dataclass(frozen=True)
class CronogramaParams:
    """Input parameters of the Game Plan engine (doc 07 §2)."""

    data_onboarding: date                       # Dia 0
    prazo_total: int = 45                       # 5..400
    modo: str = MODO_UTEIS                      # uteis | corridos
    pct_doc: int = 15                           # 0..40
    pct_dev: int = 50                           # 20..80
    pct_aud: int = 8                            # 0..30
    peso_val: int = 5                           # 1..60
    peso_hom: int = 17                          # 1..60
    peso_ent: int = 5                           # 1..60
    reupd_fds: int = 0                          # 0..8
    considerar_carnaval: bool = True
    considerar_corpus: bool = True
    data_reuniao_validacao: Optional[date] = None
    data_reuniao_apresentacao: Optional[date] = None
    data_reuniao_graduacao: Optional[date] = None

    def __post_init__(self):
        for name, lo, hi in _RANGES:
            value = getattr(self, name)
            if not isinstance(value, int) or isinstance(value, bool):
                raise ValueError(f'{name} deve ser inteiro')
            if not lo <= value <= hi:
                raise ValueError(f'{name} fora da faixa {lo}..{hi}: {value}')
        if self.modo not in MODOS:
            raise ValueError(f"modo deve ser 'uteis' ou 'corridos': {self.modo}")
        if not isinstance(self.data_onboarding, date):
            raise ValueError('data_onboarding deve ser date')


@dataclass(frozen=True)
class SubPasso:
    """One dated sub-step row of a phase.

    kind: 'bloco' (one row per worked day), 'marco' (milestone) or
    'rec' (weekly recurrence). ``pos``/``single``/``ws`` only apply to blocks
    (ws = weekend crunch day).
    """

    kind: str
    label: str
    data: date
    pos: Optional[str] = None       # 'ini' | 'mid' | 'fim' (blocks only)
    single: bool = False
    ws: bool = False


@dataclass
class Fase:
    """A dated phase of the Game Plan."""

    key: str
    label: str
    dias: int
    pct: int
    cum_prev: int = 0
    cum_end: int = 0
    inicio: Optional[date] = None
    fim: Optional[date] = None
    ajustavel: bool = False         # ctrl no v34 (doc/dev/aud)
    is_dev: bool = False
    is_end: bool = False
    sub_passos: list = field(default_factory=list)


@dataclass(frozen=True)
class ReuniaoCliente:
    """A client meeting: natural (calculated) date + applied delay."""

    key: str                        # 'val' | 'apr' | 'grad'
    data_natural: date
    data_marcada: Optional[date] = None
    gap: int = 0

    @property
    def remarcada(self) -> bool:
        return self.gap > 0


@dataclass(frozen=True)
class Feriado:
    data: date
    nome: str


@dataclass(frozen=True)
class ReUpdateInfo:
    """Weekend-crunch report for the re-update block (doc 07 §7)."""

    base: int                       # business days of the block
    requested: int                  # weekend days requested (reupd_fds)
    available: int                  # weekend days that fit the interval
    used: int                       # min(requested, available)
    total: int                      # base + used


@dataclass
class GamePlan:
    """Output of gerar_game_plan() (doc 07 §9)."""

    params: CronogramaParams
    fases: list                      # list[Fase]
    entrega: date
    entrega_base: date               # without meeting reschedules
    total_gap: int
    capped: bool
    reunioes: dict                   # {'val'|'apr'|'grad': ReuniaoCliente}
    feriados: list                   # list[Feriado] (modo uteis)
    reupd_info: Optional[ReUpdateInfo] = None
    avisos: list = field(default_factory=list)
