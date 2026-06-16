"""Testes S7B (RBAC/IDOR/Mass-Assignment) — backend/sales.

Cobre:
- S7B.2: ProspectSerializer.referred_by — operator não seta/altera
- S7B.3: Proposal.approve — operator não aprova proposta própria
- S7B.4: Contract.activate — operator não ativa contrato próprio
- S7B.7: NewLeadsView (n8n) — paginação obrigatória, max 100 + next_cursor
- S7B.8: WebsiteLeadCreateView — exige Origin/Referer válido
- S7B.9: n8n-bot is_active=True + IsN8NBot bloqueia auth não-n8n

Nota: nome do arquivo é `_rbac` porque `test_security_s7b.py` já existe na
suite (cobertura de fluxo público F7B em paralelo).
"""
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from sales.models import Contract, Customer, Proposal, Prospect

User = get_user_model()


# ─── Fixtures ─────────────────────────────────────────────────────────────


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username='s7brbac_admin', email='s7brbac@admin.com',
        password='pass12345', role='admin',
    )


@pytest.fixture
def manager_user(db):
    return User.objects.create_user(
        username='s7brbac_mgr', email='s7brbac@mgr.com',
        password='pass12345', role='manager',
        sectors=['comercial'],  # P2.8: RBAC por setor no Comercial
    )


@pytest.fixture
def operator_user(db):
    return User.objects.create_user(
        username='s7brbac_op', email='s7brbac@op.com',
        password='pass12345', role='operator',
        sectors=['comercial'],  # P2.8: RBAC por setor no Comercial
    )


@pytest.fixture
def operator2_user(db):
    return User.objects.create_user(
        username='s7brbac_op2', email='s7brbac@op2.com',
        password='pass12345', role='operator',
        sectors=['comercial'],  # P2.8: RBAC por setor no Comercial
    )


@pytest.fixture
def viewer_user(db):
    return User.objects.create_user(
        username='s7brbac_view', email='s7brbac@view.com',
        password='pass12345', role='viewer',
    )


@pytest.fixture
def partner_user(db):
    return User.objects.create_user(
        username='s7brbac_partner', email='s7brbac@partner.com',
        password='pass12345', role='partner',
    )


@pytest.fixture
def customer(db, admin_user):
    return Customer.objects.create(
        company_name='ACME S7B RBAC',
        customer_type='PJ',
        email='acme-rbac-s7b@test.com',
        created_by=admin_user,
    )


def _client(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client


# ─── S7B.2: ProspectSerializer.referred_by mass-assignment ────────────────


@pytest.mark.django_db
class TestS7B_2_ProspectReferredByMassAssignment:
    URL = '/api/v1/sales/prospects/'

    def test_operator_cannot_set_referred_by_on_create(
        self, api_client, operator_user, partner_user,
    ):
        c = _client(api_client, operator_user)
        r = c.post(self.URL, {
            'company_name': 'Mass Assign Co',
            'contact_name': 'Joao Mass',
            'contact_email': 'mass@assign.com',
            'contact_phone': '11999999999',
            'source': 'website',
            'status': 'new',
            'referred_by': partner_user.id,
        }, format='json')
        assert r.status_code == 400
        # Confere que retorna erro no campo certo
        body = r.json()
        assert 'referred_by' in body

    def test_operator_cannot_change_referred_by_on_patch(
        self, api_client, operator_user, partner_user, admin_user,
    ):
        prospect = Prospect.objects.create(
            company_name='Existing Co',
            contact_name='Maria',
            contact_email='maria@test.com',
            source='website',
            status='new',
            created_by=admin_user,
        )
        c = _client(api_client, operator_user)
        r = c.patch(
            f'{self.URL}{prospect.id}/',
            {'referred_by': partner_user.id},
            format='json',
        )
        assert r.status_code == 400
        prospect.refresh_from_db()
        assert prospect.referred_by_id is None

    def test_admin_can_set_referred_by(
        self, api_client, admin_user, partner_user,
    ):
        c = _client(api_client, admin_user)
        r = c.post(self.URL, {
            'company_name': 'Admin Sets Co',
            'contact_name': 'Joao Admin',
            'contact_email': 'admin-sets@assign.com',
            'contact_phone': '11999999999',
            'source': 'website',
            'status': 'new',
            'referred_by': partner_user.id,
        }, format='json')
        assert r.status_code == 201, r.content
        body = r.json()
        assert body.get('referred_by') == partner_user.id

    def test_manager_can_set_referred_by(
        self, api_client, manager_user, partner_user,
    ):
        c = _client(api_client, manager_user)
        r = c.post(self.URL, {
            'company_name': 'Manager Sets Co',
            'contact_name': 'Joao Manager',
            'contact_email': 'mgr-sets@assign.com',
            'contact_phone': '11999999999',
            'source': 'website',
            'status': 'new',
            'referred_by': partner_user.id,
        }, format='json')
        assert r.status_code == 201, r.content


# ─── S7B.3: Proposal.approve self-approval ────────────────────────────────


@pytest.mark.django_db
class TestS7B_3_ProposalSelfApproval:
    URL = '/api/v1/sales/proposals/'

    def _make_proposal(self, customer, created_by, status='sent'):
        return Proposal.objects.create(
            customer=customer,
            number=f'P-{created_by.id}-{int(timezone.now().timestamp())%100000}',
            title='Proposta S7B.3',
            proposal_type='software_dev',
            billing_type='fixed',
            total_value=Decimal('1000.00'),
            valid_until=date.today() + timedelta(days=30),
            status=status,
            created_by=created_by,
        )

    def test_operator_cannot_approve_own_proposal(
        self, api_client, operator_user, customer,
    ):
        proposal = self._make_proposal(customer, operator_user)
        c = _client(api_client, operator_user)
        r = c.post(f'{self.URL}{proposal.id}/approve/')
        assert r.status_code == 403
        proposal.refresh_from_db()
        assert proposal.status == 'sent'

    def test_operator_can_approve_proposal_created_by_other(
        self, api_client, operator_user, operator2_user, customer,
    ):
        proposal = self._make_proposal(customer, operator2_user)
        c = _client(api_client, operator_user)
        r = c.post(f'{self.URL}{proposal.id}/approve/')
        assert r.status_code == 200
        proposal.refresh_from_db()
        assert proposal.status == 'approved'

    def test_admin_can_approve_own_proposal(
        self, api_client, admin_user, customer,
    ):
        proposal = self._make_proposal(customer, admin_user)
        c = _client(api_client, admin_user)
        r = c.post(f'{self.URL}{proposal.id}/approve/')
        assert r.status_code == 200
        proposal.refresh_from_db()
        assert proposal.status == 'approved'

    def test_manager_can_approve_own_proposal(
        self, api_client, manager_user, customer,
    ):
        proposal = self._make_proposal(customer, manager_user)
        c = _client(api_client, manager_user)
        r = c.post(f'{self.URL}{proposal.id}/approve/')
        assert r.status_code == 200
        proposal.refresh_from_db()
        assert proposal.status == 'approved'


# ─── S7B.4: Contract.activate self-approval ───────────────────────────────


@pytest.mark.django_db
class TestS7B_4_ContractSelfApproval:
    URL = '/api/v1/sales/contracts/'

    def _make_contract(self, customer, created_by):
        return Contract.objects.create(
            customer=customer,
            number=f'C-{created_by.id}-{int(timezone.now().timestamp())%100000}',
            title='Contrato S7B.4',
            contract_type='software_dev',
            billing_type='monthly',
            start_date=date.today(),
            monthly_value=Decimal('1000.00'),
            status='pending_signature',
            created_by=created_by,
        )

    def test_operator_cannot_activate_own_contract(
        self, api_client, operator_user, customer,
    ):
        contract = self._make_contract(customer, operator_user)
        c = _client(api_client, operator_user)
        # Sem payload de invoices (apenas mudança de status)
        r = c.post(f'{self.URL}{contract.id}/activate/', {}, format='json')
        assert r.status_code == 403
        contract.refresh_from_db()
        assert contract.status == 'pending_signature'

    def test_operator_can_activate_contract_from_other(
        self, api_client, operator_user, operator2_user, customer,
    ):
        contract = self._make_contract(customer, operator2_user)
        c = _client(api_client, operator_user)
        r = c.post(f'{self.URL}{contract.id}/activate/', {}, format='json')
        assert r.status_code == 200
        contract.refresh_from_db()
        assert contract.status == 'active'

    def test_admin_can_activate_own_contract(
        self, api_client, admin_user, customer,
    ):
        contract = self._make_contract(customer, admin_user)
        c = _client(api_client, admin_user)
        r = c.post(f'{self.URL}{contract.id}/activate/', {}, format='json')
        assert r.status_code == 200
        contract.refresh_from_db()
        assert contract.status == 'active'


# ─── S7B.7: NewLeadsView pagination ───────────────────────────────────────


@pytest.mark.django_db
class TestS7B_7_NewLeadsPagination:
    URL = '/api/v1/sales/n8n/new-leads/'

    @pytest.fixture
    def setup_n8n(self, settings, admin_user):
        settings.N8N_API_KEY = 'test-n8n-key-s7b'
        # cria o n8n-bot user explicitamente (mesmo padrão da auth)
        User.objects.get_or_create(
            username='n8n-bot',
            defaults={
                'email': 'n8n-bot@inovasystems.com.br',
                'role': 'operator',
                'is_active': True,
            },
        )
        return settings

    def _bulk_create_leads(self, admin_user, n):
        leads = []
        for i in range(n):
            leads.append(Prospect(
                company_name=f'Lead {i}',
                contact_name=f'Joao {i}',
                contact_email=f'lead{i}@test.com',
                contact_phone='11999999999',
                source='website',
                status='new',
                created_by=admin_user,
            ))
        return Prospect.objects.bulk_create(leads)

    def test_caps_at_page_size(self, api_client, admin_user, setup_n8n):
        self._bulk_create_leads(admin_user, 150)
        r = api_client.get(self.URL, HTTP_X_API_KEY='test-n8n-key-s7b')
        assert r.status_code == 200, r.content
        data = r.json()
        assert data['count'] == 100
        assert 'next_cursor' in data

    def test_no_next_cursor_when_under_limit(self, api_client, admin_user, setup_n8n):
        self._bulk_create_leads(admin_user, 30)
        r = api_client.get(self.URL, HTTP_X_API_KEY='test-n8n-key-s7b')
        assert r.status_code == 200
        data = r.json()
        assert data['count'] == 30
        assert 'next_cursor' not in data

    def test_cursor_pagination(self, api_client, admin_user, setup_n8n):
        self._bulk_create_leads(admin_user, 150)
        r1 = api_client.get(self.URL, HTTP_X_API_KEY='test-n8n-key-s7b')
        cursor = r1.json()['next_cursor']
        r2 = api_client.get(
            f'{self.URL}?cursor={cursor}',
            HTTP_X_API_KEY='test-n8n-key-s7b',
        )
        assert r2.status_code == 200
        data = r2.json()
        assert data['count'] == 50
        assert 'next_cursor' not in data


# ─── S7B.8: WebsiteLeadCreateView Origin check ────────────────────────────


@pytest.mark.django_db
class TestS7B_8_WebsiteLeadOriginCheck:
    URL = '/api/v1/sales/website-lead/'

    @pytest.fixture
    def setup_website(self, settings):
        settings.WEBSITE_API_KEY = 'test-website-key-s7b'
        settings.WEBSITE_ALLOWED_ORIGINS = [
            'https://inovasystemssolutions.com',
            'https://www.inovasystemssolutions.com',
        ]
        return settings

    def _valid_payload(self):
        return {
            'nome': 'Joao Lead',
            'empresa': 'Empresa S7B.8',
            'email': 'lead@s7b8.com',
            'whatsapp': '11999999999',
            'servico': 'Aplicação Web',
            'tamanho': 'Pequena empresa',
            'faturamento': 'R$20 mil a R$100 mil',
            'budget': 'R$10.000 a R$30.000',
            'descricao': '',
        }

    def test_rejects_missing_origin(self, api_client, setup_website):
        r = api_client.post(
            self.URL, self._valid_payload(), format='json',
            HTTP_X_API_KEY='test-website-key-s7b',
        )
        assert r.status_code == 403
        assert 'origin' in r.json().get('error', '').lower()

    def test_rejects_unknown_origin(self, api_client, setup_website):
        r = api_client.post(
            self.URL, self._valid_payload(), format='json',
            HTTP_ORIGIN='https://attacker.com',
            HTTP_X_API_KEY='test-website-key-s7b',
        )
        assert r.status_code == 403

    def test_rejects_suffix_spoofed_origin(self, api_client, setup_website):
        """SEC-018: origin que apenas COMEÇA com o domínio permitido (mas é
        outro host) deve ser rejeitado — startswith puro deixava passar."""
        r = api_client.post(
            self.URL, self._valid_payload(), format='json',
            HTTP_ORIGIN='https://inovasystemssolutions.com.evil.com',
            HTTP_X_API_KEY='test-website-key-s7b',
        )
        assert r.status_code == 403

    def test_accepts_allowed_origin(self, api_client, setup_website):
        r = api_client.post(
            self.URL, self._valid_payload(), format='json',
            HTTP_ORIGIN='https://inovasystemssolutions.com',
            HTTP_X_API_KEY='test-website-key-s7b',
        )
        assert r.status_code == 201, r.content

    def test_accepts_allowed_referer(self, api_client, setup_website):
        r = api_client.post(
            self.URL, self._valid_payload(), format='json',
            HTTP_REFERER='https://www.inovasystemssolutions.com/contato',
            HTTP_X_API_KEY='test-website-key-s7b',
        )
        assert r.status_code == 201, r.content

    def test_empty_allowed_origins_blocks_all(self, api_client, settings):
        settings.WEBSITE_API_KEY = 'test-website-key-s7b'
        settings.WEBSITE_ALLOWED_ORIGINS = []
        r = api_client.post(
            self.URL, self._valid_payload(), format='json',
            HTTP_ORIGIN='https://inovasystemssolutions.com',
            HTTP_X_API_KEY='test-website-key-s7b',
        )
        assert r.status_code == 403

    def test_origin_check_before_api_key(self, api_client, setup_website):
        """Origin rejeitado primeiro → não vaza se API key existe."""
        r = api_client.post(
            self.URL, self._valid_payload(), format='json',
            HTTP_ORIGIN='https://attacker.com',
            HTTP_X_API_KEY='wrong-key',
        )
        # Deve ser 403 (Origin) e não 401 (API key) — não dá pista
        # ao atacante sobre validade da key.
        assert r.status_code == 403


# ─── S7B.9: n8n-bot is_active + IsN8NBot ──────────────────────────────────


@pytest.mark.django_db
class TestS7B_9_N8NBotPermission:
    URL = '/api/v1/sales/n8n/new-leads/'

    @pytest.fixture
    def setup_n8n(self, settings):
        settings.N8N_API_KEY = 'test-n8n-key-s7b-9'
        return settings

    def test_n8n_bot_user_active_after_auth(self, api_client, setup_n8n):
        api_client.get(self.URL, HTTP_X_API_KEY='test-n8n-key-s7b-9')
        bot = User.objects.get(username='n8n-bot')
        assert bot.is_active is True

    def test_session_auth_with_n8n_bot_blocked(
        self, api_client, setup_n8n,
    ):
        """Mesmo um user 'n8n-bot' autenticado por sessão JWT NÃO passa
        em IsN8NBot (que checa request.auth == 'n8n-api-key')."""
        bot, _ = User.objects.get_or_create(
            username='n8n-bot',
            defaults={
                'email': 'n8n-bot@inovasystems.com.br',
                'role': 'operator',
                'is_active': True,
            },
        )
        # Force authenticate sem passar pelo N8NApiKeyAuthentication
        # (deixa request.auth=None).
        api_client.force_authenticate(user=bot)
        r = api_client.get(self.URL)
        assert r.status_code == 403

    def test_admin_session_blocked_from_n8n_endpoint(
        self, api_client, admin_user, setup_n8n,
    ):
        api_client.force_authenticate(user=admin_user)
        r = api_client.get(self.URL)
        assert r.status_code == 403

    def test_n8n_bot_self_heal_is_active(self, api_client, setup_n8n):
        """Se o bot foi previamente criado com is_active=False, próxima
        request via API key deve reativá-lo (self-heal)."""
        bot = User.objects.create_user(
            username='n8n-bot',
            email='n8n-bot@inovasystems.com.br',
            role='operator',
            is_active=False,
        )
        assert bot.is_active is False
        api_client.get(self.URL, HTTP_X_API_KEY='test-n8n-key-s7b-9')
        bot.refresh_from_db()
        assert bot.is_active is True


# ─── SEC-019: SendEmailView ignora 'from' do request ──────────────────────


@pytest.mark.django_db
class TestSEC019SendEmailFrom:
    URL = '/api/v1/sales/n8n/send-email/'

    @pytest.fixture
    def setup_n8n(self, settings):
        settings.N8N_API_KEY = 'test-n8n-key-sec019'
        settings.EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
        settings.DEFAULT_FROM_EMAIL = 'noreply@inovasystems.test'
        return settings

    def test_from_is_forced_to_default(self, api_client, setup_n8n):
        """SEC-019: o campo 'from' do payload é ignorado — o e-mail sai sempre
        com settings.DEFAULT_FROM_EMAIL (anti-spoofing)."""
        from django.core import mail

        r = api_client.post(
            self.URL,
            {
                'to': 'dest@cliente.com',
                'subject': 'Follow-up',
                'body': '<p>Olá</p>',
                'from': 'spoofed@attacker.com',
            },
            format='json',
            HTTP_X_API_KEY='test-n8n-key-sec019',
        )
        assert r.status_code == 200, r.content
        assert len(mail.outbox) == 1
        assert mail.outbox[0].from_email == 'noreply@inovasystems.test'
