"""View pública para visualização de propostas — sem autenticação."""
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework import status
from django.http import HttpResponse
from .models import Proposal, ProposalView


class ProposalPublicThrottle(AnonRateThrottle):
    rate = '10/hour'


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
