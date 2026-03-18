from rest_framework import serializers
from .models import Sprint, ChangeRequest, ProjectEnvironment, DeliveryApproval


class SprintSerializer(serializers.ModelSerializer):
    tasks_count = serializers.SerializerMethodField()
    completed_tasks = serializers.SerializerMethodField()

    class Meta:
        model = Sprint
        fields = [
            'id', 'project', 'name', 'goal', 'start_date', 'end_date',
            'status', 'order', 'tasks_count', 'completed_tasks',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_tasks_count(self, obj):
        return obj.tasks.exclude(status='done').count()

    def get_completed_tasks(self, obj):
        return obj.tasks.filter(status='done').count()


class ChangeRequestSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)
    approved_by_name = serializers.CharField(source='approved_by.username', read_only=True)
    requested_by_name = serializers.CharField(source='requested_by.username', read_only=True)

    class Meta:
        model = ChangeRequest
        fields = [
            'id', 'project', 'title', 'description', 'impact_hours', 'impact_value',
            'status', 'requested_by', 'requested_by_name',
            'approved_by', 'approved_by_name', 'approved_at',
            'notes', 'created_by', 'created_by_name',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_by', 'approved_by', 'created_at', 'updated_at']


class ProjectEnvironmentSerializer(serializers.ModelSerializer):
    last_deploy_by_name = serializers.CharField(source='last_deploy_by.username', read_only=True)

    class Meta:
        model = ProjectEnvironment
        fields = [
            'id', 'project', 'name', 'url', 'current_version',
            'last_deploy_at', 'last_deploy_by', 'last_deploy_by_name',
            'status', 'notes', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class DeliveryApprovalSerializer(serializers.ModelSerializer):
    milestone_name = serializers.CharField(source='milestone.name', read_only=True)
    project_name = serializers.CharField(source='project.name', read_only=True)

    class Meta:
        model = DeliveryApproval
        fields = [
            'id', 'milestone', 'milestone_name', 'project', 'project_name',
            'token', 'status', 'client_name', 'client_email', 'feedback',
            'approved_at', 'expires_at', 'created_by', 'created_at',
        ]
        read_only_fields = ['id', 'token', 'created_by', 'created_at']
