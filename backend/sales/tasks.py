import logging
import re
from celery import shared_task
from datetime import timedelta, date

logger = logging.getLogger('sales')


@shared_task
def check_contract_renewals():
    """Verifica contratos próximos do vencimento e processa renovações automáticas."""
    from .models import Contract
    today = date.today()

    # Contratos que vencem nos próximos 30 dias
    expiring_soon = Contract.objects.filter(
        status='active',
        end_date__isnull=False,
        end_date__lte=today + timedelta(days=30),
        end_date__gte=today,
    )

    for contract in expiring_soon:
        days_until_expiry = (contract.end_date - today).days
        logger.info(f"Contrato {contract.number} vence em {days_until_expiry} dias")

        # Cria notificação (se o app notifications existir)
        try:
            from notifications.models import Notification
            from django.contrib.auth import get_user_model
            User = get_user_model()
            # Notifica admins e managers
            for user in User.objects.filter(role__in=['admin', 'manager'], is_active=True):
                Notification.objects.get_or_create(
                    user=user,
                    object_type='contract',
                    object_id=contract.id,
                    notification_type='contract_expiring',
                    defaults={
                        'title': f'Contrato {contract.number} vence em {days_until_expiry} dias',
                        'message': (
                            f'O contrato de {contract.customer.company_name or contract.customer.name}'
                            f' vence em {contract.end_date.strftime("%d/%m/%Y")}.'
                        ),
                    }
                )
        except Exception as e:
            logger.warning(f"Não foi possível criar notificação: {e}")

    # Contratos vencidos - atualiza status
    expired = Contract.objects.filter(
        status='active',
        end_date__isnull=False,
        end_date__lt=today,
    )
    expired_count = expired.update(status='expired')
    if expired_count:
        logger.info(f"{expired_count} contratos marcados como expirados")

    # Renovação automática
    auto_renew_contracts = Contract.objects.filter(
        status='expired',
        auto_renew=True,
        end_date__isnull=False,
    )

    renewed_count = 0
    for contract in auto_renew_contracts:
        duration = contract.end_date - contract.start_date
        new_start = contract.end_date
        new_end = new_start + duration

        base_number = re.sub(r'-R\d+$', '', contract.number)
        renewal_num = Contract.objects.filter(number__startswith=base_number).count()
        new_number = f"{base_number}-R{renewal_num}"

        Contract.objects.create(
            proposal=None,
            customer=contract.customer,
            number=new_number,
            title=f"{contract.title} (Renovação)",
            contract_type=contract.contract_type,
            billing_type=contract.billing_type,
            start_date=new_start,
            end_date=new_end,
            auto_renew=contract.auto_renew,
            renewal_days=contract.renewal_days,
            monthly_value=contract.monthly_value,
            hourly_rate=contract.hourly_rate,
            total_hours_monthly=contract.total_hours_monthly,
            status='active',
            notes=f"Renovação automática de {contract.number}",
            terms=contract.terms,
            created_by=contract.created_by,
        )
        contract.status = 'renewed'
        contract.save(update_fields=['status'])
        renewed_count += 1
        logger.info(f"Contrato {contract.number} renovado automaticamente como {new_number}")

    return {
        'expiring_soon': expiring_soon.count(),
        'expired': expired_count,
        'renewed': renewed_count,
    }
