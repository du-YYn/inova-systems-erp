from django.contrib.auth.models import AbstractUser
from django.db import models
from django.conf import settings
from core.validators import validate_image_extension, validate_image_size


class User(AbstractUser):
    ROLE_CHOICES = [
        ('admin', 'Administrador'),
        ('manager', 'Gerente'),
        ('operator', 'Operador'),
        ('viewer', 'Visualizador'),
        ('partner', 'Parceiro'),
    ]

    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='operator')
    is_2fa_enabled = models.BooleanField(default=False)
    totp_secret = models.CharField(max_length=32, blank=True, null=True)
    temp_2fa_token = models.CharField(max_length=64, blank=True, null=True)
    temp_2fa_expires = models.DateTimeField(blank=True, null=True)
    phone = models.CharField(max_length=20, blank=True)
    avatar = models.ImageField(upload_to='avatars/', blank=True, null=True, validators=[validate_image_extension, validate_image_size])
    password_reset_token = models.CharField(max_length=64, blank=True, null=True)
    password_reset_expires = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'users'
        ordering = ['-created_at']

    def __str__(self):
        return self.email or self.username

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip() or self.username


class EmployeeProfile(models.Model):
    CONTRACT_TYPE_CHOICES = [
        ('clt', 'CLT'),
        ('pj', 'PJ'),
        ('freelancer', 'Freelancer'),
        ('partner', 'Sócio'),
    ]

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='employee_profile',
    )
    position = models.CharField(max_length=100, blank=True)
    contract_type = models.CharField(
        max_length=20, choices=CONTRACT_TYPE_CHOICES, default='clt'
    )
    hourly_cost = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    monthly_salary = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    availability_hours_week = models.DecimalField(max_digits=5, decimal_places=2, default=40)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    technologies = models.JSONField(default=list)
    bio = models.TextField(blank=True)
    linkedin_url = models.URLField(blank=True)
    github_url = models.URLField(blank=True)
    is_billable = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'employee_profiles'

    def __str__(self):
        return f"{self.user} - {self.position}"


class UserSkill(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='skills',
    )
    name = models.CharField(max_length=100)
    category = models.CharField(max_length=50, blank=True)
    proficiency = models.IntegerField(default=3)
    years_experience = models.DecimalField(max_digits=4, decimal_places=1, default=0)
    is_primary = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'user_skills'
        unique_together = [['user', 'name']]

    def __str__(self):
        return f"{self.user} - {self.name} ({self.proficiency}/5)"


class Absence(models.Model):
    ABSENCE_TYPE_CHOICES = [
        ('vacation', 'Férias'),
        ('sick', 'Licença Médica'),
        ('personal', 'Pessoal'),
        ('holiday', 'Feriado'),
        ('other', 'Outro'),
    ]
    STATUS_CHOICES = [
        ('pending', 'Pendente'),
        ('approved', 'Aprovado'),
        ('rejected', 'Rejeitado'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='absences',
    )
    absence_type = models.CharField(
        max_length=20, choices=ABSENCE_TYPE_CHOICES, default='vacation'
    )
    start_date = models.DateField()
    end_date = models.DateField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    reason = models.TextField(blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_absences',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'absences'
        ordering = ['-start_date']

    def __str__(self):
        return f"{self.user} - {self.absence_type} ({self.start_date} ~ {self.end_date})"


class PartnerProfile(models.Model):
    """Perfil do parceiro de indicação com ID único."""
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='partner_profile',
    )
    partner_id = models.CharField(
        max_length=10, unique=True, db_index=True,
        help_text='ID único do parceiro (PRC-00001)',
    )
    company_name = models.CharField(max_length=200, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'partner_profiles'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.partner_id} — {self.user.full_name}"

    def save(self, *args, **kwargs):
        if not self.partner_id:
            last = PartnerProfile.objects.order_by('-id').first()
            seq = 1
            if last and last.partner_id.startswith('PRC-'):
                try:
                    seq = int(last.partner_id.split('-')[1]) + 1
                except (IndexError, ValueError):
                    pass
            self.partner_id = f'PRC-{seq:05d}'
        super().save(*args, **kwargs)
