from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0022_clientonboarding'),
    ]

    operations = [
        migrations.AddField(
            model_name='clientonboarding',
            name='finance_contact_name',
            field=models.CharField(blank=True, help_text='Nome do contato financeiro', max_length=300),
        ),
        migrations.AddField(
            model_name='clientonboarding',
            name='finance_contact_phone',
            field=models.CharField(blank=True, max_length=20),
        ),
        migrations.AddField(
            model_name='clientonboarding',
            name='finance_contact_email',
            field=models.EmailField(blank=True, max_length=254),
        ),
    ]
