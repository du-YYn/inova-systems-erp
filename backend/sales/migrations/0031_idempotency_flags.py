from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0030_proposal_status_converted'),
    ]

    operations = [
        migrations.AddField(
            model_name='prospect',
            name='receivables_generated_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='proposal',
            name='commissions_generated_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
