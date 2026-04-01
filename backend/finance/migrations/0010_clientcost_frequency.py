from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0009_alter_clientcost_options'),
    ]

    operations = [
        migrations.AddField(
            model_name='clientcost',
            name='frequency',
            field=models.CharField(choices=[('one_time', 'Único'), ('monthly', 'Mensal'), ('quarterly', 'Trimestral'), ('semiannual', 'Semestral'), ('yearly', 'Anual')], default='monthly', max_length=20),
        ),
        # Migrate is_recurring data: True→monthly, False→one_time
        migrations.RunSQL(
            sql="UPDATE client_costs SET frequency = CASE WHEN is_recurring THEN 'monthly' ELSE 'one_time' END;",
            reverse_sql=migrations.RunSQL.noop,
        ),
        migrations.RemoveField(
            model_name='clientcost',
            name='is_recurring',
        ),
    ]
