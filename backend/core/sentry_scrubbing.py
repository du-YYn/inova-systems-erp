"""Scrubbing de PII para eventos Sentry — LGPD compliance (SEC-006).

Antes de qualquer evento sair para o Sentry, redige chaves sensíveis para que
dados pessoais (documento, CPF/CNPJ, e-mail, telefone, conteúdo de mensagens,
transcrições, segredos) NÃO vazem para o agregador externo.

Pontos cobertos por `before_send`:
- ``event['extra']`` (contexto extra anexado manualmente);
- locals dos frames de cada exceção (``event['exception']`` → stacktrace frames
  → ``frame['vars']``) — exigem ``include_local_variables=True``, mas mesmo com
  ``False`` o scrub é defensivo e idempotente;
- ``event['logentry']`` (mensagem + params do log que originou o evento).

E `before_breadcrumb` redige ``data`` de cada breadcrumb.

Referenciado em ``config/settings.py`` apenas quando ``SENTRY_DSN`` está setado.
"""
from __future__ import annotations

# Chaves cujo VALOR deve ser redigido (case-insensitive, match por substring).
SENSITIVE_KEYS = (
    'document',
    'cpf',
    'cnpj',
    'email',
    'phone',
    'content',
    'transcript',
    'password',
    'token',
    'secret',
)

REDACTED = '[redacted]'

# Profundidade máxima de recursão — evita loop em estruturas patológicas.
_MAX_DEPTH = 8


def _is_sensitive_key(key) -> bool:
    if not isinstance(key, str):
        return False
    lowered = key.lower()
    return any(s in lowered for s in SENSITIVE_KEYS)


def _scrub(value, _depth: int = 0):
    """Redige recursivamente valores de chaves sensíveis em dicts/listas.

    Não muta a entrada: retorna uma estrutura nova (defensivo para o Sentry).
    """
    if _depth > _MAX_DEPTH:
        return value
    if isinstance(value, dict):
        cleaned = {}
        for k, v in value.items():
            if _is_sensitive_key(k):
                cleaned[k] = REDACTED
            else:
                cleaned[k] = _scrub(v, _depth + 1)
        return cleaned
    if isinstance(value, (list, tuple)):
        scrubbed = [_scrub(item, _depth + 1) for item in value]
        return type(value)(scrubbed) if isinstance(value, tuple) else scrubbed
    return value


def scrub_event(event, hint=None):
    """`before_send` hook — redige PII de um evento Sentry antes do envio.

    Idempotente e tolerante a falhas: qualquer erro no scrubbing NÃO pode
    derrubar o envio nem mascarar o evento de erro original — em caso de
    exceção, devolve o evento intacto (fail-open só para não perder o erro,
    nunca fail-open de PII em caminho feliz).
    """
    if not isinstance(event, dict):
        return event
    try:
        # 1) extra
        if isinstance(event.get('extra'), dict):
            event['extra'] = _scrub(event['extra'])

        # 2) locals dos frames de exceção
        exception = event.get('exception')
        values = exception.get('values') if isinstance(exception, dict) else None
        if isinstance(values, list):
            for exc_value in values:
                if not isinstance(exc_value, dict):
                    continue
                stacktrace = exc_value.get('stacktrace')
                frames = (
                    stacktrace.get('frames')
                    if isinstance(stacktrace, dict) else None
                )
                if not isinstance(frames, list):
                    continue
                for frame in frames:
                    if isinstance(frame, dict) and isinstance(frame.get('vars'), dict):
                        frame['vars'] = _scrub(frame['vars'])

        # 3) logentry (mensagem + params)
        logentry = event.get('logentry')
        if isinstance(logentry, dict):
            params = logentry.get('params')
            if isinstance(params, (dict, list)):
                logentry['params'] = _scrub(params)
    except Exception:  # pragma: no cover — nunca quebra o envio do erro
        return event
    return event


def scrub_breadcrumb(crumb, hint=None):
    """`before_breadcrumb` hook — redige PII do `data` de cada breadcrumb."""
    if not isinstance(crumb, dict):
        return crumb
    try:
        if isinstance(crumb.get('data'), dict):
            crumb['data'] = _scrub(crumb['data'])
    except Exception:  # pragma: no cover
        return crumb
    return crumb
