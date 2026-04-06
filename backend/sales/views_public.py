"""View pública para visualização de propostas — sem autenticação."""
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework import status
from .models import Proposal, ProposalView


class ProposalPublicThrottle(AnonRateThrottle):
    rate = '30/hour'


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

        # Retornar info da proposta (frontend público renderiza)
        return Response({
            'number': proposal.number,
            'title': proposal.title,
            'company': (
                proposal.prospect.company_name if proposal.prospect
                else proposal.customer.company_name if proposal.customer
                else ''
            ),
            'total_value': float(proposal.total_value or 0),
            'status': proposal.status,
            'valid_until': (
                proposal.valid_until.isoformat() if proposal.valid_until
                else None
            ),
            'file_url': request.build_absolute_uri(
                proposal.proposal_file.url
            ) if proposal.proposal_file else None,
            'view_count': proposal.view_count,
        })
