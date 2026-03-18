from django.db import models
from django.conf import settings


class Notification(models.Model):
    TYPE_CHOICES = [
        ('task_due', 'Tarefa Próxima do Prazo'),
        ('task_assigned', 'Tarefa Atribuída'),
        ('proposal_approved', 'Proposta Aprovada'),
        ('proposal_rejected', 'Proposta Rejeitada'),
        ('contract_expiring', 'Contrato Próximo do Vencimento'),
        ('contract_expired', 'Contrato Vencido'),
        ('milestone_completed', 'Marco Concluído'),
        ('invoice_overdue', 'Fatura Vencida'),
        ('invoice_paid', 'Fatura Paga'),
        ('ticket_assigned', 'Ticket Atribuído'),
        ('ticket_comment', 'Comentário no Ticket'),
        ('sla_warning', 'SLA Próximo de Vencer'),
        ('sla_breached', 'SLA Violado'),
        ('project_status_changed', 'Status do Projeto Alterado'),
        ('general', 'Geral'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notifications'
    )
    notification_type = models.CharField(max_length=50, choices=TYPE_CHOICES, default='general')
    title = models.CharField(max_length=300)
    message = models.TextField()

    # Referência ao objeto relacionado (genérico)
    object_type = models.CharField(max_length=50, blank=True)  # 'project', 'ticket', 'invoice', etc.
    object_id = models.IntegerField(null=True, blank=True)

    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'notifications'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'is_read']),
        ]

    def __str__(self):
        return f"{self.user.username}: {self.title}"

    def mark_as_read(self):
        from django.utils import timezone
        if not self.is_read:
            self.is_read = True
            self.read_at = timezone.now()
            self.save(update_fields=['is_read', 'read_at'])
