"""Testes do v32 F6 — app diretoria (doc processo-v32/06-diretoria.md).

Cobre:
- DirectorEscalation: criação (Suporte pode criar; demais setores não),
  decisão (absorver/cobrar/negociar/rejeitar) devolvendo ao ticket, campos
  de decisão read_only, idempotência da decisão
- DirectoryMeeting: CRUD da reunião semanal (ata + decisões)
- RBAC da matriz doc 08 §7.2 (linha diretoria: R suporte/diretoria, W diretoria)
"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from core.models import AuditLog
from diretoria.models import DirectorEscalation, DirectoryMeeting
from sales.models import Customer
from support.models import SupportTicket

User = get_user_model()


# ─── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username='dir_admin', password='dir_pass_123!', role='admin',
        email='diradmin@test.com',
    )


@pytest.fixture
def diretoria_operator(db):
    return User.objects.create_user(
        username='dir_operator', password='dir_pass_123!', role='operator',
        email='dirop@test.com', sectors=['diretoria'],
    )


@pytest.fixture
def suporte_operator(db):
    return User.objects.create_user(
        username='sup_operator', password='dir_pass_123!', role='operator',
        email='supop@test.com', sectors=['suporte'],
    )


@pytest.fixture
def comercial_operator(db):
    return User.objects.create_user(
        username='com_operator', password='dir_pass_123!', role='operator',
        email='comop@test.com', sectors=['comercial'],
    )


@pytest.fixture
def viewer_user(db):
    return User.objects.create_user(
        username='dir_viewer', password='dir_pass_123!', role='viewer',
        email='dirviewer@test.com',
    )


def client_for(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def diretoria_client(diretoria_operator):
    return client_for(diretoria_operator)


@pytest.fixture
def customer(admin_user):
    return Customer.objects.create(
        company_name='Cliente Diretoria LTDA',
        email='cliente@dirtest.com',
        created_by=admin_user,
    )


_seq = iter(range(80001, 89999))


@pytest.fixture
def ticket(admin_user, customer):
    return SupportTicket.objects.create(
        number=f'TKT-{next(_seq)}',
        title='Chamado inconclusivo',
        description='Caso sem solução clara',
        status='analise',
        conclusao='inconclusivo',
        customer=customer,
        created_by=admin_user,
    )


def make_escalation(ticket, user=None, **kwargs):
    defaults = dict(
        originating_ticket=ticket,
        raised_by=user,
        summary='Resumo do caso',
        evidence='Evidência do caso',
    )
    defaults.update(kwargs)
    return DirectorEscalation.objects.create(**defaults)


# ─── DirectorEscalation: criação + RBAC ──────────────────────────────────────

@pytest.mark.django_db
class TestEscalationCreate:
    def test_suporte_can_create(self, suporte_operator, ticket):
        """doc 08 §7.2: suporte cria via escalação."""
        client = client_for(suporte_operator)
        resp = client.post('/api/v1/diretoria/escalations/', {
            'originating_ticket': ticket.id,
            'summary': 'Cliente alega defeito, auditoria não conclui',
            'evidence': 'Logs anexos',
        }, format='json')
        assert resp.status_code == 201
        escalation = DirectorEscalation.objects.get(id=resp.data['id'])
        assert escalation.raised_by == suporte_operator
        assert AuditLog.objects.filter(
            action='director_escalation_create',
            resource_id=str(escalation.id),
        ).exists()

    def test_diretoria_can_create(self, diretoria_client, ticket):
        resp = diretoria_client.post('/api/v1/diretoria/escalations/', {
            'originating_ticket': ticket.id, 'summary': 'Resumo',
        }, format='json')
        assert resp.status_code == 201

    def test_comercial_cannot_create(self, comercial_operator, ticket):
        client = client_for(comercial_operator)
        resp = client.post('/api/v1/diretoria/escalations/', {
            'originating_ticket': ticket.id, 'summary': 'Resumo',
        }, format='json')
        assert resp.status_code == 403

    def test_decision_fields_read_only_on_create(self, diretoria_client, ticket):
        resp = diretoria_client.post('/api/v1/diretoria/escalations/', {
            'originating_ticket': ticket.id,
            'summary': 'Resumo',
            'decision': 'absorver',
            'resolved': True,
        }, format='json')
        assert resp.status_code == 201
        escalation = DirectorEscalation.objects.get(id=resp.data['id'])
        assert escalation.decision == ''
        assert escalation.resolved is False


@pytest.mark.django_db
class TestEscalationRBAC:
    def test_suporte_can_read(self, suporte_operator, ticket):
        make_escalation(ticket)
        client = client_for(suporte_operator)
        assert client.get('/api/v1/diretoria/escalations/').status_code == 200

    def test_comercial_cannot_read(self, comercial_operator, ticket):
        make_escalation(ticket)
        client = client_for(comercial_operator)
        assert client.get('/api/v1/diretoria/escalations/').status_code == 403

    def test_viewer_reads_but_cannot_write(self, viewer_user, ticket):
        escalation = make_escalation(ticket)
        client = client_for(viewer_user)
        assert client.get('/api/v1/diretoria/escalations/').status_code == 200
        resp = client.post(
            f'/api/v1/diretoria/escalations/{escalation.id}/decide/',
            {'decision': 'absorver'}, format='json',
        )
        assert resp.status_code == 403

    def test_suporte_cannot_decide(self, suporte_operator, ticket):
        """Decisão é exclusiva da Diretoria (write da matriz)."""
        escalation = make_escalation(ticket)
        client = client_for(suporte_operator)
        resp = client.post(
            f'/api/v1/diretoria/escalations/{escalation.id}/decide/',
            {'decision': 'absorver'}, format='json',
        )
        assert resp.status_code == 403
        escalation.refresh_from_db()
        assert escalation.resolved is False

    def test_admin_bypass(self, admin_user, ticket):
        escalation = make_escalation(ticket)
        client = client_for(admin_user)
        resp = client.post(
            f'/api/v1/diretoria/escalations/{escalation.id}/decide/',
            {'decision': 'absorver'}, format='json',
        )
        assert resp.status_code == 200

    def test_anonymous_401(self, ticket):
        client = APIClient()
        assert client.get('/api/v1/diretoria/escalations/').status_code == 401


# ─── DirectorEscalation: decisão devolve ao ticket (doc 06 §1 02°/03°) ───────

@pytest.mark.django_db
class TestEscalationDecide:
    def _decide(self, client, escalation, decision, notes=''):
        return client.post(
            f'/api/v1/diretoria/escalations/{escalation.id}/decide/',
            {'decision': decision, 'decision_notes': notes}, format='json',
        )

    def test_absorver_sets_garantia(self, diretoria_client, diretoria_operator, ticket):
        escalation = make_escalation(ticket)
        resp = self._decide(diretoria_client, escalation, 'absorver', 'Defeito nosso')
        assert resp.status_code == 200
        escalation.refresh_from_db()
        ticket.refresh_from_db()
        assert escalation.decision == 'absorver'
        assert escalation.decided_by == diretoria_operator
        assert escalation.decided_at is not None
        assert escalation.resolved is True
        assert ticket.conclusao == 'garantia'
        assert ticket.status == 'correcao'

    @pytest.mark.parametrize('decision', ['cobrar', 'negociar'])
    def test_cobrar_negociar_set_orcamento(self, diretoria_client, ticket, decision):
        escalation = make_escalation(ticket)
        resp = self._decide(diretoria_client, escalation, decision)
        assert resp.status_code == 200
        ticket.refresh_from_db()
        assert ticket.conclusao == 'orcamento'
        assert ticket.status == 'correcao'

    def test_rejeitar_closes_ticket(self, diretoria_client, ticket):
        escalation = make_escalation(ticket)
        resp = self._decide(diretoria_client, escalation, 'rejeitar', 'Não procede')
        assert resp.status_code == 200
        ticket.refresh_from_db()
        assert ticket.status == 'fechado'
        assert ticket.closed_at is not None
        # conclusão permanece inconclusivo (registro histórico)
        assert ticket.conclusao == 'inconclusivo'

    def test_decide_audits_old_new(self, diretoria_client, ticket):
        escalation = make_escalation(ticket)
        self._decide(diretoria_client, escalation, 'absorver')
        entry = AuditLog.objects.filter(
            action='director_escalation_decide',
            resource_id=str(escalation.id),
        ).first()
        assert entry is not None
        assert entry.old_value['decision'] == ''
        assert entry.new_value['decision'] == 'absorver'
        assert entry.new_value['ticket']['conclusao'] == 'garantia'

    def test_decide_twice_rejected(self, diretoria_client, ticket):
        escalation = make_escalation(ticket)
        assert self._decide(diretoria_client, escalation, 'absorver').status_code == 200
        resp = self._decide(diretoria_client, escalation, 'rejeitar')
        assert resp.status_code == 400
        escalation.refresh_from_db()
        assert escalation.decision == 'absorver'

    def test_invalid_decision_400(self, diretoria_client, ticket):
        escalation = make_escalation(ticket)
        resp = self._decide(diretoria_client, escalation, 'ignorar')
        assert resp.status_code == 400

    def test_decision_read_only_on_patch(self, diretoria_client, ticket):
        escalation = make_escalation(ticket)
        resp = diretoria_client.patch(
            f'/api/v1/diretoria/escalations/{escalation.id}/',
            {'decision': 'absorver', 'resolved': True}, format='json',
        )
        assert resp.status_code == 200
        escalation.refresh_from_db()
        assert escalation.decision == ''
        assert escalation.resolved is False

    def test_filter_by_resolved(self, diretoria_client, ticket, admin_user, customer):
        make_escalation(ticket)
        other_ticket = SupportTicket.objects.create(
            number=f'TKT-{next(_seq)}', title='Outro', description='x',
            status='analise', customer=customer, created_by=admin_user,
        )
        decided = make_escalation(other_ticket)
        self._decide(diretoria_client, decided, 'absorver')
        resp = diretoria_client.get('/api/v1/diretoria/escalations/?resolved=false')
        assert resp.status_code == 200
        results = resp.data['results'] if 'results' in resp.data else resp.data
        assert len(results) == 1
        assert results[0]['resolved'] is False


# ─── DirectoryMeeting (doc 06 §2) ────────────────────────────────────────────

@pytest.mark.django_db
class TestDirectoryMeeting:
    def test_create_meeting(self, diretoria_client, diretoria_operator, admin_user):
        resp = diretoria_client.post('/api/v1/diretoria/meetings/', {
            'date': '2026-06-15',
            'week_ref': '2026-W25',
            'attendees': [admin_user.id, diretoria_operator.id],
            'agenda_review': {
                'comercial_funil': 'ok', 'metas_indicadores': 'ok',
                'carteira': 'revisar', 'financeiro': 'ok',
                'producao_projetos': 'ok', 'suporte': 'ok',
            },
            'decisions': [
                {'title': 'Priorizar projeto X', 'owner': 'dir_admin'},
            ],
            'notes': 'Ata da reunião semanal.',
        }, format='json')
        assert resp.status_code == 201
        meeting = DirectoryMeeting.objects.get(id=resp.data['id'])
        assert meeting.created_by == diretoria_operator
        assert meeting.attendees.count() == 2
        assert meeting.agenda_review['carteira'] == 'revisar'

    def test_update_ata(self, diretoria_client, diretoria_operator):
        meeting = DirectoryMeeting.objects.create(
            date='2026-06-15', week_ref='2026-W25', created_by=diretoria_operator,
        )
        resp = diretoria_client.patch(
            f'/api/v1/diretoria/meetings/{meeting.id}/',
            {'notes': 'Ata revisada', 'decisions': [{'title': 'Decisão 1'}]},
            format='json',
        )
        assert resp.status_code == 200
        meeting.refresh_from_db()
        assert meeting.notes == 'Ata revisada'
        assert meeting.decisions == [{'title': 'Decisão 1'}]

    def test_agenda_review_must_be_dict(self, diretoria_client):
        resp = diretoria_client.post('/api/v1/diretoria/meetings/', {
            'date': '2026-06-15', 'agenda_review': ['lista'],
        }, format='json')
        assert resp.status_code == 400

    def test_decisions_must_be_list(self, diretoria_client):
        resp = diretoria_client.post('/api/v1/diretoria/meetings/', {
            'date': '2026-06-15', 'decisions': {'a': 1},
        }, format='json')
        assert resp.status_code == 400

    def test_filter_by_week_ref(self, diretoria_client, diretoria_operator):
        DirectoryMeeting.objects.create(
            date='2026-06-15', week_ref='2026-W25', created_by=diretoria_operator,
        )
        DirectoryMeeting.objects.create(
            date='2026-06-22', week_ref='2026-W26', created_by=diretoria_operator,
        )
        resp = diretoria_client.get('/api/v1/diretoria/meetings/?week_ref=2026-W26')
        results = resp.data['results'] if 'results' in resp.data else resp.data
        assert len(results) == 1
        assert results[0]['week_ref'] == '2026-W26'

    def test_suporte_reads_but_cannot_write(self, suporte_operator, diretoria_operator):
        DirectoryMeeting.objects.create(
            date='2026-06-15', created_by=diretoria_operator,
        )
        client = client_for(suporte_operator)
        assert client.get('/api/v1/diretoria/meetings/').status_code == 200
        resp = client.post(
            '/api/v1/diretoria/meetings/', {'date': '2026-06-15'}, format='json',
        )
        assert resp.status_code == 403

    def test_comercial_no_access(self, comercial_operator):
        client = client_for(comercial_operator)
        assert client.get('/api/v1/diretoria/meetings/').status_code == 403

    def test_meeting_str(self, diretoria_operator):
        meeting = DirectoryMeeting.objects.create(
            date='2026-06-15', created_by=diretoria_operator,
        )
        meeting.refresh_from_db()
        assert '2026-06-15' in str(meeting)
