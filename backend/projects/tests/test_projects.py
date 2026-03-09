import pytest
from decimal import Decimal
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from projects.models import Project, ProjectPhase, ProjectTask, Milestone

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def admin_user(db):
    return User.objects.create_superuser(
        username='admin',
        email='admin@test.com',
        password='admin_pass_123',
        role='admin',
    )


@pytest.fixture
def manager_user(db):
    return User.objects.create_user(
        username='manager',
        email='manager@test.com',
        password='manager_pass_123',
        role='manager',
    )


@pytest.fixture
def operator_user(db):
    return User.objects.create_user(
        username='operator',
        email='operator@test.com',
        password='operator_pass_123',
        role='operator',
    )


@pytest.fixture
def viewer_user(db):
    return User.objects.create_user(
        username='viewer',
        email='viewer@test.com',
        password='viewer_pass_123',
        role='viewer',
    )


@pytest.fixture
def admin_client(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    return api_client


@pytest.fixture
def manager_client(api_client, manager_user):
    api_client.force_authenticate(user=manager_user)
    return api_client


@pytest.fixture
def operator_client(api_client, operator_user):
    api_client.force_authenticate(user=operator_user)
    return api_client


@pytest.fixture
def viewer_client(api_client, viewer_user):
    api_client.force_authenticate(user=viewer_user)
    return api_client


@pytest.fixture
def project(db, admin_user):
    return Project.objects.create(
        name='Projeto Alfa',
        project_type='custom_dev',
        status='planning',
        start_date='2024-01-01',
        budget_value=Decimal('50000.00'),
        created_by=admin_user,
    )


# ─── PROJECT CRUD ─────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestProjectCRUD:
    url = '/api/v1/projects/projects/'

    def test_list_requires_auth(self, api_client):
        response = api_client.get(self.url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_projects_admin(self, admin_client, project):
        response = admin_client.get(self.url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data['count'] >= 1

    def test_create_project_admin(self, admin_client):
        payload = {
            'name': 'Novo Projeto',
            'project_type': 'saas',
            'status': 'planning',
            'start_date': '2024-02-01',
            'budget_value': '100000.00',
        }
        response = admin_client.post(self.url, payload)
        assert response.status_code == status.HTTP_201_CREATED
        assert Project.objects.filter(name='Novo Projeto').exists()

    def test_create_project_manager(self, manager_client):
        payload = {
            'name': 'Projeto Manager',
            'project_type': 'maintenance',
            'status': 'planning',
            'start_date': '2024-03-01',
        }
        response = manager_client.post(self.url, payload)
        assert response.status_code == status.HTTP_201_CREATED

    def test_create_project_operator(self, operator_client):
        payload = {
            'name': 'Projeto Operator',
            'project_type': 'support',
            'status': 'planning',
            'start_date': '2024-03-01',
        }
        response = operator_client.post(self.url, payload)
        assert response.status_code == status.HTTP_201_CREATED

    def test_viewer_can_list_but_not_create(self, viewer_client, project):
        list_response = viewer_client.get(self.url)
        assert list_response.status_code == status.HTTP_200_OK

        create_response = viewer_client.post(self.url, {
            'name': 'Viewer Project',
            'project_type': 'support',
            'status': 'planning',
            'start_date': '2024-03-01',
        })
        assert create_response.status_code == status.HTTP_403_FORBIDDEN

    def test_update_project_status(self, admin_client, project):
        url = f'{self.url}{project.id}/'
        response = admin_client.patch(url, {'status': 'development'})
        assert response.status_code == status.HTTP_200_OK
        project.refresh_from_db()
        assert project.status == 'development'

    def test_delete_project_admin(self, admin_client, project):
        url = f'{self.url}{project.id}/'
        response = admin_client.delete(url)
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not Project.objects.filter(id=project.id).exists()

    def test_filter_by_status(self, admin_client, project):
        response = admin_client.get(self.url, {'status': 'planning'})
        assert response.status_code == status.HTTP_200_OK
        for item in response.data['results']:
            assert item['status'] == 'planning'


# ─── PROJECT PHASES ──────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestProjectPhase:
    url = '/api/v1/projects/phases/'

    def test_create_phase(self, admin_client, project):
        payload = {
            'project': project.id,
            'name': 'Análise',
            'order': 1,
        }
        response = admin_client.post(self.url, payload)
        assert response.status_code == status.HTTP_201_CREATED
        assert ProjectPhase.objects.filter(name='Análise', project=project).exists()

    def test_complete_phase(self, admin_client, project):
        phase = ProjectPhase.objects.create(
            project=project,
            name='Desenvolvimento',
            order=1,
        )
        url = f'{self.url}{phase.id}/'
        response = admin_client.patch(url, {'is_completed': True})
        assert response.status_code == status.HTTP_200_OK
        phase.refresh_from_db()
        assert phase.is_completed is True


# ─── PROJECT TASKS ────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestProjectTask:
    url = '/api/v1/projects/tasks/'

    def test_create_task(self, admin_client, project):
        payload = {
            'project': project.id,
            'title': 'Implementar login',
            'task_type': 'feature',
            'priority': 'high',
            'status': 'todo',
        }
        response = admin_client.post(self.url, payload)
        assert response.status_code == status.HTTP_201_CREATED

    def test_update_task_status(self, admin_client, project, admin_user):
        task = ProjectTask.objects.create(
            project=project,
            title='Tarefa Teste',
            status='todo',
        )
        url = f'{self.url}{task.id}/'
        response = admin_client.patch(url, {'status': 'in_progress'})
        assert response.status_code == status.HTTP_200_OK
        task.refresh_from_db()
        assert task.status == 'in_progress'

    def test_filter_tasks_by_project(self, admin_client, project, admin_user):
        ProjectTask.objects.create(project=project, title='Task 1', status='todo')
        ProjectTask.objects.create(project=project, title='Task 2', status='done')

        response = admin_client.get(self.url, {'project': project.id})
        assert response.status_code == status.HTTP_200_OK
        assert response.data['count'] == 2


# ─── PROJECT PROGRESS ────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestProjectProgress:
    url = '/api/v1/projects/projects/'

    def test_update_project_progress(self, admin_client, project):
        url = f'{self.url}{project.id}/'
        response = admin_client.patch(url, {'progress': 75})
        assert response.status_code == status.HTTP_200_OK
        project.refresh_from_db()
        assert project.progress == 75

    def test_progress_boundaries(self, admin_client, project):
        url = f'{self.url}{project.id}/'

        response = admin_client.patch(url, {'progress': 0})
        assert response.status_code == status.HTTP_200_OK

        response = admin_client.patch(url, {'progress': 100})
        assert response.status_code == status.HTTP_200_OK
        project.refresh_from_db()
        assert project.progress == 100
