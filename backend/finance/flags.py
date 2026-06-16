"""Helpers das feature flags de automação do Financeiro (v32 F4).

Toda automação nova nasce atrás de flag por env (doc 08 §11.2 R2):
`AUTOMATION_<NOME> = off | dry_run | on`, default `dry_run`. Em dry_run a
automação loga (logger + log_audit) o que faria, sem efeito. Kill-switch
sem deploy: trocar env + restart.
"""
import logging

from django.conf import settings

logger = logging.getLogger('finance')

VALID_FLAG_VALUES = ('off', 'dry_run', 'on')


def get_automation_flag(name: str, default: str = 'dry_run') -> str:
    """Lê uma flag de automação validada de settings (off | dry_run | on)."""
    value = str(getattr(settings, name, default)).strip().lower()
    if value not in VALID_FLAG_VALUES:
        logger.warning(
            'FLAG %s com valor invalido %r — usando %r.', name, value, default,
        )
        return default
    return value
