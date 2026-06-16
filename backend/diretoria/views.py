"""ViewSets da Diretoria (v32 F6, doc processo-v32/06-diretoria.md)."""
import logging

from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import SAFE_METHODS
from rest_framework.response import Response

from accounts.permissions import HasSectorAccess
from core.audit import log_audit
from sales.views import DynamicPageSizePagination

from .models import DirectorEscalation, DirectoryMeeting
from .serializers import (
    DirectorEscalationDecideSerializer, DirectorEscalationSerializer,
    DirectoryMeetingSerializer,
)

logger = logging.getLogger('diretoria')

# Mapa decisão da Diretoria → devolução ao ticket (doc 06 §1 03°):
# absorver → garantia (corrige sem custo) · cobrar/negociar → orçamento ·
# rejeitar → ticket fechado (conclusão permanece inconclusivo).
DECISION_TO_CONCLUSAO = {
    'absorver': 'garantia',
    'cobrar': 'orcamento',
    'negociar': 'orcamento',
}

# Escalação pode ser CRIADA pelo Suporte (matriz doc 08 §7.2: "criar via
# escalação"); decisão/edição continua exclusiva da Diretoria.
ESCALATION_CREATE_ACCESS = {
    'diretoria': {
        'read': {'suporte', 'diretoria'},
        'write': {'suporte', 'diretoria'},
    },
}


class DiretoriaWriteGuardMixin:
    """SEC-005 — defense-in-depth: escrita em recursos da Diretoria exige que
    o usuário seja do setor diretoria (ou admin).

    Além do HasSectorAccess('diretoria') (permission de view), reforçamos no
    nível do objeto que SÓ a Diretoria (ou admin) muta recursos da Diretoria.
    Fecha o caminho residual em que a leitura legada (sectors=[] -> SAFE_METHODS
    True) ou um setor com `read` na matriz (ex.: suporte) tentasse uma escrita
    em rota de detalhe (ex.: POST /decide/). Leitura permanece pela matriz.
    """

    def _is_diretoria(self, user):
        return bool(user) and (
            user.role == 'admin' or 'diretoria' in set(user.sectors or [])
        )

    def check_object_permissions(self, request, obj):
        super().check_object_permissions(request, obj)
        if request.method not in SAFE_METHODS and not self._is_diretoria(request.user):
            self.permission_denied(
                request, message='Escrita restrita ao setor diretoria.',
            )


@extend_schema(tags=['diretoria'])
class DirectorEscalationViewSet(DiretoriaWriteGuardMixin, viewsets.ModelViewSet):
    queryset = DirectorEscalation.objects.select_related(
        'originating_ticket', 'originating_ticket__customer',
        'raised_by', 'decided_by',
    )
    serializer_class = DirectorEscalationSerializer
    permission_classes = [HasSectorAccess('diretoria')]
    pagination_class = DynamicPageSizePagination

    def get_permissions(self):
        if self.action == 'create':
            return [HasSectorAccess('diretoria', access_map=ESCALATION_CREATE_ACCESS)()]
        return super().get_permissions()

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params
        if params.get('resolved') in ('true', 'false'):
            qs = qs.filter(resolved=params['resolved'] == 'true')
        if params.get('ticket'):
            qs = qs.filter(originating_ticket_id=params['ticket'])
        return qs

    def perform_create(self, serializer):
        escalation = serializer.save(raised_by=self.request.user)
        log_audit(
            self.request.user, 'director_escalation_create',
            'director_escalation', escalation.id,
            new_value={
                'originating_ticket': escalation.originating_ticket_id,
                'summary': escalation.summary[:200],
            },
            request=self.request,
        )
        logger.info(
            'DirectorEscalation %s criada (ticket %s) por %s',
            escalation.id, escalation.originating_ticket_id,
            self.request.user.username,
        )

    @action(detail=True, methods=['post'])
    def decide(self, request, pk=None):
        """02° da escalação: Diretoria decide e devolve ao fluxo (doc 06 §1).

        Body: {"decision": "absorver|cobrar|negociar|rejeitar", "decision_notes"?}
        Devolução (03°): atualiza SupportTicket.conclusao/status conforme a
        decisão. Toda decisão gera log_audit com old/new.
        """
        escalation = self.get_object()
        if escalation.resolved:
            return Response(
                {'error': 'Escalação já decidida — não pode ser alterada.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        input_serializer = DirectorEscalationDecideSerializer(data=request.data)
        if not input_serializer.is_valid():
            return Response(input_serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        decision = input_serializer.validated_data['decision']
        notes = input_serializer.validated_data.get('decision_notes', '')

        old_value = {
            'decision': escalation.decision,
            'resolved': escalation.resolved,
        }

        escalation.decision = decision
        escalation.decision_notes = notes
        escalation.decided_by = request.user
        escalation.decided_at = timezone.now()
        escalation.resolved = True
        escalation.save(update_fields=[
            'decision', 'decision_notes', 'decided_by', 'decided_at',
            'resolved', 'updated_at',
        ])

        # 03° devolve ao ticket do Suporte
        ticket = escalation.originating_ticket
        ticket_old = {'status': ticket.status, 'conclusao': ticket.conclusao}
        ticket_fields = []
        if decision == 'rejeitar':
            ticket.status = 'fechado'
            ticket.closed_at = timezone.now()
            ticket_fields = ['status', 'closed_at', 'updated_at']
        else:
            ticket.conclusao = DECISION_TO_CONCLUSAO[decision]
            ticket_fields = ['conclusao', 'updated_at']
            # Devolvido ao fluxo: análise concluída → correção/orçamento.
            if ticket.status in ('analise', 'in_progress'):
                ticket.status = 'correcao'
                ticket_fields.append('status')
        ticket.save(update_fields=ticket_fields)

        log_audit(
            request.user, 'director_escalation_decide',
            'director_escalation', escalation.id,
            details=(
                f'Decisão: {decision} (ticket {ticket.number}: '
                f'{ticket_old["status"]}/{ticket_old["conclusao"] or "-"} -> '
                f'{ticket.status}/{ticket.conclusao or "-"})'
            ),
            old_value={**old_value, 'ticket': ticket_old},
            new_value={
                'decision': decision,
                'decision_notes': notes[:500],
                'resolved': True,
                'ticket': {'status': ticket.status, 'conclusao': ticket.conclusao},
            },
            request=request,
        )
        logger.info(
            'DirectorEscalation %s decidida (%s) por %s — ticket %s devolvido '
            'ao fluxo (%s/%s).',
            escalation.id, decision, request.user.username,
            ticket.number, ticket.status, ticket.conclusao or '-',
        )

        return Response(DirectorEscalationSerializer(escalation).data)


@extend_schema(tags=['diretoria'])
class DirectoryMeetingViewSet(DiretoriaWriteGuardMixin, viewsets.ModelViewSet):
    queryset = DirectoryMeeting.objects.select_related('created_by').prefetch_related('attendees')
    serializer_class = DirectoryMeetingSerializer
    permission_classes = [HasSectorAccess('diretoria')]
    pagination_class = DynamicPageSizePagination

    def get_queryset(self):
        qs = super().get_queryset()
        if week_ref := self.request.query_params.get('week_ref'):
            qs = qs.filter(week_ref=week_ref)
        return qs

    def perform_create(self, serializer):
        meeting = serializer.save(created_by=self.request.user)
        log_audit(
            self.request.user, 'directory_meeting_create',
            'directory_meeting', meeting.id,
            new_value={'date': meeting.date.isoformat(), 'week_ref': meeting.week_ref},
            request=self.request,
        )
