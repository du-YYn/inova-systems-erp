import logging
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema
from django.db import models, transaction
from django.db.models import Sum, Count, Q
from django.utils import timezone
from datetime import timedelta

from .models import Customer, Prospect, Proposal, Contract
from .serializers import (
    CustomerSerializer, ProspectSerializer,
    ProposalSerializer, ContractSerializer
)
from accounts.permissions import IsAdminOrManager, IsAdminOrManagerOrOperator

logger = logging.getLogger('sales')


@extend_schema(tags=['sales'])
class CustomerViewSet(viewsets.ModelViewSet):
    queryset = Customer.objects.select_related('created_by')
    serializer_class = CustomerSerializer
    permission_classes = [IsAdminOrManagerOrOperator]

    def get_queryset(self):
        queryset = super().get_queryset()
        search = self.request.query_params.get('search', None)
        if search:
            queryset = queryset.filter(
                models.Q(name__icontains=search) |
                models.Q(company_name__icontains=search) |
                models.Q(document__icontains=search) |
                models.Q(email__icontains=search)
            )
        return queryset

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


@extend_schema(tags=['sales'])
class ProspectViewSet(viewsets.ModelViewSet):
    queryset = Prospect.objects.select_related('customer', 'assigned_to', 'created_by')
    serializer_class = ProspectSerializer
    permission_classes = [IsAdminOrManagerOrOperator]

    def get_queryset(self):
        queryset = super().get_queryset()
        prospect_status = self.request.query_params.get('status', None)
        if prospect_status:
            queryset = queryset.filter(status=prospect_status)
        return queryset

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=False, methods=['get'])
    def pipeline(self, request):
        pipeline = self.get_queryset().values('status').annotate(
            count=Count('id'),
            total_value=Sum('estimated_value')
        ).order_by('status')
        return Response(list(pipeline))


@extend_schema(tags=['sales'])
class ProposalViewSet(viewsets.ModelViewSet):
    queryset = Proposal.objects.select_related('customer', 'prospect', 'assigned_to', 'created_by')
    serializer_class = ProposalSerializer
    permission_classes = [IsAdminOrManagerOrOperator]

    def get_queryset(self):
        queryset = super().get_queryset()
        prop_status = self.request.query_params.get('status', None)
        if prop_status:
            queryset = queryset.filter(status=prop_status)
        return queryset

    def perform_create(self, serializer):
        with transaction.atomic():
            last_proposal = Proposal.objects.select_for_update().order_by('-id').first()
            if last_proposal:
                try:
                    last_seq = int(last_proposal.number.split('-')[1])
                except (IndexError, ValueError):
                    last_seq = 0
            else:
                last_seq = 0
            next_number = f"PROP-{last_seq + 1:05d}"
            serializer.save(number=next_number, created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def send(self, request, pk=None):
        proposal = self.get_object()
        if proposal.status != 'draft':
            return Response(
                {'error': f'Apenas propostas em rascunho podem ser enviadas (status atual: {proposal.status})'},
                status=status.HTTP_400_BAD_REQUEST
            )
        proposal.status = 'sent'
        proposal.sent_at = timezone.now()
        proposal.save()
        logger.info(f"Proposta {proposal.id} enviada por {request.user.username}")
        return Response(ProposalSerializer(proposal).data)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        proposal = self.get_object()
        if proposal.status not in ('sent', 'draft'):
            return Response(
                {'error': f'Proposta não pode ser aprovada (status atual: {proposal.status})'},
                status=status.HTTP_400_BAD_REQUEST
            )
        proposal.status = 'approved'
        proposal.save()
        logger.info(f"Proposta {proposal.id} aprovada por {request.user.username}")
        return Response(ProposalSerializer(proposal).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        proposal = self.get_object()
        if proposal.status in ('approved', 'rejected'):
            return Response(
                {'error': f'Proposta não pode ser rejeitada (status atual: {proposal.status})'},
                status=status.HTTP_400_BAD_REQUEST
            )
        proposal.status = 'rejected'
        proposal.save()
        logger.info(f"Proposta {proposal.id} rejeitada por {request.user.username}")
        return Response(ProposalSerializer(proposal).data)

    @action(detail=True, methods=['post'])
    def convert_to_contract(self, request, pk=None):
        proposal = self.get_object()
        if proposal.status != 'approved':
            return Response(
                {'error': 'Apenas propostas aprovadas podem ser convertidas em contrato'},
                status=status.HTTP_400_BAD_REQUEST
            )

        with transaction.atomic():
            last_contract = Contract.objects.select_for_update().order_by('-id').first()
            if last_contract:
                try:
                    last_seq = int(last_contract.number.split('-')[1])
                except (IndexError, ValueError):
                    last_seq = 0
            else:
                last_seq = 0
            next_number = f"CTR-{last_seq + 1:05d}"

            contract = Contract.objects.create(
                proposal=proposal,
                customer=proposal.customer,
                number=next_number,
                title=proposal.title,
                contract_type=proposal.proposal_type,
                billing_type=proposal.billing_type,
                start_date=timezone.now().date(),
                monthly_value=proposal.total_value,
                hourly_rate=proposal.hourly_rate,
                status='pending_signature',
                notes=proposal.notes,
                terms=proposal.terms,
                created_by=request.user
            )

            proposal.save()

        logger.info(f"Proposta {proposal.id} convertida em contrato {contract.id} por {request.user.username}")
        return Response(ContractSerializer(contract).data, status=status.HTTP_201_CREATED)


@extend_schema(tags=['sales'])
class ContractViewSet(viewsets.ModelViewSet):
    queryset = Contract.objects.select_related('customer', 'proposal', 'created_by')
    serializer_class = ContractSerializer
    permission_classes = [IsAdminOrManager]

    def get_queryset(self):
        queryset = super().get_queryset()
        contract_status = self.request.query_params.get('status', None)
        if contract_status:
            queryset = queryset.filter(status=contract_status)
        return queryset

    def perform_create(self, serializer):
        with transaction.atomic():
            last_contract = Contract.objects.select_for_update().order_by('-id').first()
            if last_contract:
                try:
                    last_seq = int(last_contract.number.split('-')[1])
                except (IndexError, ValueError):
                    last_seq = 0
            else:
                last_seq = 0
            next_number = f"CTR-{last_seq + 1:05d}"
            serializer.save(number=next_number, created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        contract = self.get_object()
        if contract.status != 'pending_signature':
            return Response(
                {'error': f'Contrato não pode ser ativado (status atual: {contract.status})'},
                status=status.HTTP_400_BAD_REQUEST
            )
        contract.status = 'active'
        contract.save()
        logger.info(f"Contrato {contract.id} ativado por {request.user.username}")
        return Response(ContractSerializer(contract).data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        contract = self.get_object()
        if contract.status == 'cancelled':
            return Response(
                {'error': 'Contrato já está cancelado'},
                status=status.HTTP_400_BAD_REQUEST
            )
        contract.status = 'cancelled'
        contract.save()
        logger.info(f"Contrato {contract.id} cancelado por {request.user.username}")
        return Response(ContractSerializer(contract).data)

    @action(detail=False, methods=['get'])
    def dashboard(self, request):
        qs = self.get_queryset()
        stats = qs.aggregate(
            total=Count('id'),
            active_count=Count('id', filter=Q(status='active')),
            mrr=Sum('monthly_value', filter=Q(status='active')),
            expiring_count=Count(
                'id',
                filter=Q(status='active', end_date__lte=timezone.now().date() + timedelta(days=30))
            )
        )
        return Response({
            'total_contracts': stats['total'],
            'active_contracts': stats['active_count'],
            'mrr': float(stats['mrr'] or 0),
            'expiring_contracts': stats['expiring_count'],
        })
