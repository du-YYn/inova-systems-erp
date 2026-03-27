from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0008_prospect_service_interest_json'),
    ]

    operations = [
        migrations.AlterField(
            model_name='proposal',
            name='customer',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='proposals',
                to='sales.customer',
            ),
        ),
    ]
