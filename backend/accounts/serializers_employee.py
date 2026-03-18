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
        read_only_fields = ['id', 'created_at']

    @extend_schema_field(serializers.CharField)
    def get_user_name(self, obj) -> str:
        return obj.user.full_name

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_approved_by_name(self, obj) -> str | None:
        if obj.approved_by:
            return obj.approved_by.full_name
        return None
