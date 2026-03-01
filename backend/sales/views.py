from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import models
from django.db.models import Sum, Count
from django.utils import timezone
from datetime import timedelta

from .models import Customer, Prospect, Proposal, Contract
from .serializers import (
    CustomerSerializer, ProspectSerializer, 
    ProposalSerializer, ContractSerializer
)


class CustomerViewSet(viewsets.ModelViewSet):
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer
    permission_classes = [IsAuthenticated]
    
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


class ProspectViewSet(viewsets.ModelViewSet):
    queryset = Prospect.objects.all()
    serializer_class = ProspectSerializer
    permission_classes = [IsAuthenticated]

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
        pipeline = self.queryset.values('status').annotate(
            count=Count('id'),
            total_value=Sum('estimated_value')
        ).order_by('status')
        
        return Response(list(pipeline))


class ProposalViewSet(viewsets.ModelViewSet):
    queryset = Proposal.objects.all()
    serializer_class = ProposalSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()
        prop_status = self.request.query_params.get('status', None)
        if prop_status:
            queryset = queryset.filter(status=prop_status)
        return queryset

    def perform_create(self, serializer):
        last_proposal = Proposal.objects.order_by('-id').first()
        next_number = f"PROP-{int(last_proposal.number.split('-')[1]) + 1 if last_proposal else 1:05d}"
        serializer.save(number=next_number, created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def send(self, request, pk=None):
        proposal = self.get_object()
        proposal.status = 'sent'
        proposal.sent_at = timezone.now()
        proposal.save()
        return Response(ProposalSerializer(proposal).data)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        proposal = self.get_object()
        proposal.status = 'approved'
        proposal.save()
        return Response(ProposalSerializer(proposal).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        proposal = self.get_object()
        proposal.status = 'rejected'
        proposal.save()
        return Response(ProposalSerializer(proposal).data)

    @action(detail=True, methods=['post'])
    def convert_to_contract(self, request, pk=None):
        proposal = self.get_object()
        
        last_contract = Contract.objects.order_by('-id').first()
        next_number = f"CTR-{int(last_contract.number.split('-')[1]) + 1 if last_contract else 1:05d}"
        
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
        
        proposal.status = 'approved'
        proposal.save()
        
        return Response(ContractSerializer(contract).data, status=status.HTTP_201_CREATED)


class ContractViewSet(viewsets.ModelViewSet):
    queryset = Contract.objects.all()
    serializer_class = ContractSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()
        contract_status = self.request.query_params.get('status', None)
        if contract_status:
            queryset = queryset.filter(status=contract_status)
        return queryset

    def perform_create(self, serializer):
        last_contract = Contract.objects.order_by('-id').first()
        next_number = f"CTR-{int(last_contract.number.split('-')[1]) + 1 if last_contract else 1:05d}"
        serializer.save(number=next_number, created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        contract = self.get_object()
        contract.status = 'active'
        contract.save()
        return Response(ContractSerializer(contract).data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        contract = self.get_object()
        contract.status = 'cancelled'
        contract.save()
        return Response(ContractSerializer(contract).data)

    @action(detail=False, methods=['get'])
    def dashboard(self, request):
        total_contracts = self.queryset.count()
        active_contracts = self.queryset.filter(status='active').count()
        mrr = self.queryset.filter(status='active').aggregate(
            total=Sum('monthly_value')
        )['total'] or 0
        
        expiring = self.queryset.filter(
            status='active',
            end_date__lte=timezone.now().date() + timezone.timedelta(days=30)
        ).count()

        return Response({
            'total_contracts': total_contracts,
            'active_contracts': active_contracts,
            'mrr': float(mrr),
            'expiring_contracts': expiring
        })
