from django.db import migrations, models
import core.validators


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0004_prospect_closer_name_prospect_company_size_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='customer',
            name='contacts',
            field=models.JSONField(default=list, validators=[core.validators.validate_contact_list]),
        ),
        migrations.AlterField(
            model_name='proposal',
            name='deliverables',
            field=models.JSONField(default=list, validators=[core.validators.validate_scope_list]),
        ),
        migrations.AlterField(
            model_name='proposal',
            name='requirements',
            field=models.JSONField(default=list, validators=[core.validators.validate_scope_list]),
        ),
        migrations.AlterField(
            model_name='proposal',
            name='scope',
            field=models.JSONField(default=list, validators=[core.validators.validate_scope_list]),
        ),
        migrations.AlterField(
            model_name='proposal',
            name='timeline',
            field=models.JSONField(default=dict, validators=[core.validators.validate_timeline_dict]),
        ),
    ]
