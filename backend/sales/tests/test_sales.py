import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from django.utils import timezone

from sales.models import Customer, Prospect, Proposal, Contract

User = get_user_model()


# ─── FIXTURES ────────────────────────────────────────────────────────────────

@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def manager_user(db):
    return User.objects.create_user(
        username='manager_sales',
        email='manager@salestest.com',
        password='manager_pass_123',
        role='manager',
    )


@pytest.fixture
def operator_user(db):
    return User.objects.create_user(
        username='operator_sales',
        email='operator@salestest.com',
        password='operator_pass_123',
        role='operator',
    )


@pytest.fixture
def viewer_user(db):
    return User.objects.create_user(
        username='viewer_sales',
        email='viewer@salestest.com',
        password='viewer_pass_123',
        role='viewer',
    )


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
def customer(db, manager_user):
    return Customer.objects.create(
        company_name='ACME Corp',
        customer_type='PJ',
        email='acme@test.com',
        created_by=manager_user,
    )


@pytest.fixture
def proposal(db, manager_user, customer):
    return Proposal.objects.create(
        customer=customer,
        number='PROP-00001',
        title='Sistema ERP',
        proposal_type='software_dev',
        billing_type='fixed',
        total_value=50000,
        valid_until=timezone.now().date(),
        created_by=manager_user,
        status='draft',
    )


@pytest.fixture
def contract(db, manager_user, customer):
    return Contract.objects.create(
        customer=customer,
        number='CTR-00001',
        title='Contrato ERP',
        contract_type='software_dev',
        billing_type='fixed',
        start_date=timezone.now().date(),
        status='pending_signature',
        created_by=manager_user,
    )


# ─── CUSTOMER ────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestCustomer:
    url = '/api/v1/sales/customers/'

    def test_list_customers_manager(self, manager_client, customer):
        response = manager_client.get(self.url)
        assert response.status_code == status.HTTP_200_OK

    def test_list_customers_operator(self, operator_client, customer):
        response = operator_client.get(self.url)
        assert response.status_code == status.HTTP_200_OK

    def test_list_customers_requires_auth(self, api_client):
        response = api_client.get(self.url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_customers_viewer_forbidden(self, viewer_client):
        response = viewer_client.get(self.url)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_create_customer(self, manager_client):
        payload = {
            'company_name': 'New Client SA',
            'customer_type': 'PJ',
            'email': 'newclient@test.com',
        }
        response = manager_client.post(self.url, payload)
        assert response.status_code == status.HTTP_201_CREATED
        assert Customer.objects.filter(company_name='New Client SA').exists()

    def test_search_customer_by_name(self, manager_client, customer):
        response = manager_client.get(self.url, {'search': 'ACME'})
        assert response.status_code == status.HTTP_200_OK
        assert response.data['count'] >= 1

    def test_update_customer(self, manager_client, customer):
        url = f'{self.url}{customer.id}/'
        response = manager_client.patch(url, {'company_name': 'ACME Updated'})
        assert response.status_code == status.HTTP_200_OK
        customer.refresh_from_db()
        assert customer.company_name == 'ACME Updated'

    def test_delete_customer(self, manager_client, customer):
        url = f'{self.url}{customer.id}/'
        response = manager_client.delete(url)
        assert response.status_code == status.HTTP_204_NO_CONTENT


# ─── PROSPECT ────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestProspect:
    url = '/api/v1/sales/prospects/'

    def test_create_prospect(self, manager_client):
        payload = {
            'company_name': 'Startup XYZ',
            'contact_name': 'João Silva',
            'contact_email': 'joao@startup.com',
            'status': 'new',
            'source': 'website',
        }
        response = manager_client.post(self.url, payload)
        assert response.status_code == status.HTTP_201_CREATED

    def test_pipeline_action(self, manager_client, db, manager_user):
        Prospect.objects.create(
            company_name='P1', contact_name='C1', contact_email='c1@test.com',
            status='new', source='website', created_by=manager_user
        )
        Prospect.objects.create(
            company_name='P2', contact_name='C2', contact_email='c2@test.com',
            status='qualified', source='referral', created_by=manager_user
        )
        response = manager_client.get(f'{self.url}pipeline/')
        assert response.status_code == status.HTTP_200_OK
        statuses = [item['status'] for item in response.data]
        assert 'new' in statuses
        assert 'qualified' in statuses

    def test_filter_by_status(self, manager_client, db, manager_user):
        Prospect.objects.create(
            company_name='Closed', contact_name='C', contact_email='c@t.com',
            status='won', source='website', created_by=manager_user
        )
        response = manager_client.get(self.url, {'status': 'won'})
        assert response.status_code == status.HTTP_200_OK
        assert all(p['status'] == 'won' for p in response.data['results'])

    def test_create_prospect_with_multiple_services(self, manager_client):
        payload = {
            'company_name': 'Tech Corp',
            'contact_name': 'Ana Lima',
            'contact_email': 'ana@tech.com',
            'status': 'qualifying',
            'source': 'referral',
            'service_interest': ['software_dev', 'mobile', 'ai'],
        }
        response = manager_client.post(self.url, payload, format='json')
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['service_interest'] == ['software_dev', 'mobile', 'ai']

    def test_create_prospect_with_invalid_service(self, manager_client):
        payload = {
            'company_name': 'Bad Corp',
            'contact_name': 'X',
            'contact_email': 'x@x.com',
            'status': 'new',
            'source': 'website',
            'service_interest': ['invalid_value'],
        }
        response = manager_client.post(self.url, payload, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_create_prospect_with_status_on_creation(self, manager_client):
        """Status deve ser definível na criação (não apenas em edição)."""
        payload = {
            'company_name': 'Corp XYZ',
            'contact_name': 'B',
            'contact_email': 'b@corp.com',
            'status': 'qualified',
            'source': 'linkedin',
        }
        response = manager_client.post(self.url, payload)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['status'] == 'qualified'

    # ── Bug #10: comissao de parceiro NAO pode vir de campo livre ──────────
    def test_partner_commission_uses_approved_proposal_value(
        self, db, manager_user, customer,
    ):
        """Bug #10: comissao de parceiro deve usar Proposal.total_value de
        proposta aprovada (passou pelo workflow), NAO prospect.proposal_value
        que e' livremente editavel pelo operator.
        """
        from sales.models import PartnerCommission, Proposal as P
        from sales.views import ProspectViewSet

        partner = User.objects.create_user(
            username='partner_af', email='partner_af@x.com',
            password='x', role='partner', is_active=True,
        )

        prospect = Prospect.objects.create(
            company_name='Anti Fraude Co', contact_name='X',
            contact_email='x@af.com',
            status='proposal', source='referral',
            created_by=manager_user,
            proposal_value=50000,  # INFLADO — operator mexeu livremente
            referred_by=partner,
        )

        # Proposta aprovada com valor REAL (passou pelo fluxo de aprovacao)
        P.objects.create(
            prospect=prospect, customer=customer,
            number='PROP-AF-001', title='AF', proposal_type='software_dev',
            billing_type='fixed',
            total_value=15000,  # valor real
            valid_until=timezone.now().date(),
            status='approved',
            created_by=manager_user,
        )

        # Dispara geracao de comissao
        ProspectViewSet._generate_partner_commission(prospect)

        commission = PartnerCommission.objects.filter(prospect=prospect).first()
        assert commission is not None, 'Comissao deveria ter sido criada'
        # Comissao usa 15000 (Proposal.total_value), NAO 50000 (proposal_value inflado)
        # Faixa 10-25k = 10% = 1500
        assert float(commission.project_value) == 15000.0, (
            f"project_value deveria ser 15000 (do Proposal aprovado), "
            f"foi {commission.project_value}"
        )
        assert float(commission.commission_value) == 1500.0, (
            f"commission_value deveria ser 1500 (10% de 15000), "
            f"foi {commission.commission_value}"
        )

    # ── Bug #7: WinLossReason obrigatorio na transicao para 'lost' ──────────
    def test_transition_to_lost_without_win_loss_reason_is_rejected(
        self, manager_client, db, manager_user,
    ):
        """PATCH status='lost' sem WinLossReason existente deve falhar (400).
        Antes do fix, o backend aceitava e o KPI de motivo de perda era
        perdido se o frontend nao registrasse depois.
        """
        prospect = Prospect.objects.create(
            company_name='Lost Co', contact_name='X',
            contact_email='x@lost.com',
            status='proposal', source='website',
            created_by=manager_user,
        )
        response = manager_client.patch(
            f'/api/v1/sales/prospects/{prospect.id}/',
            {'status': 'lost'}, format='json',
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST, (
            f"PATCH lost sem WinLossReason deveria ser 400, foi "
            f"{response.status_code}: {response.data}"
        )
        prospect.refresh_from_db()
        assert prospect.status != 'lost', (
            f'Status nao deveria ter mudado, esta {prospect.status}'
        )

    def test_transition_to_lost_with_win_loss_reason_is_accepted(
        self, manager_client, db, manager_user,
    ):
        """PATCH status='lost' com WinLossReason ja registrado deve passar."""
        from sales.models import WinLossReason
        prospect = Prospect.objects.create(
            company_name='Lost OK Inc', contact_name='X',
            contact_email='x@lostok.com',
            status='proposal', source='website',
            created_by=manager_user,
        )
        WinLossReason.objects.create(
            prospect=prospect, result='lost', reason='price',
        )
        response = manager_client.patch(
            f'/api/v1/sales/prospects/{prospect.id}/',
            {'status': 'lost'}, format='json',
        )
        assert response.status_code == status.HTTP_200_OK, response.data
        prospect.refresh_from_db()
        assert prospect.status == 'lost'


# ─── PROPOSAL ────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestProposal:
    url = '/api/v1/sales/proposals/'

    def test_create_proposal(self, manager_client, customer):
        payload = {
            'customer': customer.id,
            'title': 'Proposta de Sistema',
            'proposal_type': 'software_dev',
            'billing_type': 'fixed',
            'total_value': '10000.00',
            'valid_until': str(timezone.now().date()),
        }
        response = manager_client.post(self.url, payload)
        assert response.status_code == status.HTTP_201_CREATED
        assert 'number' in response.data
        assert response.data['number'].startswith('PROP-')

    def test_proposal_number_auto_generated(self, manager_client, customer):
        payload = {
            'customer': customer.id,
            'title': 'Proposta A',
            'proposal_type': 'consulting',
            'billing_type': 'hourly',
            'total_value': '5000.00',
            'valid_until': str(timezone.now().date()),
        }
        r1 = manager_client.post(self.url, payload)
        r2 = manager_client.post(self.url, {**payload, 'title': 'Proposta B'})
        assert r1.status_code == status.HTTP_201_CREATED
        assert r2.status_code == status.HTTP_201_CREATED
        assert r1.data['number'] != r2.data['number']

    def test_send_proposal_from_draft(self, manager_client, proposal):
        url = f'{self.url}{proposal.id}/send/'
        response = manager_client.post(url)
        assert response.status_code == status.HTTP_200_OK
        proposal.refresh_from_db()
        assert proposal.status == 'sent'

    def test_send_proposal_not_from_draft_fails(self, manager_client, proposal):
        proposal.status = 'sent'
        proposal.save()
        url = f'{self.url}{proposal.id}/send/'
        response = manager_client.post(url)
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_approve_proposal_from_sent(self, manager_client, proposal):
        proposal.status = 'sent'
        proposal.save()
        url = f'{self.url}{proposal.id}/approve/'
        response = manager_client.post(url)
        assert response.status_code == status.HTTP_200_OK
        proposal.refresh_from_db()
        assert proposal.status == 'approved'

    def test_reject_proposal(self, manager_client, proposal):
        proposal.status = 'sent'
        proposal.save()
        url = f'{self.url}{proposal.id}/reject/'
        response = manager_client.post(url)
        assert response.status_code == status.HTTP_200_OK
        proposal.refresh_from_db()
        assert proposal.status == 'rejected'

    def test_reject_approved_proposal_fails(self, manager_client, proposal):
        proposal.status = 'approved'
        proposal.save()
        url = f'{self.url}{proposal.id}/reject/'
        response = manager_client.post(url)
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_convert_to_contract(self, manager_client, proposal):
        proposal.status = 'approved'
        proposal.save()
        url = f'{self.url}{proposal.id}/convert_to_contract/'
        response = manager_client.post(url)
        assert response.status_code == status.HTTP_201_CREATED
        assert 'number' in response.data
        assert response.data['number'].startswith('CTR-')

    def test_convert_non_approved_proposal_fails(self, manager_client, proposal):
        # proposal.status is 'draft' by default
        url = f'{self.url}{proposal.id}/convert_to_contract/'
        response = manager_client.post(url)
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_list_proposals_operator(self, operator_client, proposal):
        response = operator_client.get(self.url)
        assert response.status_code == status.HTTP_200_OK

    def test_list_proposals_viewer_forbidden(self, viewer_client):
        response = viewer_client.get(self.url)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_create_proposal_from_prospect_moves_status(self, manager_client, db, manager_user):
        """Criar proposta vinculada a um lead deve mover o lead para 'proposal'."""
        prospect = Prospect.objects.create(
            company_name='Lead Corp', contact_name='Ana', contact_email='ana@lead.com',
            status='qualified', source='website', created_by=manager_user,
        )
        payload = {
            'prospect': prospect.id,
            'title': 'Proposta Lead Corp',
            'proposal_type': 'software_dev',
            'billing_type': 'fixed',
            'total_value': '20000.00',
            'valid_until': '2026-12-31',
        }
        response = manager_client.post(self.url, payload)
        assert response.status_code == status.HTTP_201_CREATED
        # Proposta nasce como 'draft'
        assert response.data['status'] == 'draft'

    def test_create_proposal_does_not_move_won_prospect(self, manager_client, db, manager_user):
        """Lead já ganho não deve ter o status revertido ao criar segunda proposta."""
        prospect = Prospect.objects.create(
            company_name='Won Corp', contact_name='Bob', contact_email='bob@won.com',
            status='won', source='referral', created_by=manager_user,
        )
        payload = {
            'prospect': prospect.id,
            'title': 'Proposta Won Corp',
            'proposal_type': 'consulting',
            'billing_type': 'hourly',
            'total_value': '5000.00',
            'valid_until': '2026-12-31',
        }
        response = manager_client.post(self.url, payload)
        assert response.status_code == status.HTTP_201_CREATED
        prospect.refresh_from_db()
        assert prospect.status == 'won'  # não foi alterado

    def test_unauthenticated_forbidden(self, api_client):
        response = api_client.get(self.url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    # ── Bug #11: proposal status após conversão em contrato ─────────────────
    def test_convert_to_contract_marks_proposal_as_converted(
        self, manager_client, proposal
    ):
        """Após convert_to_contract, a Proposal deve sair de 'approved'
        e ir para 'converted' — caso contrário ela permanece eternamente
        no KPI de 'propostas em aberto' do dashboard.
        """
        proposal.status = 'approved'
        proposal.save()
        url = f'{self.url}{proposal.id}/convert_to_contract/'
        response = manager_client.post(url)
        assert response.status_code == status.HTTP_201_CREATED, response.data
        proposal.refresh_from_db()
        assert proposal.status == 'converted', (
            f"Proposta deveria estar 'converted', está '{proposal.status}'"
        )

    def test_converted_proposal_excluded_from_pipeline_kpi(
        self, manager_client, proposal
    ):
        """Dashboard deve contar 'em aberto' SEM incluir propostas convertidas.
        Antes do fix, converted era 'approved' e contava como pipeline para sempre.
        """
        proposal.status = 'approved'
        proposal.save()
        # Converte
        manager_client.post(f'{self.url}{proposal.id}/convert_to_contract/')
        # Dashboard não deve contar essa proposta como pipeline
        response = manager_client.get(f'{self.url}dashboard/')
        assert response.status_code == status.HTTP_200_OK
        proposal.refresh_from_db()
        # KPI 'sent_count' representa pipeline em aberto. Proposta convertida
        # não conta porque já virou contrato.
        # A asserção é por valor: se essa única proposta converteu, sent_count
        # da fixture deve ser 0 (não havia outras propostas em aberto).
        assert response.data['sent_count'] == 0, (
            f"Proposta convertida ainda aparece em 'sent_count'="
            f"{response.data['sent_count']}, status={proposal.status}"
        )

    # ── Bug D2: proposta aprovada deve sair de "em aberto" ──────────────────
    def test_approved_proposal_excluded_from_open_kpi(
        self, manager_client, proposal,
    ):
        """Dashboard Comercial — proposta aprovada vai para o card "Aprovadas"
        e DEVE sair de "Em Aberto". Antes do fix, 'approved' estava em
        pipeline_statuses junto com sent/viewed/negotiation, causando
        dupla contagem e inflando o KPI de em aberto.
        """
        proposal.status = 'approved'
        proposal.save()

        response = manager_client.get(f'{self.url}dashboard/')
        assert response.status_code == status.HTTP_200_OK

        # Aprovada conta APENAS em approved_count, NAO em sent_count
        assert response.data['approved_count'] == 1
        assert response.data['sent_count'] == 0, (
            f"Proposta aprovada nao deveria contar como 'em aberto'. "
            f"sent_count={response.data['sent_count']}"
        )
        # Valores idem: sent_value zera, approved_value tem o valor
        assert response.data['sent_value'] == 0
        assert response.data['approved_value'] > 0

    def test_open_kpi_counts_only_sent_viewed_negotiation(
        self, manager_client, db, manager_user, customer,
    ):
        """3 propostas: 1 sent, 1 viewed, 1 negotiation, 1 approved, 1 rejected.
        sent_count deve ser 3 (apenas sent/viewed/negotiation).
        """
        for i, st in enumerate(['sent', 'viewed', 'negotiation', 'approved', 'rejected']):
            Proposal.objects.create(
                customer=customer,
                number=f'PROP-D2-{i:03d}',
                title=f'P{i}',
                proposal_type='software_dev', billing_type='fixed',
                total_value=1000,
                valid_until=timezone.now().date(),
                status=st,
                created_by=manager_user,
            )

        response = manager_client.get(f'{self.url}dashboard/')
        assert response.data['sent_count'] == 3, (
            f"sent_count deveria ser 3 (sent+viewed+negotiation), "
            f"foi {response.data['sent_count']}"
        )
        assert response.data['approved_count'] == 1
        assert float(response.data['sent_value']) == 3000.0
        assert float(response.data['approved_value']) == 1000.0

    # ── Bug #3+#5: idempotencia e atomicidade de _generate_receivables ──────
    def test_won_revert_does_not_duplicate_receivables(
        self, manager_client, db, manager_user,
    ):
        """Mover prospect won -> production -> won NAO deve duplicar
        as faturas A Receber. Sem o fix, cada transicao para 'won'
        re-dispara _generate_receivables.
        """
        from finance.models import Invoice
        Customer.objects.create(
            company_name='Idempo Corp', email='idempo@x.com',
            customer_type='PJ', created_by=manager_user,
        )
        prospect = Prospect.objects.create(
            company_name='Idempo Corp', contact_name='X',
            contact_email='x@idempo.com',
            status='proposal', source='website',
            created_by=manager_user,
            proposal_value=10000, payment_type='one_time',
        )

        prospects_url = '/api/v1/sales/prospects/'

        # 1a transicao para won — gera receivables
        r1 = manager_client.patch(
            f'{prospects_url}{prospect.id}/', {'status': 'won'}, format='json',
        )
        assert r1.status_code == status.HTTP_200_OK, r1.data
        count_first = Invoice.objects.filter(invoice_type='receivable').count()
        assert count_first >= 1, 'Primeira transicao deveria gerar receivables'

        # Volta para production, depois para won de novo
        manager_client.patch(
            f'{prospects_url}{prospect.id}/', {'status': 'production'},
            format='json',
        )
        manager_client.patch(
            f'{prospects_url}{prospect.id}/', {'status': 'won'},
            format='json',
        )

        count_second = Invoice.objects.filter(invoice_type='receivable').count()
        assert count_second == count_first, (
            f"Receivables duplicaram em re-transicao won: "
            f"{count_first} -> {count_second}"
        )

    # ── Bug #4: idempotencia de _generate_commissions ───────────────────────
    def test_approve_proposal_does_not_duplicate_commissions(
        self, manager_client, proposal,
    ):
        """Aprovar a mesma proposta duas vezes (admin revertendo status no
        Django Admin) NAO deve duplicar ClientCost de comissoes Closer/SDR.
        """
        from finance.models import ClientCost
        proposal.status = 'sent'
        proposal.total_value = 10000
        proposal.save()

        # 1a aprovacao — cria Closer + SDR
        r1 = manager_client.post(f'{self.url}{proposal.id}/approve/')
        assert r1.status_code == status.HTTP_200_OK, r1.data
        count_first = ClientCost.objects.filter(
            cost_category='comercial',
            notes__icontains=proposal.number,
        ).count()
        assert count_first >= 2, 'Primeira aprovacao deveria criar 2 ClientCost'

        # Admin reverte para 'sent' e re-aprova
        proposal.refresh_from_db()
        proposal.status = 'sent'
        proposal.save(update_fields=['status'])
        r2 = manager_client.post(f'{self.url}{proposal.id}/approve/')
        assert r2.status_code == status.HTTP_200_OK, r2.data

        count_second = ClientCost.objects.filter(
            cost_category='comercial',
            notes__icontains=proposal.number,
        ).count()
        assert count_second == count_first, (
            f"Comissoes duplicaram em re-aprovacao: "
            f"{count_first} -> {count_second}"
        )


# ─── CONTRACT ────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestContract:
    url = '/api/v1/sales/contracts/'

    def test_create_contract(self, manager_client, customer):
        payload = {
            'customer': customer.id,
            'title': 'Contrato de Suporte',
            'contract_type': 'support',
            'billing_type': 'monthly',
            'start_date': str(timezone.now().date()),
            'monthly_value': '3000.00',
        }
        response = manager_client.post(self.url, payload)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['number'].startswith('CTR-')

    def test_activate_contract(self, manager_client, contract):
        url = f'{self.url}{contract.id}/activate/'
        response = manager_client.post(url)
        assert response.status_code == status.HTTP_200_OK
        contract.refresh_from_db()
        assert contract.status == 'active'

    def test_activate_non_pending_contract_fails(self, manager_client, contract):
        contract.status = 'active'
        contract.save()
        url = f'{self.url}{contract.id}/activate/'
        response = manager_client.post(url)
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    # ── Bug #6: auto-renew deve copiar payment_plan e services ─────────────
    def test_auto_renew_copies_payment_plan_and_services(
        self, db, manager_user, customer,
    ):
        """Renovacao automatica via Celery deve copiar ContractPaymentPlan e
        ContractService do contrato original. Sem isso, o Financeiro nao tem
        plano para gerar faturas recorrentes — MRR "fantasma" inflado.
        """
        from datetime import date as _date, timedelta as _td
        from sales.tasks import check_contract_renewals
        from sales.models import (
            ContractPaymentPlan, ContractService, Service,
        )

        # Servico no catalogo
        svc = Service.objects.create(
            code='test-renew-svc', name='Test Renew Service',
        )

        # Contrato original — ja vencido + auto_renew=True
        original = Contract.objects.create(
            customer=customer,
            number='CTR-RENEW-001',
            title='Contrato Original',
            contract_type='software_dev',
            billing_type='monthly',
            start_date=_date.today() - _td(days=365),
            end_date=_date.today() - _td(days=1),
            auto_renew=True,
            monthly_value=1500,
            status='active',
            created_by=manager_user,
        )
        ContractService.objects.create(
            contract=original, service=svc, display_order=0, notes='kickoff',
        )
        ContractPaymentPlan.objects.create(
            contract=original,
            plan_type='recurring_only',
            recurring_amount=1500,
            recurring_duration_months=12,
        )

        # Roda a task de renovacao
        result = check_contract_renewals()

        # Deve ter renovado 1 contrato
        assert result['renewed'] == 1, (
            f"Esperava 1 renovacao, foi {result['renewed']}"
        )

        # Acha o contrato renovado
        renewed = Contract.objects.filter(
            notes__icontains='Renovação automática',
        ).first()
        assert renewed is not None, 'Contrato renovado nao foi criado'

        # payment_plan copiado
        assert hasattr(renewed, 'payment_plan'), (
            'payment_plan nao foi copiado — Financeiro nao gerara faturas'
        )
        assert renewed.payment_plan.recurring_amount == original.payment_plan.recurring_amount
        assert renewed.payment_plan.plan_type == 'recurring_only'

        # services copiados
        assert renewed.service_items.count() == 1, (
            'service_items nao foram copiados'
        )
        assert renewed.service_items.first().service_id == svc.id

    def test_cancel_contract(self, manager_client, contract):
        contract.status = 'active'
        contract.save()
        url = f'{self.url}{contract.id}/cancel/'
        response = manager_client.post(url)
        assert response.status_code == status.HTTP_200_OK
        contract.refresh_from_db()
        assert contract.status == 'cancelled'

    def test_cancel_already_cancelled_fails(self, manager_client, contract):
        contract.status = 'cancelled'
        contract.save()
        url = f'{self.url}{contract.id}/cancel/'
        response = manager_client.post(url)
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_dashboard(self, manager_client, contract):
        contract.status = 'active'
        contract.save()
        response = manager_client.get(f'{self.url}dashboard/')
        assert response.status_code == status.HTTP_200_OK
        assert 'total_contracts' in response.data
        assert 'active_contracts' in response.data
        assert 'mrr' in response.data

    def test_contract_allows_operator(self, operator_client, contract):
        # ContractViewSet usa IsAdminOrManagerOrOperatorStrict — operator tem acesso
        response = operator_client.get(self.url)
        assert response.status_code == status.HTTP_200_OK

    def test_contract_unauthenticated(self, api_client):
        response = api_client.get(self.url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ─── CROSS-USER ACCESS ───────────────────────────────────────────────────────

@pytest.mark.django_db
class TestCrossUserAccess:
    """Garante que usuários não acessam dados uns dos outros de forma indevida."""

    def test_operator_can_access_contracts(self, operator_client, contract):
        """Operadores têm acesso ao módulo de contratos (permissão atualizada)."""
        url = f'/api/v1/sales/contracts/{contract.id}/'
        response = operator_client.get(url)
        assert response.status_code == status.HTTP_200_OK

    def test_viewer_cannot_list_customers(self, viewer_client):
        """Viewer não tem acesso a nenhum recurso de vendas."""
        response = viewer_client.get('/api/v1/sales/customers/')
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_viewer_cannot_list_proposals(self, viewer_client):
        response = viewer_client.get('/api/v1/sales/proposals/')
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_viewer_cannot_list_prospects(self, viewer_client):
        response = viewer_client.get('/api/v1/sales/prospects/')
        assert response.status_code == status.HTTP_403_FORBIDDEN
