"""Views públicas — sem autenticação."""
import logging

from rest_framework.views import APIView
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework import status
from django.http import HttpResponse
from django.utils import timezone
from .models import Proposal, ProposalView, ClientOnboarding, Customer
from .serializers import ClientOnboardingPublicSerializer

logger = logging.getLogger('sales')


class ProposalPublicThrottle(AnonRateThrottle):
    rate = '60/hour'


class ProposalPublicView(APIView):
    """Retorna metadados da proposta (para tracking)."""
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ProposalPublicThrottle]

    def get(self, request, token):
        try:
            proposal = Proposal.objects.get(public_token=token)
        except Proposal.DoesNotExist:
            return Response(
                {'error': 'Proposta não encontrada.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not proposal.proposal_file:
            return Response(
                {'error': 'Nenhum arquivo anexado.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Registrar visualização (deduplica por IP/dia)
        from django.utils import timezone as tz
        ip = request.META.get(
            'HTTP_X_FORWARDED_FOR', request.META.get('REMOTE_ADDR', '')
        )
        if ip and ',' in ip:
            ip = ip.split(',')[0].strip()

        today = tz.now().date()
        already_viewed = ProposalView.objects.filter(
            proposal=proposal,
            ip_address=ip,
            viewed_at__date=today,
        ).exists() if ip else False

        if not already_viewed:
            ProposalView.objects.create(
                proposal=proposal,
                ip_address=ip or None,
                user_agent=request.META.get('HTTP_USER_AGENT', '')[:500],
            )
            proposal.view_count = (proposal.view_count or 0) + 1
            proposal.save(update_fields=['view_count'])

        return Response({
            'number': proposal.number,
            'title': proposal.title,
            'has_file': True,
            'view_count': proposal.view_count,
        })


class ProposalPublicHTMLView(APIView):
    """Serve o arquivo HTML diretamente — renderiza no browser."""
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ProposalPublicThrottle]

    def get(self, request, token):
        try:
            proposal = Proposal.objects.get(public_token=token)
        except Proposal.DoesNotExist:
            return HttpResponse(
                '<h1>Proposta não encontrada</h1>',
                content_type='text/html', status=404,
            )

        if not proposal.proposal_file:
            return HttpResponse(
                '<h1>Nenhum arquivo anexado</h1>',
                content_type='text/html', status=404,
            )

        # Ler e servir o HTML diretamente
        try:
            proposal.proposal_file.open('rb')
            content = proposal.proposal_file.read()
            proposal.proposal_file.close()
        except Exception:
            return HttpResponse(
                '<h1>Erro ao ler arquivo</h1>',
                content_type='text/html', status=500,
            )

        response = HttpResponse(content, content_type='text/html; charset=utf-8')
        csp = "script-src 'none'; object-src 'none'; style-src 'unsafe-inline' *; font-src *; img-src * data:;"
        response['Content-Security-Policy'] = csp
        response['X-Content-Type-Options'] = 'nosniff'
        response['X-XSS-Protection'] = '1; mode=block'
        response['Cache-Control'] = 'no-store, no-cache'
        response['X-Robots-Tag'] = 'noindex, nofollow'
        return response


# ── Client Onboarding ────────────────────────────────────────────────────────

class OnboardingPublicThrottle(AnonRateThrottle):
    rate = '10/hour'


class ClientOnboardingPublicView(APIView):
    """Formulário público de cadastro: GET carrega dados, POST submete."""
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [OnboardingPublicThrottle]

    def get(self, request, token):
        try:
            onboarding = ClientOnboarding.objects.select_related(
                'prospect'
            ).get(public_token=token)
        except ClientOnboarding.DoesNotExist:
            return Response(
                {'error': 'Formulário não encontrado.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = ClientOnboardingPublicSerializer(onboarding)
        return Response(serializer.data)

    def post(self, request, token):
        try:
            onboarding = ClientOnboarding.objects.select_related(
                'prospect', 'prospect__customer', 'customer',
            ).get(public_token=token)
        except ClientOnboarding.DoesNotExist:
            return Response(
                {'error': 'Formulário não encontrado.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if onboarding.status != 'pending':
            return Response(
                {'error': 'Este formulário já foi preenchido.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = ClientOnboardingPublicSerializer(
            onboarding, data=request.data, partial=False,
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        ip = request.META.get(
            'HTTP_X_FORWARDED_FOR', request.META.get('REMOTE_ADDR', '')
        )
        if ip and ',' in ip:
            ip = ip.split(',')[0].strip()

        serializer.save(
            status='submitted',
            submitted_at=timezone.now(),
            ip_address=ip or None,
            user_agent=request.META.get('HTTP_USER_AGENT', '')[:500],
        )

        # Atualizar Customer com os dados do formulário
        self._sync_customer(onboarding)

        # Notificar equipe
        self._notify_team(onboarding)

        return Response(
            {'success': True, 'message': 'Dados recebidos com sucesso!'},
            status=status.HTTP_200_OK,
        )

    @staticmethod
    def _sync_customer(onboarding):
        """Atualiza o Customer vinculado com os dados do onboarding (com lock)."""
        from django.db import transaction as db_tx

        try:
            # Determinar qual customer atualizar
            customer_id = onboarding.customer_id
            if not customer_id:
                prospect_customer = getattr(onboarding.prospect, 'customer', None)
                if prospect_customer:
                    customer_id = prospect_customer.id
            if not customer_id:
                return

            # Validar integridade: se ambos existem, devem ser o mesmo
            if (onboarding.customer_id
                    and onboarding.prospect.customer_id
                    and onboarding.customer_id != onboarding.prospect.customer_id):
                logger.warning(
                    f"Onboarding {onboarding.id}: customer_id ({onboarding.customer_id}) "
                    f"difere do prospect.customer_id ({onboarding.prospect.customer_id}). "
                    f"Sync cancelado para evitar corrupção."
                )
                return

            # Lock no customer para evitar race condition
            with db_tx.atomic():
                customer = Customer.objects.select_for_update().get(id=customer_id)

                # Montar endereço completo da empresa
                addr_parts = [onboarding.company_street]
                if onboarding.company_number:
                    addr_parts.append(onboarding.company_number)
                if onboarding.company_complement:
                    addr_parts.append(f'- {onboarding.company_complement}')
                if onboarding.company_neighborhood:
                    addr_parts.append(f'- {onboarding.company_neighborhood}')

                customer.company_name = onboarding.company_legal_name
                customer.document = onboarding.company_cnpj
                customer.address = ', '.join(addr_parts)
                customer.city = onboarding.company_city
                customer.state = onboarding.company_state
                customer.cep = onboarding.company_cep
                customer.save(update_fields=[
                    'company_name', 'document', 'address',
                    'city', 'state', 'cep', 'updated_at',
                ])

                # Vincular onboarding ao customer se ainda não estiver
                if not onboarding.customer_id:
                    onboarding.customer = customer
                    onboarding.save(update_fields=['customer'])

            logger.info(
                f"Customer {customer_id} atualizado via onboarding "
                f"{onboarding.id} ({onboarding.company_legal_name})"
            )
        except Customer.DoesNotExist:
            logger.warning(f"Customer {customer_id} não encontrado para onboarding {onboarding.id}")
        except Exception as e:
            logger.warning(f"Erro ao sincronizar customer via onboarding: {e}")

    @staticmethod
    def _notify_team(onboarding):
        """Cria notificações para a equipe sobre o preenchimento."""
        try:
            from notifications.models import Notification
            from django.contrib.auth import get_user_model
            User = get_user_model()

            recipients = User.objects.filter(
                role__in=['admin', 'manager'], is_active=True,
            )
            if onboarding.prospect.assigned_to_id:
                recipients = recipients | User.objects.filter(
                    id=onboarding.prospect.assigned_to_id,
                )

            for user in recipients.distinct():
                Notification.objects.create(
                    user=user,
                    notification_type='general',
                    title=f'Cadastro recebido — {onboarding.prospect.company_name}',
                    message=f'{onboarding.rep_full_name} preencheu o formulário de cadastro.',
                    object_type='onboarding',
                    object_id=onboarding.id,
                )
            logger.info(
                f"Notificações de onboarding {onboarding.id} enviadas "
                f"para {recipients.distinct().count()} usuários"
            )
        except Exception as e:
            logger.warning(f"Erro ao notificar equipe sobre onboarding {onboarding.id}: {e}")
