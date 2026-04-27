"""Utilitários de logging seguro — LGPD compliance.

Mascaramento de dados pessoais para evitar que apareçam em:
- Logs de aplicação (Django)
- Agregadores (Sentry, Loki)
- Backups de log
"""
import re


def mask_email(email: str) -> str:
    """Mascara email preservando primeiras 2 e últimas 2 chars do local,
    e ocultando domínio.

    Ex: joao.silva@gmail.com → 'jo********va@***.com'
    Seguro para logs sem expor PII completo. Retorna '[no-email]' se None/vazio.
    """
    if not email or '@' not in email:
        return '[no-email]'
    try:
        local, domain = email.rsplit('@', 1)
        if len(local) <= 4:
            masked_local = local[0] + '*' * (len(local) - 1) if local else '*'
        else:
            masked_local = f"{local[:2]}{'*' * (len(local) - 4)}{local[-2:]}"
        # Mascarar domínio parcialmente — manter TLD
        if '.' in domain:
            _, tld = domain.rsplit('.', 1)
            return f"{masked_local}@***.{tld}"
        return f"{masked_local}@***"
    except Exception:
        return '[email-masked]'


def mask_cpf_cnpj(value: str) -> str:
    """Mascara CPF/CNPJ preservando só os últimos 2 dígitos.

    Ex: 123.456.789-01 → '***.***.***-01'
    """
    if not value:
        return '[no-doc]'
    digits = re.sub(r'\D', '', value)
    if len(digits) >= 2:
        return f"***.***.***-{digits[-2:]}"
    return '***'


def mask_phone(phone: str) -> str:
    """Mascara telefone preservando só DDD e últimos 4 dígitos.

    Ex: (41) 98765-4321 → '(41) *****-4321'
    """
    if not phone:
        return '[no-phone]'
    digits = re.sub(r'\D', '', phone)
    if len(digits) >= 6:
        return f"({digits[:2]}) *****-{digits[-4:]}"
    return '***'


def mask_company_name(name: str) -> str:
    """Mascara razão social preservando primeiras 2 chars e final.

    Ex: 'Inova Systems Solutions LTDA' → 'In***A'
    Razão social não é tão sensível quanto CPF, mas é dado identificável
    de pessoa jurídica e deve ser mascarado em logs por padrão LGPD.
    """
    if not name:
        return '[no-company]'
    name = name.strip()
    if len(name) <= 3:
        return name[0] + '*' * max(1, len(name) - 1)
    return f"{name[:2]}***{name[-1]}"
