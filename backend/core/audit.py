import logging
from django.utils import timezone

audit_logger = logging.getLogger('audit')


def log_audit(user, action: str, resource_type: str, resource_id=None, details: str = ''):
    """Log an audit event for sensitive operations."""
    username = getattr(user, 'username', 'anonymous')
    role = getattr(user, 'role', 'unknown')
    timestamp = timezone.now().isoformat()

    audit_logger.info(
        'AUDIT | user=%s role=%s action=%s resource=%s id=%s details=%s timestamp=%s',
        username, role, action, resource_type, resource_id or '-', details, timestamp,
    )
