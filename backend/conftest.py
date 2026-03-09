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
