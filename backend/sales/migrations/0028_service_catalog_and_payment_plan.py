import logging
from django.db import migrations, models


SERVICE_SEED = [
    ('software_dev',  'Sistema Web',              'one_time',  1),
    ('mobile',        'Aplicativo Mobile',        'one_time',  2),
    ('site',          'Site Institucional',       'one_time',  3),
    ('e_commerce',    'E-commerce',               'one_time',  4),
    ('landing_page',  'Landing Page',             'one_time',  5),
    ('erp',           'ERP / Sistema de Gestão',  'one_time',  6),
    ('integration',   'Integração de Sistemas',   'one_time',  7),
    ('automation',    'Automação de Processos',   'monthly',   8),
    ('ai',            'Inteligência Artificial',  'monthly',   9),
    ('consulting',    'Consultoria Técnica',      'one_time', 10),
    ('support',       'Suporte e Manutenção',     'monthly',  11),
]


def seed_services(apps, schema_editor):
    """Popula o catálogo inicial com 11 serviços. Robusto: nunca bloqueia deploy.

    - update_or_create por code para ser idempotente (rodar 2x não duplica)
    - try/except por linha — uma falha não aborta o seed inteiro
    - logs WARNING no lugar de RaiseError
    """
    logger = logging.getLogger(__name__)
    Service = apps.get_model('sales', 'Service')
    for code, name, recurrence, order in SERVICE_SEED:
        try:
            Service.objects.update_or_create(
                code=code,
                defaults={
                    'name': name,
                    'default_recurrence': recurrence,
                    'display_order': order,
                    'is_active': True,
                },
            )
        except Exception as e:
            logger.warning(f'Falha ao seed service code={code}: {e!r}')


def unseed_services(apps, schema_editor):
    Service = apps.get_model('sales', 'Service')
    codes = [row[0] for row in SERVICE_SEED]
    try:
        Service.objects.filter(code__in=codes).delete()
    except Exception as e:  # noqa: BLE001 — reverse migration, não é crítico
        logging.getLogger(__name__).warning(f'unseed_services: {e!r}')


class Migration(migrations.Migration):
    """Cria catálogo de serviços e plano de pagamento para Proposal/Contract.

    5 tabelas novas:
    - services          — catálogo editável pelo admin
    - proposal_services — M2M through (apenas escopo, valor é global na proposta)
    - proposal_payment_plans — OneToOne, estrutura de pagamento
    - contract_services — espelho para contrato
    - contract_payment_plans — espelho para contrato (editável após conversão)

    Seed dos 11 serviços existentes (compatível com SERVICE_INTEREST_CHOICES
    do Prospect para migração tranquila).

    Esta migration apenas cria as tabelas — os serializers, views e URLs
    vêm na Fase F. Até lá as tabelas existem mas ninguém as consulta.
    """

    dependencies = [
        ('sales', '0027_prospect_follow_up_tracking'),
    ]

    operations = [
        migrations.CreateModel(
            name='Service',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.SlugField(max_length=50, unique=True, help_text='Código único (ex: software_dev)')),
                ('name', models.CharField(max_length=200)),
                ('description', models.TextField(blank=True)),
                ('default_recurrence', models.CharField(
                    choices=[('one_time', 'Pagamento Único'), ('monthly', 'Mensal')],
                    default='one_time', max_length=20,
                )),
                ('is_active', models.BooleanField(default=True)),
                ('display_order', models.IntegerField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'services',
                'ordering': ['display_order', 'name'],
            },
        ),
        migrations.CreateModel(
            name='ProposalService',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('notes', models.CharField(blank=True, max_length=500)),
                ('display_order', models.IntegerField(default=0)),
                ('proposal', models.ForeignKey(
                    on_delete=models.deletion.CASCADE,
                    related_name='service_items', to='sales.proposal',
                )),
                ('service', models.ForeignKey(
                    on_delete=models.deletion.PROTECT,
                    related_name='proposal_items', to='sales.service',
                )),
            ],
            options={
                'db_table': 'proposal_services',
                'ordering': ['display_order', 'id'],
            },
        ),
        migrations.AddConstraint(
            model_name='proposalservice',
            constraint=models.UniqueConstraint(
                fields=('proposal', 'service'), name='unique_proposal_service',
            ),
        ),
        migrations.CreateModel(
            name='ProposalPaymentPlan',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('plan_type', models.CharField(
                    choices=[
                        ('one_time', 'Pagamento Único'),
                        ('recurring_only', 'Apenas Mensal'),
                        ('setup_plus_recurring', 'Setup + Mensal'),
                    ],
                    default='one_time', max_length=30,
                )),
                ('one_time_amount', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('one_time_method', models.CharField(
                    blank=True,
                    choices=[
                        ('pix', 'PIX (à vista)'),
                        ('credit_card', 'Cartão Parcelado'),
                        ('boleto', 'Boleto Parcelado'),
                    ],
                    max_length=20,
                )),
                ('one_time_installments', models.IntegerField(default=1)),
                ('one_time_first_due', models.DateField(blank=True, null=True)),
                ('one_time_notes', models.TextField(blank=True)),
                ('recurring_amount', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('recurring_method', models.CharField(
                    blank=True,
                    choices=[
                        ('pix', 'PIX'),
                        ('credit_card', 'Cartão de Crédito'),
                        ('boleto', 'Boleto'),
                        ('transfer', 'Transferência'),
                    ],
                    max_length=20,
                )),
                ('recurring_day_of_month', models.IntegerField(blank=True, null=True)),
                ('recurring_duration_months', models.IntegerField(blank=True, null=True)),
                ('recurring_first_due', models.DateField(blank=True, null=True)),
                ('recurring_notes', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('proposal', models.OneToOneField(
                    on_delete=models.deletion.CASCADE,
                    related_name='payment_plan', to='sales.proposal',
                )),
            ],
            options={'db_table': 'proposal_payment_plans'},
        ),
        migrations.CreateModel(
            name='ContractService',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('notes', models.CharField(blank=True, max_length=500)),
                ('display_order', models.IntegerField(default=0)),
                ('contract', models.ForeignKey(
                    on_delete=models.deletion.CASCADE,
                    related_name='service_items', to='sales.contract',
                )),
                ('service', models.ForeignKey(
                    on_delete=models.deletion.PROTECT,
                    related_name='contract_items', to='sales.service',
                )),
            ],
            options={
                'db_table': 'contract_services',
                'ordering': ['display_order', 'id'],
            },
        ),
        migrations.AddConstraint(
            model_name='contractservice',
            constraint=models.UniqueConstraint(
                fields=('contract', 'service'), name='unique_contract_service',
            ),
        ),
        migrations.CreateModel(
            name='ContractPaymentPlan',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('plan_type', models.CharField(
                    choices=[
                        ('one_time', 'Pagamento Único'),
                        ('recurring_only', 'Apenas Mensal'),
                        ('setup_plus_recurring', 'Setup + Mensal'),
                    ],
                    default='one_time', max_length=30,
                )),
                ('one_time_amount', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('one_time_method', models.CharField(
                    blank=True,
                    choices=[
                        ('pix', 'PIX (à vista)'),
                        ('credit_card', 'Cartão Parcelado'),
                        ('boleto', 'Boleto Parcelado'),
                    ],
                    max_length=20,
                )),
                ('one_time_installments', models.IntegerField(default=1)),
                ('one_time_first_due', models.DateField(blank=True, null=True)),
                ('one_time_notes', models.TextField(blank=True)),
                ('recurring_amount', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('recurring_method', models.CharField(
                    blank=True,
                    choices=[
                        ('pix', 'PIX'),
                        ('credit_card', 'Cartão de Crédito'),
                        ('boleto', 'Boleto'),
                        ('transfer', 'Transferência'),
                    ],
                    max_length=20,
                )),
                ('recurring_day_of_month', models.IntegerField(blank=True, null=True)),
                ('recurring_duration_months', models.IntegerField(blank=True, null=True)),
                ('recurring_first_due', models.DateField(blank=True, null=True)),
                ('recurring_notes', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('contract', models.OneToOneField(
                    on_delete=models.deletion.CASCADE,
                    related_name='payment_plan', to='sales.contract',
                )),
            ],
            options={'db_table': 'contract_payment_plans'},
        ),
        migrations.RunPython(seed_services, reverse_code=unseed_services),
    ]
