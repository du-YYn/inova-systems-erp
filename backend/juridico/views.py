"""ViewSets do CRM Jurídico (v32 F3, doc processo-v32/02-juridico.md)."""
import logging

from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.permissions import HasSectorAccess
from core.audit import log_audit
from sales.views import DynamicPageSizePagination

from .models import LegalCase
from .serializers import LegalCaseSerializer, LegalCaseTransitionSerializer

logger = logging.getLogger('juridico')


@extend_schema(tags=['juridico'])
class LegalCaseViewSet(viewsets.ModelViewSet):
    queryset = LegalCase.objects.select_related('customer', 'project', 'created_by')
    serializer_class = LegalCaseSerializer
    permission_classes = [HasSectorAccess('juridico')]
    pagination_class = DynamicPageSizePagination

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params
        if params.get('process_type'):
            qs = qs.filter(process_type=params['process_type'])
        if params.get('status'):
            qs = qs.filter(status=params['status'])
        if params.get('customer'):
            qs = qs.filter(customer_id=params['customer'])
        return qs

    def perform_create(self, serializer):
        case = serializer.save(created_by=self.request.user)
        log_audit(
            self.request.user, 'legal_case_create', 'legal_case', case.id,
            new_value={
                'customer': case.customer_id,
                'process_type': case.process_type,
                'status': case.status,
                'source': case.source,
            },
            request=self.request,
        )
        logger.info(
            'LegalCase %s criado (%s) para customer %s por %s',
            case.id, case.process_type, case.customer_id, self.request.user.username,
        )

    @action(detail=True, methods=['post'])
    def transition(self, request, pk=None):
        """Avança o caso exatamente 1 macro-etapa (doc 02 §2).

        Body: {"status": "<próximo status>", "autentique_id"?, "autentique_link"?}
        Transição inválida (pular etapa, voltar, repetir) retorna 400 sem
        mudar estado. Toda transição gera log_audit com old/new.
        """
        case = self.get_object()
        input_serializer = LegalCaseTransitionSerializer(data=request.data)
        if not input_serializer.is_valid():
            return Response(input_serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        new_status = input_serializer.validated_data['status']
        order = LegalCase.STATUS_ORDER
        current_idx = order.index(case.status)

        if case.status == 'assinado':
            return Response(
                {'error': 'Caso já assinado — não há transição possível.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if new_status != order[current_idx + 1]:
            return Response(
                {'error': (
                    f'Transição inválida: {case.status} → {new_status}. '
                    f'Próxima etapa permitida: {order[current_idx + 1]}.'
                )},
                status=status.HTTP_400_BAD_REQUEST,
            )

        old_value = {
            'status': case.status,
            'autentique_id': case.autentique_id,
            'autentique_link': case.autentique_link,
            'signed_at': case.signed_at.isoformat() if case.signed_at else None,
        }

        case.status = new_status
        # Upload no Autentique acontece na transição Preparação → Envio
        # (doc 02 §2): única porta de escrita desses campos até a F7.
        if input_serializer.validated_data.get('autentique_id'):
            case.autentique_id = input_serializer.validated_data['autentique_id']
        if input_serializer.validated_data.get('autentique_link'):
            case.autentique_link = input_serializer.validated_data['autentique_link']
        if new_status == 'assinado':
            case.signed_at = timezone.now()
        case.save()

        new_value = {
            'status': case.status,
            'autentique_id': case.autentique_id,
            'autentique_link': case.autentique_link,
            'signed_at': case.signed_at.isoformat() if case.signed_at else None,
        }
        log_audit(
            request.user, 'legal_case_transition', 'legal_case', case.id,
            details=(
                f"{old_value['status']} -> {new_status} "
                f'(process_type={case.process_type}, autentique_id={case.autentique_id or "-"})'
            ),
            old_value=old_value, new_value=new_value, request=request,
        )

        # SAÍDAS (doc 02 §3): nesta fase apenas log + audit. Consumidores
        # reais entram na F4 (Financeiro libera cobrança) e F5 (Produção
        # libera baseline) — atrás de flags próprias de automação.
        if new_status == 'assinado' and case.process_type in ('contrato', 'validacao_documento'):
            outcome = (
                'financeiro_liberar_cobranca' if case.process_type == 'contrato'
                else 'producao_liberar_baseline'
            )
            logger.info(
                'SAIDA juridico: LegalCase %s (%s) assinado — consumidor %s '
                'sera implementado na F4/F5 (apenas log nesta fase).',
                case.id, case.process_type, outcome,
            )
            log_audit(
                request.user, 'legal_case_signed_output', 'legal_case', case.id,
                details=(
                    f'Saída {outcome} registrada (sem efeito na F3; '
                    'consumidores reais em F4/F5).'
                ),
                new_value={'process_type': case.process_type, 'outcome': outcome},
                request=request,
            )

        return Response(LegalCaseSerializer(case).data)
