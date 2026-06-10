"""Canal público de abertura de chamados (v32 F6, doc 05 §9).

POST /api/v1/support/public/tickets/{customer_token}/ — cliente abre chamado
sem login, com texto e anexo opcional (imagem/vídeo/áudio/documento).

Proteções (STRIDE, doc 08 §8.1):
- Token UUID4 por cliente (Customer.public_token) — anti-enumeration.
- Throttle por token (escopo `public_ticket`, 5/h) + por IP (anti-flood).
- Nenhum dado sensível na resposta antes de validar o token.
- Anexo validado por extensão + magic bytes + tamanho.
"""
import logging

from django.core.exceptions import ValidationError
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, SimpleRateThrottle
from rest_framework.views import APIView

from core.audit import log_audit
from core.validators import (
    validate_file_extension, validate_file_magic_bytes, validate_file_size,
)
from sales.models import Customer

from .models import SupportTicket, TicketAttachment
from .serializers import PublicTicketCreateSerializer

logger = logging.getLogger('support')


class PublicTicketIPThrottle(AnonRateThrottle):
    """Camada por IP — anti fan-out distribuído sobre vários tokens."""
    rate = '20/hour'


class PublicTicketTokenThrottle(SimpleRateThrottle):
    """Camada por token — 5/h (escopo `public_ticket` em settings).

    Throttle por IP não protege contra abuse focado num token vazado atrás
    de NAT; por token previne flood num único cliente (padrão F7B.5).
    """
    scope = 'public_ticket'

    def get_cache_key(self, request, view):
        token = view.kwargs.get('customer_token')
        if not token:
            return None
        return f'throttle_{self.scope}_{token}'


class PublicTicketCreateView(APIView):
    """POST cria chamado `aberto` pendurado no cliente do token."""
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [PublicTicketIPThrottle, PublicTicketTokenThrottle]

    def post(self, request, customer_token):
        try:
            customer = Customer.objects.get(public_token=customer_token, is_active=True)
        except (Customer.DoesNotExist, ValidationError):
            return Response(
                {'error': 'Canal de chamados não encontrado.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = PublicTicketCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        data = serializer.validated_data

        attachment_file = data.get('attachment')
        if attachment_file is not None:
            # Validação explícita: extensão + tamanho + magic bytes (anexos
            # via serializer não passam pelos validators do model field).
            try:
                validate_file_extension(attachment_file)
                validate_file_size(attachment_file)
                validate_file_magic_bytes(attachment_file)
            except ValidationError as exc:
                return Response(
                    {'attachment': exc.messages},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        from .views import _generate_ticket_number

        ticket = SupportTicket.objects.create(
            number=_generate_ticket_number(),
            title=data['title'],
            description=data['description'],
            customer=customer,
            status='aberto',
            ticket_type='bug',  # triagem reclassifica (bug | duvida | mudanca)
            contexto='suporte',
            contact_name=data.get('contact_name', ''),
            contact_email=data.get('contact_email', ''),
            created_by=None,  # canal público — sem usuário interno
        )

        if attachment_file is not None:
            TicketAttachment.objects.create(
                ticket=ticket,
                file=attachment_file,
                filename=attachment_file.name[:255],
                file_size=attachment_file.size,
                uploaded_by=None,
            )

        log_audit(
            None, 'support_ticket_public_create', 'support_ticket', ticket.id,
            details=f'Chamado {ticket.number} aberto pelo canal público.',
            new_value={
                'customer': customer.id,
                'status': 'aberto',
                'has_attachment': attachment_file is not None,
            },
            request=request,
        )
        logger.info(
            'Canal publico: ticket %s criado para customer %s.',
            ticket.number, customer.id,
        )

        # Resposta mínima — sem dados internos do cliente/SLA.
        return Response(
            {
                'success': True,
                'number': ticket.number,
                'message': 'Chamado recebido! Nossa equipe vai analisar em breve.',
            },
            status=status.HTTP_201_CREATED,
        )
