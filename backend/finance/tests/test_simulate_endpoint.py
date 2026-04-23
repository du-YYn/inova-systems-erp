"""Testes do endpoint POST /payment-providers/{id}/simulate/

Valida integração view → pricing.py para os 3 métodos (pix/boleto/credit_card)
com e sem autenticação, cobrindo casos de erro e resposta estrutural.
"""
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from finance.models import PaymentProvider, PaymentProviderRate

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def viewer_user(db):
    return User.objects.create_user(
        username='sim_viewer', email='simviewer@test.com',
        password='pass12345', role='viewer',
    )


@pytest.fixture
def auth_client(api_client, viewer_user):
    api_client.force_authenticate(user=viewer_user)
    return api_client


@pytest.fixture
def asaas(db):
    provider = PaymentProvider.objects.create(
        code='asaas_test', name='Asaas Test', is_active=True, display_order=1,
    )
    PaymentProviderRate.objects.create(
        provider=provider, method='credit_card',
        installment_fee_pct=Decimal('3.99'),
        installment_fee_fixed=Decimal('0.49'),
        anticipation_monthly_pct=Decimal('1.70'),
    )
    PaymentProviderRate.objects.create(
        provider=provider, method='boleto',
        installment_fee_pct=Decimal('0'),
        installment_fee_fixed=Decimal('0'),
        fixed_fee=Decimal('0'),
    )
    PaymentProviderRate.objects.create(
        provider=provider, method='pix',
        fixed_fee=Decimal('0'),
    )
    return provider


@pytest.mark.django_db
class TestSimulateEndpoint:

    def _url(self, provider_id):
        return f'/api/v1/finance/payment-providers/{provider_id}/simulate/'

    def test_requires_authentication(self, api_client, asaas):
        r = api_client.post(self._url(asaas.id), {
            'method': 'pix', 'gross': '1000',
        }, format='json')
        assert r.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)

    def test_pix_simulation(self, auth_client, asaas):
        r = auth_client.post(self._url(asaas.id), {
            'method': 'pix', 'gross': '10000.00',
        }, format='json')
        assert r.status_code == status.HTTP_200_OK, r.data
        assert r.data['method'] == 'pix'
        assert Decimal(str(r.data['company_receives_total'])) == Decimal('10000.00')
        assert r.data['provider']['code'] == 'asaas_test'

    def test_boleto_12x_simulation(self, auth_client, asaas):
        r = auth_client.post(self._url(asaas.id), {
            'method': 'boleto', 'gross': '10000.00', 'installments': 12,
        }, format='json')
        assert r.status_code == status.HTTP_200_OK, r.data
        assert r.data['method'] == 'boleto'
        assert len(r.data['company_schedule']) == 12

    def test_card_12x_no_anticipation(self, auth_client, asaas):
        r = auth_client.post(self._url(asaas.id), {
            'method': 'credit_card', 'gross': '10000.00', 'installments': 12,
            'anticipate': False, 'repass_fee': False,
        }, format='json')
        assert r.status_code == status.HTTP_200_OK, r.data
        assert r.data['method'] == 'credit_card'
        assert len(r.data['company_schedule']) == 12
        # Empresa recebe ~9600 (±50 de tolerância)
        company = Decimal(str(r.data['company_receives_total']))
        assert abs(company - Decimal('9600')) < Decimal('50')

    def test_card_12x_with_anticipation(self, auth_client, asaas):
        r = auth_client.post(self._url(asaas.id), {
            'method': 'credit_card', 'gross': '10000.00', 'installments': 12,
            'anticipate': True, 'repass_fee': False,
        }, format='json')
        assert r.status_code == status.HTTP_200_OK, r.data
        # Recebimento único em ~2 dias
        assert len(r.data['company_schedule']) == 1
        assert r.data['company_schedule'][0]['days_ahead'] <= 3

    def test_invalid_method_returns_400(self, auth_client, asaas):
        r = auth_client.post(self._url(asaas.id), {
            'method': 'bitcoin', 'gross': '1000',
        }, format='json')
        assert r.status_code == status.HTTP_400_BAD_REQUEST

    def test_invalid_gross_returns_400(self, auth_client, asaas):
        r = auth_client.post(self._url(asaas.id), {
            'method': 'pix', 'gross': '0',
        }, format='json')
        assert r.status_code == status.HTTP_400_BAD_REQUEST

        r = auth_client.post(self._url(asaas.id), {
            'method': 'pix', 'gross': 'abc',
        }, format='json')
        assert r.status_code == status.HTTP_400_BAD_REQUEST

    def test_invalid_installments_returns_400(self, auth_client, asaas):
        r = auth_client.post(self._url(asaas.id), {
            'method': 'boleto', 'gross': '1000', 'installments': 0,
        }, format='json')
        assert r.status_code == status.HTTP_400_BAD_REQUEST

    def test_provider_without_rate_returns_400(self, auth_client, db):
        other = PaymentProvider.objects.create(
            code='empty', name='Empty Provider', is_active=True,
        )
        r = auth_client.post(self._url(other.id), {
            'method': 'pix', 'gross': '1000',
        }, format='json')
        assert r.status_code == status.HTTP_400_BAD_REQUEST
        assert 'não tem taxas' in str(r.data).lower() or 'nao tem taxas' in str(r.data).lower()

    def test_inactive_provider_not_findable(self, auth_client, asaas):
        asaas.is_active = False
        asaas.save()
        r = auth_client.post(self._url(asaas.id), {
            'method': 'pix', 'gross': '1000',
        }, format='json')
        assert r.status_code == status.HTTP_404_NOT_FOUND
