import pytest


@pytest.fixture(autouse=True)
def use_locmem_cache(settings):
    """
    Substitui o Redis por cache em memória durante os testes.
    Cada teste começa com cache vazio — throttle não persiste entre testes.
    """
    settings.CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        }
    }


@pytest.fixture(autouse=True)
def celery_eager(settings):
    """
    Roda tasks Celery sincrono nos testes — evita tentativa de conexao
    com Redis quando o codigo invoca .delay() durante uma transicao
    (ex: notificacoes de email em _generate_partner_commission).
    """
    settings.CELERY_TASK_ALWAYS_EAGER = True
    settings.CELERY_TASK_EAGER_PROPAGATES = False  # nao propaga erro do task
