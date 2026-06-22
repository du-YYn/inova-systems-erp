"""Testa o campo read-only `public_url` do ProposalSerializer.

`public_url` e' a FONTE DA VERDADE do link publico compartilhavel `/p/<token>`.
O frontend passa a consumir este valor em vez de derivar o host no cliente
(`window.location.origin.replace('erp.', 'proposta.')`), que quebrava silenciosa-
mente quando o admin acessava o ERP por qualquer host sem o prefixo `erp.`.
"""
import uuid

import pytest
from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone

from sales.models import Customer, Proposal
from sales.serializers import ProposalSerializer

User = get_user_model()


@pytest.fixture
def manager_user(db):
    return User.objects.create_user(
        username='prop_url_mgr',
        email='prop_url_mgr@test.com',
        password='pass_123_abc',
        role='manager',
        sectors=['comercial'],
    )


@pytest.fixture
def customer(db, manager_user):
    return Customer.objects.create(
        company_name='ACME Corp',
        customer_type='PJ',
        email='acme_propurl@test.com',
        created_by=manager_user,
    )


def _make_proposal(manager_user, customer, *, token=None, number='PROP-URL-1'):
    return Proposal.objects.create(
        customer=customer,
        number=number,
        title='Sistema ERP',
        proposal_type='software_dev',
        billing_type='fixed',
        total_value=50000,
        valid_until=timezone.now().date(),
        created_by=manager_user,
        status='draft',
        public_token=token,
    )


@pytest.mark.django_db
class TestProposalPublicUrl:
    @override_settings(PROPOSAL_PUBLIC_BASE_URL='https://proposta.example.com')
    def test_public_url_built_from_setting(self, manager_user, customer):
        token = uuid.uuid4()
        proposal = _make_proposal(manager_user, customer, token=token)
        data = ProposalSerializer(proposal).data
        assert 'public_url' in data, 'campo public_url ausente no serializer'
        assert data['public_url'] == f'https://proposta.example.com/p/{token}'

    @override_settings(PROPOSAL_PUBLIC_BASE_URL='https://proposta.example.com/')
    def test_public_url_strips_trailing_slash_from_base(self, manager_user, customer):
        token = uuid.uuid4()
        proposal = _make_proposal(manager_user, customer, token=token, number='PROP-URL-2')
        data = ProposalSerializer(proposal).data
        # Sem barra dupla mesmo quando a base vem com `/` no fim.
        assert data['public_url'] == f'https://proposta.example.com/p/{token}'

    @override_settings(PROPOSAL_PUBLIC_BASE_URL='https://proposta.example.com')
    def test_public_url_none_without_token(self, manager_user, customer):
        proposal = _make_proposal(manager_user, customer, token=None, number='PROP-URL-3')
        data = ProposalSerializer(proposal).data
        assert data['public_url'] is None
