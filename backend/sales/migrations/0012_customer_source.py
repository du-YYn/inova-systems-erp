from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0011_alter_winlossreason_reason'),
    ]

    operations = [
        migrations.AddField(
            model_name='customer',
            name='source',
            field=models.CharField(
                choices=[('manual', 'Manual'), ('crm', 'Via CRM')],
                default='manual',
                max_length=10,
            ),
        ),
    ]
