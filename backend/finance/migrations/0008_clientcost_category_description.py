from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0007_asset_types'),
    ]

    operations = [
        migrations.AddField(
            model_name='clientcost',
            name='cost_category',
            field=models.CharField(choices=[('sistemas', 'Sistemas'), ('pessoas', 'Pessoas'), ('infraestrutura', 'Infraestrutura'), ('comercial', 'Comercial'), ('outro', 'Outro')], default='sistemas', max_length=30),
        ),
        migrations.AddField(
            model_name='clientcost',
            name='description',
            field=models.CharField(default='', help_text='Nome do custo', max_length=200),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='clientcost',
            name='is_recurring',
            field=models.BooleanField(default=True, help_text='Custo mensal recorrente'),
        ),
        # Migrate old cost_type data to description
        migrations.RunSQL(
            sql="UPDATE client_costs SET description = cost_type WHERE description = '';",
            reverse_sql=migrations.RunSQL.noop,
        ),
        migrations.RemoveField(
            model_name='clientcost',
            name='cost_type',
        ),
    ]
