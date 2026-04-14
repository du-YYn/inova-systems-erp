from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0024_partner_commission'),
    ]

    operations = [
        migrations.AlterField(
            model_name='partnercommission',
            name='prospect',
            field=models.OneToOneField(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='partner_commission',
                to='sales.prospect',
            ),
        ),
    ]
