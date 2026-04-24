"""Models do app core — dados transversais e auditoria persistente."""
from django.conf import settings
from django.db import models


class AuditLog(models.Model):
    """Registro append-only de operacoes sensiveis (F3a).

    Substitui logs stdout que sao mutáveis e perdem em rotação.
    Atende LGPD Art. 37 (registro das operações) e obrigações de
    auditoria fiscal/contábil.

    Append-only por convencao: model nao expoe `delete()` no admin
    nem em viewsets. FKs com PROTECT impedem cascade deletion.
    """

    # Timestamp imutavel — usado como indice principal
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)

    # Quem executou — PROTECT impede deletar User com audit history
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True, blank=True,
        related_name='audit_logs',
        help_text='Usuario que executou a operacao (null para operacoes do sistema)',
    )

    # Contexto do usuario (preservado mesmo se user for deletado)
    username_snapshot = models.CharField(
        max_length=150, blank=True,
        help_text='Username no momento do evento (snapshot, imutavel)',
    )
    user_role_snapshot = models.CharField(max_length=20, blank=True)

    # O que foi feito (indices compostos em Meta cobrem as buscas)
    action = models.CharField(
        max_length=100,
        help_text='Ex: contract_activate, invoice_mark_paid, customer_anonymize',
    )
    resource_type = models.CharField(
        max_length=50,
        help_text='Ex: contract, invoice, customer, payment_provider',
    )
    resource_id = models.CharField(
        max_length=100, blank=True,
        help_text='PK do recurso afetado (string para suportar UUID/int)',
    )

    # Estado antes/depois — diffs preservados em JSON
    old_value = models.JSONField(default=dict, blank=True)
    new_value = models.JSONField(default=dict, blank=True)

    # Detalhes livres (texto curto)
    details = models.TextField(blank=True)

    # Contexto de request (quando disponivel)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=500, blank=True)

    class Meta:
        db_table = 'audit_log'
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['resource_type', 'resource_id']),
            models.Index(fields=['user', '-timestamp']),
            models.Index(fields=['action', '-timestamp']),
        ]

    def __str__(self):
        who = self.username_snapshot or '(sistema)'
        return f'{self.timestamp:%Y-%m-%d %H:%M} {who} {self.action} {self.resource_type}#{self.resource_id}'

    def delete(self, *args, **kwargs):
        # Append-only: impede remocao em codigo. Apenas DB superuser
        # conseguiria via SQL direto (fora do escopo do Django).
        raise RuntimeError(
            'AuditLog e append-only. Remocoes devem ser feitas apenas via DBA '
            'com aprovacao do DPO e nunca em operacao normal.'
        )
