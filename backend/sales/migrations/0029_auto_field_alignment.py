from django.db import migrations, models


class Migration(migrations.Migration):
    """Alinha campos id dos models novos para BigAutoField (default_auto_field
    da app sales) e renomeia índice com hash Django-gerado.

    Migration auto-detectada pelo `makemigrations --check`. Sem alteração
    funcional — apenas mantém o state do Django ORM consistente com o
    models.py declarado.
    """

    dependencies = [
        ('sales', '0028_service_catalog_and_payment_plan'),
    ]

    operations = [
        migrations.RenameIndex(
            model_name='prospectmessage',
            new_name='prospect_me_prospec_85a3b9_idx',
            old_name='prospect_me_prospec_idx',
        ),
        migrations.AlterField(
            model_name='contractpaymentplan',
            name='id',
            field=models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID'),
        ),
        migrations.AlterField(
            model_name='contractservice',
            name='id',
            field=models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID'),
        ),
        migrations.AlterField(
            model_name='proposalpaymentplan',
            name='id',
            field=models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID'),
        ),
        migrations.AlterField(
            model_name='proposalservice',
            name='id',
            field=models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID'),
        ),
        migrations.AlterField(
            model_name='service',
            name='id',
            field=models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID'),
        ),
    ]
