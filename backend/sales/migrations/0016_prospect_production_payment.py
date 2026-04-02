from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0015_contract_service_types_file'),
    ]

    operations = [
        migrations.AlterField(
            model_name='prospect',
            name='status',
            field=models.CharField(
                choices=[
                    ('new', 'Lead Recebido'), ('qualifying', 'Em Qualificação'),
                    ('qualified', 'Qualificado'), ('disqualified', 'Não Qualificado'),
                    ('scheduled', 'Agendado'), ('pre_meeting', 'Pré-Reunião'),
                    ('no_show', 'Não Compareceu'), ('meeting_done', 'Reunião Realizada'),
                    ('proposal', 'Proposta Enviada'), ('won', 'Fechado'),
                    ('production', 'Em Produção'), ('not_closed', 'Não Fechou'),
                    ('lost', 'Perdido'), ('follow_up', 'Em Follow-up'),
                ],
                default='new', max_length=20,
            ),
        ),
        migrations.AddField(model_name='prospect', name='payment_method',
            field=models.CharField(blank=True, choices=[('pix', 'PIX'), ('credit_card', 'Cartão de Crédito'), ('boleto', 'Boleto Bancário'), ('transfer', 'Transferência')], max_length=20)),
        migrations.AddField(model_name='prospect', name='payment_type',
            field=models.CharField(blank=True, choices=[('one_time', 'Pagamento Único'), ('split', 'Entrada + Entrega'), ('installments', 'Parcelado'), ('monthly', 'Recorrente Mensal'), ('setup_monthly', 'Entrada + Mensal')], max_length=20)),
        migrations.AddField(model_name='prospect', name='payment_split_pct',
            field=models.IntegerField(default=50, help_text='% da entrada')),
        migrations.AddField(model_name='prospect', name='payment_installments',
            field=models.IntegerField(default=1, help_text='Número de parcelas')),
        migrations.AddField(model_name='prospect', name='payment_monthly_value',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12)),
        migrations.AddField(model_name='prospect', name='payment_due_day',
            field=models.IntegerField(default=15, help_text='Dia do vencimento')),
        migrations.AddField(model_name='prospect', name='payment_duration_months',
            field=models.IntegerField(default=12, help_text='Duração em meses')),
        migrations.AddField(model_name='prospect', name='payment_first_due',
            field=models.DateField(blank=True, help_text='Vencimento primeira parcela', null=True)),
    ]
