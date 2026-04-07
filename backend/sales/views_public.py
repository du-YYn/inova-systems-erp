"""View pública para visualização de propostas — sem autenticação."""
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework import status
from django.http import FileResponse
from .models import Proposal, ProposalView


class ProposalPublicThrottle(AnonRateThrottle):
    rate = '10/hour'


class ProposalPublicView(APIView):
    """Endpoint público para visualizar proposta via token UUID."""
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
                {'error': 'Nenhum arquivo anexado a esta proposta.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Registrar visualização
        ip = request.META.get(
            'HTTP_X_FORWARDED_FOR', request.META.get('REMOTE_ADDR', '')
        )
        if ip and ',' in ip:
            ip = ip.split(',')[0].strip()
        ProposalView.objects.create(
            proposal=proposal,
            ip_address=ip or None,
            user_agent=request.META.get('HTTP_USER_AGENT', '')[:500],
        )
        proposal.view_count = (proposal.view_count or 0) + 1
        proposal.save(update_fields=['view_count'])

        # Retornar info (SEM file_url — arquivo não é baixável)
        return Response({
            'number': proposal.number,
            'title': proposal.title,
            'company': (
                proposal.prospect.company_name if proposal.prospect
                else (
                    proposal.customer.company_name
                    if proposal.customer else ''
                )
            ),
            'total_value': float(proposal.total_value or 0),
            'status': proposal.status,
            'valid_until': (
                proposal.valid_until.isoformat()
                if proposal.valid_until else None
            ),
            'has_file': bool(proposal.proposal_file),
            'view_count': proposal.view_count,
        })


class ProposalPublicPDFView(APIView):
    """Serve o PDF inline (apenas visualização, sem download)."""
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ProposalPublicThrottle]

    def get(self, request, token):
        try:
            proposal = Proposal.objects.get(public_token=token)
        except Proposal.DoesNotExist:
            return Response(
                {'error': 'Não encontrado.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not proposal.proposal_file:
            return Response(
                {'error': 'Sem arquivo.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        response = FileResponse(
            proposal.proposal_file.open('rb'),
            content_type='application/pdf',
        )
        # inline = visualiza no browser, NÃO faz download
        response['Content-Disposition'] = 'inline'
        # Impede cache e indexação
        response['Cache-Control'] = 'no-store, no-cache'
        response['X-Robots-Tag'] = 'noindex, nofollow'
        return response
