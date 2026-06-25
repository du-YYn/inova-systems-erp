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


@pytest.mark.django_db
class TestSeedingWiring:
    def test_create_seeds_initial_stage(self, customer):
        case = make_case(customer)  # post_save → semeia 'preparacao'
        labels = list(case.tasks.filter(stage='preparacao').values_list('label', flat=True))
        assert labels == CHECKLIST_TEMPLATES[('contrato', 'preparacao')]

    def test_transition_seeds_new_stage(self, juridico_client, customer):
        case = make_case(customer)
        resp = juridico_client.post(f'{URL}{case.id}/transition/', {'status': 'envio_assinatura'})
        assert resp.status_code == status.HTTP_200_OK, resp.data
        case.refresh_from_db()
        assert case.tasks.filter(stage='envio_assinatura').count() == \
            len(CHECKLIST_TEMPLATES[('contrato', 'envio_assinatura')])


@pytest.mark.django_db
class TestCaseSerializerTasks:
    def test_case_detail_includes_tasks(self, juridico_client, customer):
        case = make_case(customer)  # semeado em 'preparacao'
        resp = juridico_client.get(f'{URL}{case.id}/')
        assert resp.status_code == status.HTTP_200_OK
        stages = {t['stage'] for t in resp.data['tasks']}
        assert 'preparacao' in stages
        first = resp.data['tasks'][0]
        assert first['done'] is False
        assert first['is_custom'] is False
        assert 'done_by_name' in first


@pytest.mark.django_db
class TestLegalCaseTaskViewSet:
    def test_list_filtered_by_case_returns_plain_list(self, juridico_client, customer):
        case = make_case(customer)  # semeado preparacao
        resp = juridico_client.get(TASK_URL, {'case': case.id})
        assert resp.status_code == status.HTTP_200_OK
        assert isinstance(resp.data, list)
        assert len(resp.data) >= 1

    def test_create_custom_task_defaults_to_current_stage(self, juridico_client, customer):
        case = make_case(customer)
        resp = juridico_client.post(TASK_URL, {'case': case.id, 'label': 'Pendência extra'})
        assert resp.status_code == status.HTTP_201_CREATED, resp.data
        task = LegalCaseTask.objects.get(id=resp.data['id'])
        assert task.is_custom is True
        assert task.stage == 'preparacao'
        assert task.done is False

    def test_toggle_done_sets_done_by_and_at(self, juridico_client, juridico_operator, customer):
        case = make_case(customer)
        task = LegalCaseTask.objects.create(case=case, stage='preparacao', label='X')
        resp = juridico_client.patch(f'{TASK_URL}{task.id}/', {'done': True})
        assert resp.status_code == status.HTTP_200_OK
        task.refresh_from_db()
        assert task.done is True
        assert task.done_at is not None
        assert task.done_by == juridico_operator

    def test_untoggle_clears_done(self, juridico_client, customer):
        case = make_case(customer)
        task = LegalCaseTask.objects.create(case=case, stage='preparacao', label='X', done=True)
        resp = juridico_client.patch(f'{TASK_URL}{task.id}/', {'done': False})
        assert resp.status_code == status.HTTP_200_OK
        task.refresh_from_db()
        assert task.done is False
        assert task.done_at is None
        assert task.done_by is None

    def test_delete_task(self, juridico_client, customer):
        case = make_case(customer)
        task = LegalCaseTask.objects.create(case=case, stage='preparacao', label='X')
        resp = juridico_client.delete(f'{TASK_URL}{task.id}/')
        assert resp.status_code == status.HTTP_204_NO_CONTENT
        assert not LegalCaseTask.objects.filter(id=task.id).exists()

    def test_comercial_reads_but_cannot_write(self, comercial_operator, customer):
        client = client_for(comercial_operator)
        case = make_case(customer)
        task = LegalCaseTask.objects.create(case=case, stage='preparacao', label='X')
        assert client.get(TASK_URL, {'case': case.id}).status_code == status.HTTP_200_OK
        assert client.post(TASK_URL, {'case': case.id, 'label': 'Y'}).status_code == status.HTTP_403_FORBIDDEN
        assert client.patch(f'{TASK_URL}{task.id}/', {'done': True}).status_code == status.HTTP_403_FORBIDDEN

    def test_suporte_has_no_access(self, suporte_operator, customer):
        client = client_for(suporte_operator)
        case = make_case(customer)
        assert client.get(TASK_URL, {'case': case.id}).status_code == status.HTTP_403_FORBIDDEN

    def test_case_is_immutable_on_update(self, juridico_client, customer):
        case = make_case(customer)
        other = make_case(customer)  # outro caso do mesmo cliente
        task = LegalCaseTask.objects.create(case=case, stage='preparacao', label='X')
        resp = juridico_client.patch(f'{TASK_URL}{task.id}/', {'case': other.id, 'label': 'Y'})
        assert resp.status_code == status.HTTP_200_OK
        task.refresh_from_db()
        assert task.case_id == case.id   # NÃO re-parenteou
        assert task.label == 'Y'         # demais campos atualizam normalmente
