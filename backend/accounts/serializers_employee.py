from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field

from .models import EmployeeProfile, UserSkill, Absence


class EmployeeProfileSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()

    class Meta:
        model = EmployeeProfile
        fields = [
            'id', 'user', 'user_name', 'position', 'contract_type',
            'hourly_cost', 'monthly_salary', 'availability_hours_week',
            'start_date', 'end_date', 'technologies', 'bio',
            'linkedin_url', 'github_url', 'is_billable',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'user', 'created_at', 'updated_at']

    @extend_schema_field(serializers.CharField)
    def get_user_name(self, obj) -> str:
        return obj.user.full_name

    def to_representation(self, instance):
        """F2.2: Oculta salario/custo/hora para roles que nao deveriam ver.

        Apenas admin e manager leem dados financeiros de todos os empregados.
        Operator pode ler o proprio perfil (endpoint /me/) com todos os dados.
        """
        data = super().to_representation(instance)
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return data

        user = request.user
        is_admin_mgr = user.role in ('admin', 'manager')
        is_self = instance.user_id == user.id

        if not is_admin_mgr and not is_self:
            # Esconde dados sensiveis de RH em listagens para operator/viewer
            for sensitive in ('hourly_cost', 'monthly_salary'):
                data.pop(sensitive, None)
        return data


class UserSkillSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserSkill
        fields = [
            'id', 'user', 'name', 'category', 'proficiency',
            'years_experience', 'is_primary', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class AbsenceSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Absence
        fields = [
            'id', 'user', 'user_name', 'absence_type', 'start_date', 'end_date',
            'status', 'reason', 'approved_by', 'approved_by_name',
            'created_at', 'updated_at',
        ]
        # F2.4: user derivado de request.user em perform_create (nao pode
        # criar ausencia no nome de outro). status/approved_by mudam apenas
        # via actions approve/reject (F2.3).
        read_only_fields = [
            'id', 'user', 'status', 'approved_by',
            'created_at', 'updated_at',
        ]

    @extend_schema_field(serializers.CharField)
    def get_user_name(self, obj) -> str:
        return obj.user.full_name

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_approved_by_name(self, obj) -> str | None:
        if obj.approved_by:
            return obj.approved_by.full_name
        return None
