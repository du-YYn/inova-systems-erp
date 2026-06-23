"""Testa ProposalPublicHTMLView._build_accept_url.

O botão "Aceito proposta de investimento" (injetado no HTML público da
proposta) deve apontar para o link ÚNICO de cadastro (onboarding) do lead
quando ele existe, e cair no WhatsApp de aceite como fallback caso contrário.
Cada lead tem seu próprio ClientOnboarding.public_token → sem cruzamento de
dados entre leads.
"""
import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from sales.models import Prospect, Proposal, ClientOnboarding
from sales.views_public import ProposalPublicHTMLView

User = get_user_model()


@pytest.fixture
def user(db):
    return User.objects.create_user(
        username='accept_link_mgr',
        email='accept_link_mgr@test.com',
        password='pass_123_abc',
        role='manager',
        sectors=['comercial'],
    )


@pytest.fixture
def prospect(db, user):
    return Prospect.objects.create(
        company_name='ACME Aceite',
        contact_name='Fulano',
        contact_email='fulano@acme.test',
        status='qualified',
        source='website',
        created_by=user,
    )


def _make_proposal(user, prospect=None, number='PROP-ACC-1'):
    return Proposal.objects.create(
        prospect=prospect,
        number=number,
        title='Proposta Aceite',
        proposal_type='software_dev',
        billing_type='fixed',
        total_value=1000,
        valid_until=timezone.now().date(),
        created_by=user,
        status='draft',
    )


@pytest.mark.django_db
class TestProposalAcceptUrl:
    def test_points_to_unique_onboarding_link_when_exists(self, user, prospect):
        onboarding = ClientOnboarding.objects.create(prospect=prospect, created_by=user)
        proposal = _make_proposal(user, prospect=prospect)
        url = ProposalPublicHTMLView()._build_accept_url(proposal)
        assert str(onboarding.public_token) in url
        assert 'cadastro' in url
        assert 'wa.me' not in url

    def test_falls_back_to_whatsapp_without_prospect(self, user):
        proposal = _make_proposal(user, prospect=None, number='PROP-ACC-2')
        url = ProposalPublicHTMLView()._build_accept_url(proposal)
        assert 'wa.me' in url

    def test_falls_back_to_whatsapp_when_prospect_has_no_onboarding(self, user, prospect):
        proposal = _make_proposal(user, prospect=prospect, number='PROP-ACC-3')
        url = ProposalPublicHTMLView()._build_accept_url(proposal)
        assert 'wa.me' in url
