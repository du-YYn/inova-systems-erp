"""Serializers da Diretoria (v32 F6).

Campos de decisão são read_only (STRIDE Tampering, doc 08 §8.1): decision,
decision_notes, decided_by, decided_at e resolved só mudam pelo endpoint de
ação POST /decide/ — nunca por PATCH direto de campo.
"""
from rest_framework import serializers

from .models import DirectorEscalation, DirectoryMeeting


class DirectorEscalationSerializer(serializers.ModelSerializer):
    ticket_number = serializers.CharField(
        source='originating_ticket.number', read_only=True, default=None,
    )
    ticket_title = serializers.CharField(
        source='originating_ticket.title', read_only=True, default=None,
    )
    customer_name = serializers.SerializerMethodField(read_only=True)
    raised_by_name = serializers.SerializerMethodField(read_only=True)
    decided_by_name = serializers.SerializerMethodField(read_only=True)
    decision_display = serializers.CharField(source='get_decision_display', read_only=True)

    class Meta:
        model = DirectorEscalation
        fields = [
            'id', 'originating_ticket', 'ticket_number', 'ticket_title',
            'customer_name', 'raised_by', 'raised_by_name', 'summary',
            'evidence', 'decision', 'decision_display', 'decision_notes',
            'decided_by', 'decided_by_name', 'decided_at', 'resolved',
            'created_at', 'updated_at',
        ]
        # Decisão muda apenas via POST /decide/ (auditoria + devolução ao
        # ticket). raised_by é setado no perform_create.
        read_only_fields = [
            'id', 'raised_by', 'decision', 'decision_notes', 'decided_by',
            'decided_at', 'resolved', 'created_at', 'updated_at',
        ]

    def get_customer_name(self, obj):
        customer = obj.originating_ticket.customer if obj.originating_ticket else None
        if not customer:
            return None
        return customer.company_name or customer.name

    def get_raised_by_name(self, obj):
        if not obj.raised_by:
            return 'Automação'
        return obj.raised_by.get_full_name() or obj.raised_by.username

    def get_decided_by_name(self, obj):
        if not obj.decided_by:
            return None
        return obj.decided_by.get_full_name() or obj.decided_by.username


class DirectorEscalationDecideSerializer(serializers.Serializer):
    """Input do POST /decide/ — 02° da escalação (doc 06 §1)."""
    decision = serializers.ChoiceField(choices=DirectorEscalation.DECISION_CHOICES)
    decision_notes = serializers.CharField(
        required=False, allow_blank=True, default='',
    )


class DirectoryMeetingSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField(read_only=True)
    attendees_names = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = DirectoryMeeting
        fields = [
            'id', 'date', 'week_ref', 'attendees', 'attendees_names',
            'agenda_review', 'decisions', 'notes', 'created_by',
            'created_by_name', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_by', 'created_at', 'updated_at']

    def get_created_by_name(self, obj):
        if not obj.created_by:
            return None
        return obj.created_by.get_full_name() or obj.created_by.username

    def get_attendees_names(self, obj):
        return [
            user.get_full_name() or user.username
            for user in obj.attendees.all()
        ]

    def validate_agenda_review(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError('agenda_review deve ser um objeto.')
        return value

    def validate_decisions(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError('decisions deve ser uma lista.')
        return value
