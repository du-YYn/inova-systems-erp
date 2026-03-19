from django.db import migrations, models
import core.validators


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0003_invoice_project_nfse_transaction_project'),
    ]

    operations = [
        migrations.AlterField(
            model_name='invoice',
            name='items',
            field=models.JSONField(default=list, validators=[core.validators.validate_invoice_items]),
        ),
        migrations.AlterField(
            model_name='transaction',
            name='tags',
            field=models.JSONField(default=list, validators=[core.validators.validate_tags_list]),
        ),
    ]
