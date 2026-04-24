"""Audit trail persistente (F3a).

log_audit() persiste cada evento em DB (AuditLog) alem de manter o log em
stdout para compatibilidade. Append-only em DB = trilha confiavel para
auditoria fiscal/LGPD.
"""
import logging

from django.utils import timezone

audit_logger = logging.getLogger('audit')


def log_audit(
    user,
    action: str,
    resource_type: str,
    resource_id=None,
    details: str = '',
    old_value: dict | None = None,
    new_value: dict | None = None,
    request=None,
):
    """Registra evento de auditoria em DB + stdout.

    Args:
        user: usuario que executou (User ou None para sistema)
        action: ex 'contract_activate', 'customer_anonymize'
        resource_type: ex 'contract', 'invoice', 'customer'
        resource_id: PK do recurso (int, str ou UUID)
        details: texto livre com contexto adicional
        old_value: estado anterior (dict JSON-serializable) — opcional
        new_value: estado posterior (dict JSON-serializable) — opcional
        request: HttpRequest — se fornecido, extrai IP e user-agent

    Retorna o AuditLog criado (ou None se a persistencia falhar).
    """
    username = getattr(user, 'username', '') or 'anonymous'
    role = getattr(user, 'role', '') or 'unknown'
    timestamp = timezone.now().isoformat()

    # Log em stdout (compatibilidade com pipeline atual)
    audit_logger.info(
        'AUDIT | user=%s role=%s action=%s resource=%s id=%s details=%s timestamp=%s',
        username, role, action, resource_type, resource_id or '-', details, timestamp,
    )

    # Persiste em DB
    ip = None
    user_agent = ''
    if request is not None:
        ip = _extract_client_ip(request)
        user_agent = (request.META.get('HTTP_USER_AGENT') or '')[:500]

    try:
        # Import local para evitar circular import no startup
        from .models import AuditLog
        entry = AuditLog.objects.create(
            user=user if user and user.is_authenticated else None,
            username_snapshot=username if username != 'anonymous' else '',
            user_role_snapshot=role if role != 'unknown' else '',
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id is not None else '',
            old_value=old_value or {},
            new_value=new_value or {},
            details=details or '',
            ip_address=ip,
            user_agent=user_agent,
        )
        return entry
    except Exception as exc:
        # Falha de persistencia nunca deve quebrar a operacao de negocio,
        # mas deve ser logada para investigacao.
        audit_logger.error(
            'AUDIT | falha ao persistir em DB: %s (action=%s resource=%s id=%s)',
            exc, action, resource_type, resource_id,
        )
        return None


def _extract_client_ip(request):
    """Extrai IP do cliente considerando proxies (X-Forwarded-For).

    Usa apenas o primeiro IP da chain (mais proximo do cliente). Cabe ao
    Nginx garantir que o header so e aceito de upstreams confiaveis.
    """
    xff = request.META.get('HTTP_X_FORWARDED_FOR', '')
    if xff:
        return xff.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')
