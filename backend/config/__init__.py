# Carrega Celery junto com o Django para que @shared_task funcione
from .celery import app as celery_app

__all__ = ('celery_app',)
