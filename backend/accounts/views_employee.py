from datetime import date, timedelta

from django.db.models import Sum
from drf_spectacular.utils import extend_schema, extend_schema_view, OpenApiParameter
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from .models import Absence, EmployeeProfile, UserSkill
from .permissions import IsAdminOrManagerOrOperator
from .serializers_employee import (
    AbsenceSerializer,
    EmployeeProfileSerializer,
    UserSkillSerializer,
)


@extend_schema_view(
    list=extend_schema(tags=['employee-profiles']),
    retrieve=extend_schema(tags=['employee-profiles']),
    create=extend_schema(tags=['employee-profiles']),
    update=extend_schema(tags=['employee-profiles']),
    partial_update=extend_schema(tags=['employee-profiles']),
    destroy=extend_schema(tags=['employee-profiles']),
)
class EmployeeProfileViewSet(ModelViewSet):
    queryset = EmployeeProfile.objects.select_related('user')
    serializer_class = EmployeeProfileSerializer
    permission_classes = [IsAdminOrManagerOrOperator]

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @extend_schema(tags=['employee-profiles'], summary='Retorna o perfil do usuário atual')
    @action(detail=False, methods=['get'], url_path='me')
    def me(self, request):
        profile, _ = EmployeeProfile.objects.get_or_create(user=request.user)
        serializer = self.get_serializer(profile)
        return Response(serializer.data)

    @extend_schema(
        tags=['employee-profiles'],
        summary='Retorna capacidade e alocação da equipe na semana atual',
    )
    @action(detail=False, methods=['get'], url_path='capacity')
    def capacity(self, request):
        from projects.models import TimeEntry

        today = date.today()
        week_start = today - timedelta(days=today.weekday())
        week_end = week_start + timedelta(days=6)

        profiles = EmployeeProfile.objects.select_related('user')

        team = []
        for profile in profiles:
            allocated = (
                TimeEntry.objects.filter(
                    user=profile.user,
                    date__gte=week_start,
                    date__lte=week_end,
                ).aggregate(total=Sum('hours'))['total']
                or 0
            )
            availability = float(profile.availability_hours_week or 0)
            allocated_float = float(allocated)
            utilization_pct = (
                round(allocated_float / availability * 100, 1) if availability > 0 else 0.0
            )
            team.append(
                {
                    'user_id': profile.user_id,
                    'user_name': profile.user.full_name,
                    'position': profile.position,
                    'availability_hours_week': availability,
                    'allocated_hours_this_week': allocated_float,
                    'utilization_pct': utilization_pct,
                }
            )

        return Response({'team': team})


@extend_schema_view(
    list=extend_schema(
        tags=['skills'],
        parameters=[
            OpenApiParameter('user', int, description='Filtrar por ID do usuário'),
            OpenApiParameter('category', str, description='Filtrar por categoria'),
        ],
    ),
    retrieve=extend_schema(tags=['skills']),
    create=extend_schema(tags=['skills']),
    update=extend_schema(tags=['skills']),
    partial_update=extend_schema(tags=['skills']),
    destroy=extend_schema(tags=['skills']),
)
class UserSkillViewSet(ModelViewSet):
    queryset = UserSkill.objects.select_related('user')
    serializer_class = UserSkillSerializer
    permission_classes = [IsAdminOrManagerOrOperator]

    def get_queryset(self):
        qs = super().get_queryset()
        user_id = self.request.query_params.get('user')
        category = self.request.query_params.get('category')
        if user_id:
            qs = qs.filter(user_id=user_id)
        if category:
            qs = qs.filter(category=category)
        return qs

    @extend_schema(tags=['skills'], summary='Matriz de skills agrupada por categoria')
    @action(detail=False, methods=['get'], url_path='matrix')
    def skills_matrix(self, request):
        skills = self.get_queryset().order_by('category', 'name')

        matrix: dict[str, list] = {}
        for skill in skills:
            cat = skill.category or 'other'
            if cat not in matrix:
                matrix[cat] = []
            # Check if this skill name already exists in the category entry
            existing = next((s for s in matrix[cat] if s['skill'] == skill.name), None)
            if existing is None:
                existing = {'skill': skill.name, 'users': []}
                matrix[cat].append(existing)
            existing['users'].append(
                {
                    'user_id': skill.user_id,
                    'user_name': skill.user.full_name,
                    'proficiency': skill.proficiency,
                    'years_experience': float(skill.years_experience),
                    'is_primary': skill.is_primary,
                }
            )

        result = [
            {'category': cat, 'skills': skills_list}
            for cat, skills_list in matrix.items()
        ]
        return Response(result)


@extend_schema_view(
    list=extend_schema(
        tags=['absences'],
        parameters=[
            OpenApiParameter('user', int, description='Filtrar por ID do usuário'),
            OpenApiParameter('status', str, description='Filtrar por status (pending/approved/rejected)'),
            OpenApiParameter('month', str, description='Filtrar por mês (YYYY-MM)'),
        ],
    ),
    retrieve=extend_schema(tags=['absences']),
    create=extend_schema(tags=['absences']),
    update=extend_schema(tags=['absences']),
    partial_update=extend_schema(tags=['absences']),
    destroy=extend_schema(tags=['absences']),
)
class AbsenceViewSet(ModelViewSet):
    queryset = Absence.objects.select_related('user', 'approved_by')
    serializer_class = AbsenceSerializer
    permission_classes = [IsAdminOrManagerOrOperator]

    def get_queryset(self):
        qs = super().get_queryset()
        user_id = self.request.query_params.get('user')
        status_filter = self.request.query_params.get('status')
        month = self.request.query_params.get('month')  # formato YYYY-MM

        if user_id:
            qs = qs.filter(user_id=user_id)
        if status_filter:
            qs = qs.filter(status=status_filter)
        if month:
            try:
                year, mon = month.split('-')
                qs = qs.filter(start_date__year=int(year), start_date__month=int(mon))
            except (ValueError, AttributeError):
                pass
        return qs

    @extend_schema(tags=['absences'], summary='Aprova uma ausência')
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        absence = self.get_object()
        absence.status = 'approved'
        absence.approved_by = request.user
        absence.save(update_fields=['status', 'approved_by', 'updated_at'])
        serializer = self.get_serializer(absence)
        return Response(serializer.data)

    @extend_schema(tags=['absences'], summary='Rejeita uma ausência')
    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        absence = self.get_object()
        absence.status = 'rejected'
        absence.approved_by = request.user
        absence.save(update_fields=['status', 'approved_by', 'updated_at'])
        serializer = self.get_serializer(absence)
        return Response(serializer.data)
