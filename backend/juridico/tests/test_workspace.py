"""Workspace do card do Jurídico — checklist por etapa + ferramentas."""
import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from rest_framework import status
from rest_framework.test import APIClient

from core.models import AuditLog
from juridico.checklists import CHECKLIST_TEMPLATES, seed_stage_tasks
from juridico.models import LegalCase, LegalCaseTask
from sales.models import Customer

User = get_user_model()

URL = '/api/v1/juridico/legal-cases/'
TASK_URL = '/api/v1/juridico/legal-case-tasks/'


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username='admin_ws', email='admin@ws.com',
        password='admin_pass_123', role='admin',
    )


@pytest.fixture
def juridico_operator(db):
    return User.objects.create_user(
        username='juridico_ws', email='juridico@ws.com',
        password='juridico_pass_123', role='operator', sectors=['juridico'],
    )


@pytest.fixture
def comercial_operator(db):
    return User.objects.create_user(
        username='comercial_ws', email='comercial@ws.com',
        password='comercial_pass_123', role='operator', sectors=['comercial'],
    )


@pytest.fixture
def suporte_operator(db):
    return User.objects.create_user(
        username='suporte_ws', email='suporte@ws.com',
        password='suporte_pass_123', role='operator', sectors=['suporte'],
    )


def client_for(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def juridico_client(juridico_operator):
    return client_for(juridico_operator)


@pytest.fixture
def customer(admin_user):
    return Customer.objects.create(
        company_name='Cliente Workspace LTDA',
        email='cliente@ws.com', created_by=admin_user,
    )


def make_case(customer, user=None, **kwargs):
    defaults = dict(
        customer=customer, process_type='contrato',
        source='comercial', created_by=user,
    )
    defaults.update(kwargs)
    return LegalCase.objects.create(**defaults)


@pytest.mark.django_db
class TestLegalCaseTaskModel:
    def test_defaults(self, customer):
        case = make_case(customer)
        task = LegalCaseTask.objects.create(
            case=case, stage='envio_assinatura', label='Conferir documento',
        )
        assert task.done is False
        assert task.done_at is None
        assert task.done_by is None
        assert task.is_custom is False
        assert task.order == 0
        assert case.tasks.filter(stage='envio_assinatura').count() == 1


@pytest.mark.django_db
class TestSeedStageTasks:
    def test_seeds_template_for_a_non_current_stage(self, customer):
        # Usa 'assinado' (não é a etapa atual) p/ não colidir com o signal de criação.
        case = make_case(customer)
        created = seed_stage_tasks(case, 'assinado')
        labels = list(case.tasks.filter(stage='assinado').values_list('label', flat=True))
        assert labels == CHECKLIST_TEMPLATES[('contrato', 'assinado')]
        assert len(created) == len(labels)
        assert all(t.is_custom is False for t in created)

    def test_idempotent(self, customer):
        case = make_case(customer)
        seed_stage_tasks(case, 'assinado')
        seed_stage_tasks(case, 'assinado')
        assert case.tasks.filter(stage='assinado').count() == \
            len(CHECKLIST_TEMPLATES[('contrato', 'assinado')])

    def test_unknown_combo_creates_nothing(self, customer):
        case = make_case(customer, process_type='encerramento')
        created = seed_stage_tasks(case, 'aprovado_dev')  # não existe p/ encerramento
        assert created == []
        assert case.tasks.filter(stage='aprovado_dev').count() == 0

    def test_does_not_touch_existing_custom_items(self, customer):
        case = make_case(customer)
        LegalCaseTask.objects.create(
            case=case, stage='envio_assinatura', label='Pendência X', is_custom=True,
        )
        seed_stage_tasks(case, 'envio_assinatura')  # já existe item nessa etapa → no-op
        assert case.tasks.filter(stage='envio_assinatura').count() == 1
