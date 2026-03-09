import os
from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

app = Celery('inova_erp')

# Lê configuração do Django (prefixo CELERY_)
app.config_from_object('django.conf:settings', namespace='CELERY')

# Auto-descobre tasks em todos os apps instalados
app.autodiscover_tasks()
