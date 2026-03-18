import pytest
from decimal import Decimal
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from projects.models import Project, ProjectPhase, ProjectTask, Milestone, TimeEntry

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


# ─── TIME ENTRY ──────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestTimeEntry:
    url = '/api/v1/projects/time-entries/'

    def test_create_time_entry_updates_logged_hours(self, admin_client, admin_user, project):
        task = ProjectTask.objects.create(
            project=project,
            title='Task com horas',
            status='in_progress',
        )
        payload = {
            'project': project.id,
            'task': task.id,
            'date': '2024-01-15',
            'hours': '3.5',
            'description': 'Desenvolvimento de feature',
        }
        response = admin_client.post(self.url, payload)
        assert response.status_code == status.HTTP_201_CREATED
        task.refresh_from_db()
        assert task.logged_hours == Decimal('3.5')

    def test_multiple_entries_accumulate_hours(self, admin_client, admin_user, project):
        task = ProjectTask.objects.create(
            project=project,
            title='Task acumulada',
            status='in_progress',
        )
        for hours in ['2.0', '1.5', '3.0']:
            admin_client.post(self.url, {
                'project': project.id,
                'task': task.id,
                'date': '2024-01-15',
                'hours': hours,
                'description': f'Trabalho {hours}h',
            })
        task.refresh_from_db()
        assert task.logged_hours == Decimal('6.5')

    def test_delete_time_entry_recalculates_logged_hours(self, admin_client, admin_user, project):
        task = ProjectTask.objects.create(
            project=project,
            title='Task delete',
            status='in_progress',
        )
        # Criar duas entradas
        r1 = admin_client.post(self.url, {
            'project': project.id, 'task': task.id,
            'date': '2024-01-15', 'hours': '4.0', 'description': 'Entry 1',
        })
        r2 = admin_client.post(self.url, {
            'project': project.id, 'task': task.id,
            'date': '2024-01-16', 'hours': '2.0', 'description': 'Entry 2',
        })
        task.refresh_from_db()
        assert task.logged_hours == Decimal('6.0')

        # Deletar primeira entrada
        admin_client.delete(f"{self.url}{r1.data['id']}/")
        task.refresh_from_db()
        assert task.logged_hours == Decimal('2.0')

    def test_my_entries_returns_only_own_entries(self, admin_client, admin_user, manager_user, project):
        TimeEntry.objects.create(
            project=project, user=admin_user,
            date='2024-01-15', hours=2.0, description='Admin entry',
        )
        TimeEntry.objects.create(
            project=project, user=manager_user,
            date='2024-01-15', hours=3.0, description='Manager entry',
        )
        response = admin_client.get(f'{self.url}my_entries/')
        assert response.status_code == status.HTTP_200_OK
        entries = response.data.get('results', response.data)
        usernames = [e['user_name'] for e in entries]
        assert all(u == admin_user.username for u in usernames)

    def test_report_with_date_filter(self, admin_client, admin_user, project):
        TimeEntry.objects.create(
            project=project, user=admin_user,
            date='2024-01-10', hours=2.0, description='Janeiro',
        )
        TimeEntry.objects.create(
            project=project, user=admin_user,
            date='2024-03-10', hours=5.0, description='Março',
        )
        response = admin_client.get(f'{self.url}report/', {
            'from': '2024-01-01', 'to': '2024-01-31',
        })
        assert response.status_code == status.HTTP_200_OK
        assert response.data['total_hours'] == 2.0

    def test_report_invalid_date_returns_400(self, admin_client):
        response = admin_client.get(f'{self.url}report/', {'from': 'not-a-date'})
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_unauthenticated_cannot_list(self, api_client):
        response = api_client.get(self.url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
