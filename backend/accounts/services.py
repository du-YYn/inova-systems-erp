"""Serviços de conta — helpers de usuário de sistema.

M4 (code review v32 ajustes): automações que precisam de um usuário não-nulo
para `created_by` (ex.: Project auto-criado na assinatura do contrato) NÃO
devem reaproveitar "o primeiro admin ativo" — isso atribui ações de sistema a
uma pessoa real, arbitrária, e polui a trilha de auditoria. Em vez disso, usam
um USUÁRIO DE SERVIÇO dedicado e rotulado, INATIVO para login.
"""
import logging

from django.contrib.auth import get_user_model

logger = logging.getLogger('accounts')

SYSTEM_USERNAME = 'system'
SYSTEM_EMAIL = 'system@inova.local'


def get_system_user():
    """Retorna (criando se preciso) o usuário de serviço dedicado.

    Características:
      - username 'system' (chave estável; USERNAME_FIELD único);
      - is_active=False -> NÃO autentica (senha inutilizável);
      - role 'viewer' (menos privilégio; o usuário nunca faz request, é só o
        autor rotulado de efeitos de automação);
      - is_staff/is_superuser False.

    Idempotente: get_or_create por username. Não sobrescreve um 'system'
    pré-existente (respeita ajustes manuais), apenas garante que ele exista.
    """
    User = get_user_model()
    user, created = User.objects.get_or_create(
        username=SYSTEM_USERNAME,
        defaults={
            'email': SYSTEM_EMAIL,
            'first_name': 'Sistema',
            'last_name': '(automação)',
            'role': 'viewer',
            'is_active': False,
            'is_staff': False,
            'is_superuser': False,
        },
    )
    if created:
        # Senha inutilizável: o usuário de serviço nunca loga.
        user.set_unusable_password()
        user.save(update_fields=['password'])
        logger.info(
            'M4: usuário de serviço "%s" (id %s) criado para autoria de '
            'automações.', SYSTEM_USERNAME, user.id,
        )
    return user
