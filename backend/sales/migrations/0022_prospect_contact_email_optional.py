from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0021_merge_0008_prospectmessage_0020_proposal_file_token_views'),
    ]

    operations = [
        migrations.AlterField(
            model_name='prospect',
            name='contact_email',
            field=models.EmailField(blank=True, default='', max_length=254),
        ),
    ]
