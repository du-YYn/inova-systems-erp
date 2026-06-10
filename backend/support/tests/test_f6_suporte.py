"""Testes do v32 F6 — realinhamento do Suporte (doc processo-v32/05-suporte.md).

Cobre:
- Data migration 0004: mapeamentos ticket_type/status (forward + reverse)
- POST /analyze/: lógica condicional por tipo de projeto (doc 05 §4)
- Escalação Diretoria atrás de AUTOMATION_SUP_ESCALA (off/dry_run/on)
- PedidoUpdate: criação na triagem + promote → Prospect(tech_analysis)
  atrás de AUTOMATION_SUP_PEDIDO_UPDATE
- Auto-fechamento (support.tasks.close_stale_resolved)
- Upload de áudio + magic bytes (core/validators)
- Canal público com token + throttle public_ticket (5/h)
"""
import importlib
from datetime import date, timedelta

import pytest
from django.apps import apps as django_apps
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APIClient

from core.models import AuditLog
from core.validators import validate_file_extension, validate_file_magic_bytes
from diretoria.models import DirectorEscalation
from notifications.models import Notification
from projects.models import Project
from sales.models import Customer, Prospect
from support.models import PedidoUpdate, SupportTicket, TicketAttachment
from support.tasks import close_stale_resolved

User = get_user_model()

data_migration = importlib.import_module(
    'support.migrations.0004_realign_ticket_type_status_data'
)


# ─── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username='f6_admin', password='f6_pass_123!', role='admin',
        email='f6admin@test.com',
    )


@pytest.fixture
def operator_user(db):
    return User.objects.create_user(
        username='f6_operator', password='f6_pass_123!', role='operator',
        email='f6op@test.com', sectors=['suporte'],
    )


@pytest.fixture
def admin_client(admin_user):
    client = APIClient()
    client.force_authenticate(user=admin_user)
    return client


@pytest.fixture
def operator_client(operator_user):
    client = APIClient()
    client.force_authenticate(user=operator_user)
    return client


@pytest.fixture
def customer(admin_user):
    return Customer.objects.create(
        company_name='Cliente F6 LTDA',
        email='cliente@f6test.com',
        created_by=admin_user,
    )


def make_project(user, customer=None, **kwargs):
    defaults = dict(
        name='Projeto F6',
        customer=customer,
        start_date=date(2026, 6, 1),
        created_by=user,
    )
    defaults.update(kwargs)
    return Project.objects.create(**defaults)


_ticket_seq = iter(range(90001, 99999))


def make_ticket(user, **kwargs):
    defaults = dict(
        number=f'TKT-{next(_ticket_seq)}',
        title='Chamado F6',
        description='Descrição do chamado F6',
        ticket_type='bug',
        status='aberto',
        created_by=user,
    )
    defaults.update(kwargs)
    return SupportTicket.objects.create(**defaults)


# ─── Data migration 0004 (doc 05 §1/§2) ──────────────────────────────────────

@pytest.mark.django_db
class TestDataMigrationRealinhamento:
    @pytest.mark.parametrize('old_type,new_type', [
        ('question', 'duvida'),
        ('feature', 'mudanca'),
        ('performance', 'bug'),
        ('integration', 'bug'),
        ('other', 'bug'),
    ])
    def test_ticket_type_forward(self, admin_user, old_type, new_type):
        ticket = make_ticket(admin_user, ticket_type=old_type)
        data_migration.realign_forward(django_apps, None)
        ticket.refresh_from_db()
        assert ticket.ticket_type == new_type

    @pytest.mark.parametrize('old_status,new_status', [
        ('open', 'aberto'),
        ('in_progress', 'analise'),
        ('pending_client', 'resolvido'),
        ('resolved', 'resolvido'),
        ('closed', 'fechado'),
    ])
    def test_status_forward(self, admin_user, old_status, new_status):
        ticket = make_ticket(admin_user, status=old_status)
        data_migration.realign_forward(django_apps, None)
        ticket.refresh_from_db()
        assert ticket.status == new_status

    def test_bug_stays_bug(self, admin_user):
        ticket = make_ticket(admin_user, ticket_type='bug')
        data_migration.realign_forward(django_apps, None)
        ticket.refresh_from_db()
        assert ticket.ticket_type == 'bug'

    def test_reverse_restores_legacy_values(self, admin_user):
        ticket = make_ticket(admin_user, ticket_type='question', status='open')
        data_migration.realign_forward(django_apps, None)
        data_migration.realign_reverse(django_apps, None)
        ticket.refresh_from_db()
        assert ticket.ticket_type == 'question'
        assert ticket.status == 'open'

    def test_reverse_collapse_documented(self, admin_user):
        """pending_client colapsa em resolvido → reverse devolve resolved."""
        ticket = make_ticket(admin_user, status='pending_client')
        data_migration.realign_forward(django_apps, None)
        data_migration.realign_reverse(django_apps, None)
        ticket.refresh_from_db()
        assert ticket.status == 'resolved'

    def test_new_statuses_untouched_by_forward(self, admin_user):
        ticket = make_ticket(admin_user, status='triagem')
        data_migration.realign_forward(django_apps, None)
        ticket.refresh_from_db()
        assert ticket.status == 'triagem'


# ─── Transition (board) ──────────────────────────────────────────────────────

@pytest.mark.django_db
class TestTicketTransition:
    def test_valid_transition_audits(self, admin_client, admin_user):
        ticket = make_ticket(admin_user, status='aberto')
        resp = admin_client.post(
            f'/api/v1/support/tickets/{ticket.id}/transition/',
            {'status': 'triagem'}, format='json',
        )
        assert resp.status_code == 200
        ticket.refresh_from_db()
        assert ticket.status == 'triagem'
        entry = AuditLog.objects.filter(
            action='support_ticket_transition', resource_id=str(ticket.id),
        ).first()
        assert entry is not None
        assert entry.old_value == {'status': 'aberto'}
        assert entry.new_value == {'status': 'triagem'}

    def test_legacy_status_is_invalid_target(self, admin_client, admin_user):
        ticket = make_ticket(admin_user, status='aberto')
        resp = admin_client.post(
            f'/api/v1/support/tickets/{ticket.id}/transition/',
            {'status': 'in_progress'}, format='json',
        )
        assert resp.status_code == 400
        ticket.refresh_from_db()
        assert ticket.status == 'aberto'

    def test_same_status_rejected(self, admin_client, admin_user):
        ticket = make_ticket(admin_user, status='triagem')
        resp = admin_client.post(
            f'/api/v1/support/tickets/{ticket.id}/transition/',
            {'status': 'triagem'}, format='json',
        )
        assert resp.status_code == 400

    def test_resolvido_sets_resolved_at(self, admin_client, admin_user):
        ticket = make_ticket(admin_user, status='correcao')
        resp = admin_client.post(
            f'/api/v1/support/tickets/{ticket.id}/transition/',
            {'status': 'resolvido'}, format='json',
        )
        assert resp.status_code == 200
        ticket.refresh_from_db()
        assert ticket.resolved_at is not None

    def test_fechado_sets_closed_at(self, admin_client, admin_user):
        ticket = make_ticket(admin_user, status='resolvido')
        resp = admin_client.post(
            f'/api/v1/support/tickets/{ticket.id}/transition/',
            {'status': 'fechado'}, format='json',
        )
        assert resp.status_code == 200
        ticket.refresh_from_db()
        assert ticket.closed_at is not None

    def test_resolve_action_uses_new_status(self, admin_client, admin_user):
        ticket = make_ticket(admin_user, status='correcao')
        resp = admin_client.post(f'/api/v1/support/tickets/{ticket.id}/resolve/')
        assert resp.status_code == 200
        ticket.refresh_from_db()
        assert ticket.status == 'resolvido'

    def test_close_action_uses_new_status(self, admin_client, admin_user):
        ticket = make_ticket(admin_user, status='resolvido')
        resp = admin_client.post(f'/api/v1/support/tickets/{ticket.id}/close/')
        assert resp.status_code == 200
        ticket.refresh_from_db()
        assert ticket.status == 'fechado'

    def test_assign_moves_aberto_to_triagem(self, admin_client, admin_user, operator_user):
        ticket = make_ticket(admin_user, status='aberto')
        resp = admin_client.post(
            f'/api/v1/support/tickets/{ticket.id}/assign/',
            {'user_id': operator_user.id}, format='json',
        )
        assert resp.status_code == 200
        ticket.refresh_from_db()
        assert ticket.status == 'triagem'

    def test_new_ticket_defaults_to_aberto(self, admin_client):
        resp = admin_client.post(
            '/api/v1/support/tickets/',
            {'title': 'Novo', 'description': 'desc'}, format='json',
        )
        assert resp.status_code == 201
        assert resp.data['status'] == 'aberto'
        assert resp.data['contexto'] == 'suporte'


# ─── Analyze (doc 05 §3/§4) ──────────────────────────────────────────────────

@pytest.mark.django_db
class TestTicketAnalyze:
    def _analyze(self, client, ticket, conclusao):
        return client.post(
            f'/api/v1/support/tickets/{ticket.id}/analyze/',
            {'conclusao': conclusao}, format='json',
        )

    def test_garantia_moves_to_correcao(self, admin_client, admin_user, customer):
        project = make_project(admin_user, customer, tipo='fechado')
        ticket = make_ticket(admin_user, status='analise', project=project)
        resp = self._analyze(admin_client, ticket, 'garantia')
        assert resp.status_code == 200
        ticket.refresh_from_db()
        assert ticket.conclusao == 'garantia'
        assert ticket.status == 'correcao'

    def test_orcamento_moves_to_correcao(self, admin_client, admin_user, customer):
        project = make_project(admin_user, customer, tipo='fechado')
        ticket = make_ticket(admin_user, status='analise', project=project)
        resp = self._analyze(admin_client, ticket, 'orcamento')
        assert resp.status_code == 200
        ticket.refresh_from_db()
        assert ticket.conclusao == 'orcamento'

    def test_recorrente_forces_recorrente_corrige(self, admin_client, admin_user, customer):
        """doc 05 §4: Project.tipo == recorrente → sempre corrige."""
        project = make_project(admin_user, customer, tipo='recorrente')
        ticket = make_ticket(admin_user, status='analise', project=project)
        resp = self._analyze(admin_client, ticket, 'garantia')
        assert resp.status_code == 200
        assert resp.data['conclusao_forcada'] is True
        ticket.refresh_from_db()
        assert ticket.conclusao == 'recorrente_corrige'
        assert ticket.status == 'correcao'

    def test_recorrente_inconclusivo_also_forced(self, admin_client, admin_user, customer):
        project = make_project(admin_user, customer, tipo='recorrente')
        ticket = make_ticket(admin_user, status='analise', project=project)
        resp = self._analyze(admin_client, ticket, 'inconclusivo')
        assert resp.status_code == 200
        ticket.refresh_from_db()
        assert ticket.conclusao == 'recorrente_corrige'
        assert DirectorEscalation.objects.count() == 0

    def test_analyze_requires_analise_status(self, admin_client, admin_user):
        ticket = make_ticket(admin_user, status='aberto')
        resp = self._analyze(admin_client, ticket, 'garantia')
        assert resp.status_code == 400
        ticket.refresh_from_db()
        assert ticket.conclusao == ''

    def test_analyze_audits_old_new(self, admin_client, admin_user):
        ticket = make_ticket(admin_user, status='analise')
        self._analyze(admin_client, ticket, 'garantia')
        entry = AuditLog.objects.filter(
            action='support_ticket_analyze', resource_id=str(ticket.id),
        ).first()
        assert entry is not None
        assert entry.old_value['conclusao'] == ''
        assert entry.new_value['conclusao'] == 'garantia'

    def test_conclusao_is_read_only_on_patch(self, admin_client, admin_user):
        ticket = make_ticket(admin_user, status='analise')
        resp = admin_client.patch(
            f'/api/v1/support/tickets/{ticket.id}/',
            {'conclusao': 'garantia'}, format='json',
        )
        assert resp.status_code == 200
        ticket.refresh_from_db()
        assert ticket.conclusao == ''

    def test_invalid_conclusao_rejected(self, admin_client, admin_user):
        ticket = make_ticket(admin_user, status='analise')
        resp = self._analyze(admin_client, ticket, 'invalida')
        assert resp.status_code == 400


# ─── Escalação Diretoria (doc 05 §7, flag AUTOMATION_SUP_ESCALA) ─────────────

@pytest.mark.django_db
class TestEscalacaoDiretoria:
    def _analyze_inconclusivo(self, client, ticket):
        return client.post(
            f'/api/v1/support/tickets/{ticket.id}/analyze/',
            {'conclusao': 'inconclusivo'}, format='json',
        )

    def test_dry_run_default_logs_without_effect(self, settings, admin_client, admin_user):
        settings.AUTOMATION_SUP_ESCALA = 'dry_run'
        ticket = make_ticket(admin_user, status='analise')
        resp = self._analyze_inconclusivo(admin_client, ticket)
        assert resp.status_code == 200
        ticket.refresh_from_db()
        assert ticket.conclusao == 'inconclusivo'
        assert ticket.status == 'analise'  # fica em análise aguardando decisão
        assert DirectorEscalation.objects.count() == 0
        assert AuditLog.objects.filter(
            action='director_escalation_auto_create_dry_run',
        ).exists()

    def test_off_does_nothing(self, settings, admin_client, admin_user):
        settings.AUTOMATION_SUP_ESCALA = 'off'
        ticket = make_ticket(admin_user, status='analise')
        resp = self._analyze_inconclusivo(admin_client, ticket)
        assert resp.status_code == 200
        assert DirectorEscalation.objects.count() == 0
        assert not AuditLog.objects.filter(
            action__startswith='director_escalation_auto_create',
        ).exists()

    def test_on_creates_escalation_and_notifies_admins(
        self, settings, admin_client, admin_user,
    ):
        settings.AUTOMATION_SUP_ESCALA = 'on'
        other_admin = User.objects.create_user(
            username='f6_admin2', password='f6_pass_123!', role='admin',
            email='f6admin2@test.com',
        )
        ticket = make_ticket(admin_user, status='analise')
        resp = self._analyze_inconclusivo(admin_client, ticket)
        assert resp.status_code == 200
        escalation = DirectorEscalation.objects.get(originating_ticket=ticket)
        assert escalation.resolved is False
        assert ticket.number in escalation.summary
        # Notifica todos os admins ativos (doc 06 §1)
        assert Notification.objects.filter(
            user=other_admin, object_type='director_escalation',
            object_id=escalation.id,
        ).exists()
        assert AuditLog.objects.filter(
            action='director_escalation_auto_create',
            resource_id=str(escalation.id),
        ).exists()

    def test_on_is_idempotent(self, settings, admin_client, admin_user):
        settings.AUTOMATION_SUP_ESCALA = 'on'
        ticket = make_ticket(admin_user, status='analise')
        self._analyze_inconclusivo(admin_client, ticket)
        # segundo analyze inconclusivo não duplica a escalação aberta
        self._analyze_inconclusivo(admin_client, ticket)
        assert DirectorEscalation.objects.filter(
            originating_ticket=ticket,
        ).count() == 1


# ─── PedidoUpdate (doc 05 §6, flag AUTOMATION_SUP_PEDIDO_UPDATE) ─────────────

@pytest.mark.django_db
class TestPedidoUpdate:
    def _create_pedido(self, client, ticket, description=''):
        return client.post(
            f'/api/v1/support/tickets/{ticket.id}/pedido-update/',
            {'description': description}, format='json',
        )

    def test_mudanca_creates_pedido(self, admin_client, admin_user, customer):
        ticket = make_ticket(
            admin_user, ticket_type='mudanca', status='triagem', customer=customer,
        )
        resp = self._create_pedido(admin_client, ticket, 'Quero um relatório novo')
        assert resp.status_code == 201
        pedido = PedidoUpdate.objects.get(originating_ticket=ticket)
        assert pedido.status == 'opened'
        assert pedido.customer == customer
        assert pedido.description == 'Quero um relatório novo'

    def test_bug_cannot_create_pedido(self, admin_client, admin_user, customer):
        ticket = make_ticket(
            admin_user, ticket_type='bug', status='triagem', customer=customer,
        )
        resp = self._create_pedido(admin_client, ticket)
        assert resp.status_code == 400
        assert PedidoUpdate.objects.count() == 0

    def test_requires_customer(self, admin_client, admin_user):
        ticket = make_ticket(admin_user, ticket_type='mudanca', status='triagem')
        resp = self._create_pedido(admin_client, ticket)
        assert resp.status_code == 400

    def test_no_duplicate_open_pedido(self, admin_client, admin_user, customer):
        ticket = make_ticket(
            admin_user, ticket_type='mudanca', status='triagem', customer=customer,
        )
        assert self._create_pedido(admin_client, ticket).status_code == 201
        assert self._create_pedido(admin_client, ticket).status_code == 400
        assert PedidoUpdate.objects.count() == 1

    def test_promote_dry_run_default_no_effect(
        self, settings, admin_client, admin_user, customer,
    ):
        settings.AUTOMATION_SUP_PEDIDO_UPDATE = 'dry_run'
        ticket = make_ticket(
            admin_user, ticket_type='mudanca', status='triagem', customer=customer,
        )
        pedido = PedidoUpdate.objects.create(
            originating_ticket=ticket, customer=customer, description='x',
        )
        resp = admin_client.post(
            f'/api/v1/support/pedidos-update/{pedido.id}/promote/',
        )
        assert resp.status_code == 202
        assert resp.data['promoted'] is False
        pedido.refresh_from_db()
        assert pedido.status == 'opened'
        assert pedido.prospect is None
        assert Prospect.objects.count() == 0
        assert AuditLog.objects.filter(action='pedido_update_promote_dry_run').exists()

    def test_promote_off_no_effect(self, settings, admin_client, admin_user, customer):
        settings.AUTOMATION_SUP_PEDIDO_UPDATE = 'off'
        ticket = make_ticket(
            admin_user, ticket_type='mudanca', status='triagem', customer=customer,
        )
        pedido = PedidoUpdate.objects.create(
            originating_ticket=ticket, customer=customer, description='x',
        )
        resp = admin_client.post(
            f'/api/v1/support/pedidos-update/{pedido.id}/promote/',
        )
        assert resp.status_code == 202
        assert Prospect.objects.count() == 0

    def test_promote_on_creates_prospect_tech_analysis(
        self, settings, admin_client, admin_user, customer,
    ):
        """doc 05 §6: Prospect novo entra DIRETO em tech_analysis."""
        settings.AUTOMATION_SUP_PEDIDO_UPDATE = 'on'
        ticket = make_ticket(
            admin_user, ticket_type='mudanca', status='triagem', customer=customer,
        )
        pedido = PedidoUpdate.objects.create(
            originating_ticket=ticket, customer=customer, description='Novo módulo',
        )
        resp = admin_client.post(
            f'/api/v1/support/pedidos-update/{pedido.id}/promote/',
        )
        assert resp.status_code == 200
        pedido.refresh_from_db()
        assert pedido.status == 'promoted'
        assert pedido.promoted_at is not None
        prospect = pedido.prospect
        assert prospect is not None
        assert prospect.status == 'tech_analysis'
        assert prospect.customer == customer
        assert ticket.number in prospect.description
        assert AuditLog.objects.filter(
            action='pedido_update_promote', resource_id=str(pedido.id),
        ).exists()

    def test_promote_twice_rejected(self, settings, admin_client, admin_user, customer):
        settings.AUTOMATION_SUP_PEDIDO_UPDATE = 'on'
        ticket = make_ticket(
            admin_user, ticket_type='mudanca', status='triagem', customer=customer,
        )
        pedido = PedidoUpdate.objects.create(
            originating_ticket=ticket, customer=customer, description='x',
        )
        admin_client.post(f'/api/v1/support/pedidos-update/{pedido.id}/promote/')
        resp = admin_client.post(
            f'/api/v1/support/pedidos-update/{pedido.id}/promote/',
        )
        assert resp.status_code == 400
        assert Prospect.objects.count() == 1

    def test_decline(self, admin_client, admin_user, customer):
        ticket = make_ticket(
            admin_user, ticket_type='mudanca', status='triagem', customer=customer,
        )
        pedido = PedidoUpdate.objects.create(
            originating_ticket=ticket, customer=customer, description='x',
        )
        resp = admin_client.post(
            f'/api/v1/support/pedidos-update/{pedido.id}/decline/',
        )
        assert resp.status_code == 200
        pedido.refresh_from_db()
        assert pedido.status == 'declined'

    def test_status_read_only_on_patch(self, admin_client, admin_user, customer):
        ticket = make_ticket(
            admin_user, ticket_type='mudanca', status='triagem', customer=customer,
        )
        pedido = PedidoUpdate.objects.create(
            originating_ticket=ticket, customer=customer, description='x',
        )
        resp = admin_client.patch(
            f'/api/v1/support/pedidos-update/{pedido.id}/',
            {'status': 'promoted'}, format='json',
        )
        assert resp.status_code == 200
        pedido.refresh_from_db()
        assert pedido.status == 'opened'


# ─── Auto-fechamento (doc 05 §8, flag AUTOMATION_SUP_AUTOCLOSE) ──────────────

@pytest.mark.django_db
class TestAutoClose:
    def _stale_ticket(self, user, days=6, status='resolvido'):
        ticket = make_ticket(user, status=status)
        ticket.resolved_at = timezone.now() - timedelta(days=days)
        ticket.save(update_fields=['resolved_at'])
        return ticket

    def test_on_closes_stale_resolved(self, settings, admin_user):
        settings.AUTOMATION_SUP_AUTOCLOSE = 'on'
        stale = self._stale_ticket(admin_user, days=6)
        fresh = self._stale_ticket(admin_user, days=2)
        count = close_stale_resolved()
        assert count == 1
        stale.refresh_from_db()
        fresh.refresh_from_db()
        assert stale.status == 'fechado'
        assert stale.closed_at is not None
        assert fresh.status == 'resolvido'
        assert AuditLog.objects.filter(action='support_ticket_autoclose').exists()

    def test_closes_legacy_resolved_too(self, settings, admin_user):
        settings.AUTOMATION_SUP_AUTOCLOSE = 'on'
        stale = self._stale_ticket(admin_user, days=6, status='resolved')
        close_stale_resolved()
        stale.refresh_from_db()
        assert stale.status == 'fechado'

    def test_dry_run_default_no_effect(self, settings, admin_user):
        settings.AUTOMATION_SUP_AUTOCLOSE = 'dry_run'
        stale = self._stale_ticket(admin_user, days=6)
        count = close_stale_resolved()
        assert count == 1
        stale.refresh_from_db()
        assert stale.status == 'resolvido'
        assert AuditLog.objects.filter(
            action='support_ticket_autoclose_dry_run',
        ).exists()

    def test_off_does_nothing(self, settings, admin_user):
        settings.AUTOMATION_SUP_AUTOCLOSE = 'off'
        self._stale_ticket(admin_user, days=6)
        assert close_stale_resolved() == 0
        assert not AuditLog.objects.filter(
            action__startswith='support_ticket_autoclose',
        ).exists()

    def test_days_configurable(self, settings, admin_user):
        settings.AUTOMATION_SUP_AUTOCLOSE = 'on'
        settings.SUPPORT_AUTOCLOSE_DAYS = 10
        ticket = self._stale_ticket(admin_user, days=6)
        assert close_stale_resolved() == 0
        ticket.refresh_from_db()
        assert ticket.status == 'resolvido'

    def test_open_tickets_never_closed(self, settings, admin_user):
        settings.AUTOMATION_SUP_AUTOCLOSE = 'on'
        ticket = make_ticket(admin_user, status='analise')
        ticket.resolved_at = timezone.now() - timedelta(days=30)
        ticket.save(update_fields=['resolved_at'])
        close_stale_resolved()
        ticket.refresh_from_db()
        assert ticket.status == 'analise'


# ─── Upload: áudio + magic bytes (doc 05 §9 + doc 08 item 7) ─────────────────

MP3_BYTES = b'ID3\x04\x00\x00\x00\x00\x00\x00' + b'\x00' * 32
WAV_BYTES = b'RIFF\x24\x00\x00\x00WAVEfmt ' + b'\x00' * 32
OGG_BYTES = b'OggS\x00\x02' + b'\x00' * 32
M4A_BYTES = b'\x00\x00\x00\x20ftypM4A ' + b'\x00' * 32
PNG_BYTES = b'\x89PNG\r\n\x1a\n' + b'\x00' * 32
PDF_BYTES = b'%PDF-1.7\n' + b'\x00' * 32


@pytest.mark.django_db
class TestUploadAudioMagicBytes:
    @pytest.mark.parametrize('name,content', [
        ('audio.mp3', MP3_BYTES),
        ('audio.wav', WAV_BYTES),
        ('audio.ogg', OGG_BYTES),
        ('audio.m4a', M4A_BYTES),
    ])
    def test_audio_extensions_accepted(self, name, content):
        upload = SimpleUploadedFile(name, content)
        validate_file_extension(upload)
        validate_file_magic_bytes(upload)  # não levanta

    def test_fake_mp3_rejected(self):
        upload = SimpleUploadedFile('fake.mp3', b'MZ\x90\x00executavel')
        with pytest.raises(ValidationError):
            validate_file_magic_bytes(upload)

    def test_fake_pdf_rejected(self):
        upload = SimpleUploadedFile('fake.pdf', b'MZ\x90\x00executavel')
        with pytest.raises(ValidationError):
            validate_file_magic_bytes(upload)

    def test_webp_as_wav_rejected(self):
        """RIFF genérico não basta — o subtipo (WAVE vs WEBP) é conferido."""
        upload = SimpleUploadedFile('fake.wav', b'RIFF\x24\x00\x00\x00WEBPVP8 ')
        with pytest.raises(ValidationError):
            validate_file_magic_bytes(upload)

    def test_real_pdf_accepted(self):
        upload = SimpleUploadedFile('doc.pdf', PDF_BYTES)
        validate_file_magic_bytes(upload)

    def test_txt_skips_magic_check(self):
        upload = SimpleUploadedFile('notas.txt', b'qualquer conteudo')
        validate_file_magic_bytes(upload)  # sem assinatura → passa

    def test_exe_extension_still_rejected(self):
        upload = SimpleUploadedFile('virus.exe', b'MZ\x90\x00')
        with pytest.raises(ValidationError):
            validate_file_extension(upload)

    def test_attachment_full_clean_validates_magic(self, admin_user):
        ticket = make_ticket(admin_user)
        attachment = TicketAttachment(
            ticket=ticket,
            file=SimpleUploadedFile('fake.mp3', b'nao e mp3'),
            filename='fake.mp3',
            uploaded_by=admin_user,
        )
        with pytest.raises(ValidationError):
            attachment.full_clean()


# ─── Canal público (doc 05 §9) ───────────────────────────────────────────────

@pytest.mark.django_db
class TestPublicTicketChannel:
    def _url(self, customer):
        return f'/api/v1/support/public/tickets/{customer.public_token}/'

    def test_creates_ticket_aberto(self, customer):
        client = APIClient()
        resp = client.post(
            self._url(customer),
            {'title': 'Sistema fora do ar', 'description': 'Desde as 9h',
             'contact_name': 'João', 'contact_email': 'joao@cliente.com'},
            format='json',
        )
        assert resp.status_code == 201
        assert resp.data['success'] is True
        ticket = SupportTicket.objects.get(number=resp.data['number'])
        assert ticket.status == 'aberto'
        assert ticket.customer == customer
        assert ticket.created_by is None
        assert ticket.contact_name == 'João'
        assert AuditLog.objects.filter(
            action='support_ticket_public_create', resource_id=str(ticket.id),
        ).exists()

    def test_invalid_token_404(self, db):
        client = APIClient()
        resp = client.post(
            '/api/v1/support/public/tickets/00000000-0000-0000-0000-000000000000/',
            {'title': 'x', 'description': 'y'}, format='json',
        )
        assert resp.status_code == 404

    def test_inactive_customer_404(self, customer):
        customer.is_active = False
        customer.save(update_fields=['is_active'])
        client = APIClient()
        resp = client.post(
            self._url(customer), {'title': 'x', 'description': 'y'}, format='json',
        )
        assert resp.status_code == 404

    def test_missing_fields_400(self, customer):
        client = APIClient()
        resp = client.post(self._url(customer), {'title': 'x'}, format='json')
        assert resp.status_code == 400

    def test_with_valid_attachment(self, customer):
        client = APIClient()
        resp = client.post(
            self._url(customer),
            {
                'title': 'Print do erro',
                'description': 'Segue print',
                'attachment': SimpleUploadedFile('erro.png', PNG_BYTES),
            },
            format='multipart',
        )
        assert resp.status_code == 201
        ticket = SupportTicket.objects.get(number=resp.data['number'])
        attachment = ticket.attachments.get()
        assert attachment.uploaded_by is None
        assert attachment.filename == 'erro.png'

    def test_with_audio_attachment(self, customer):
        client = APIClient()
        resp = client.post(
            self._url(customer),
            {
                'title': 'Áudio explicando',
                'description': 'Segue áudio',
                'attachment': SimpleUploadedFile('relato.mp3', MP3_BYTES),
            },
            format='multipart',
        )
        assert resp.status_code == 201

    def test_spoofed_attachment_rejected(self, customer):
        client = APIClient()
        resp = client.post(
            self._url(customer),
            {
                'title': 'Anexo malicioso',
                'description': 'x',
                'attachment': SimpleUploadedFile('payload.png', b'MZ\x90\x00'),
            },
            format='multipart',
        )
        assert resp.status_code == 400
        assert SupportTicket.objects.count() == 0

    def test_throttle_5_per_hour_by_token(self, customer):
        client = APIClient()
        for i in range(5):
            resp = client.post(
                self._url(customer),
                {'title': f'Chamado {i}', 'description': 'desc'}, format='json',
            )
            assert resp.status_code == 201
        resp = client.post(
            self._url(customer), {'title': 'sexto', 'description': 'desc'},
            format='json',
        )
        assert resp.status_code == 429

    def test_get_not_allowed(self, customer):
        client = APIClient()
        assert client.get(self._url(customer)).status_code == 405

    def test_public_token_read_only_in_customer_api(self, admin_client, customer):
        original = customer.public_token
        resp = admin_client.patch(
            f'/api/v1/sales/customers/{customer.id}/',
            {'public_token': '11111111-1111-1111-1111-111111111111'},
            format='json',
        )
        assert resp.status_code == 200
        customer.refresh_from_db()
        assert customer.public_token == original
