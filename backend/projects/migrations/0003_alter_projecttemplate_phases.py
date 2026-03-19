from django.db import migrations, models
import core.validators


class Migration(migrations.Migration):

    dependencies = [
        ('projects', '0002_projecttask_depends_on_sprint_projectenvironment_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='projecttemplate',
            name='phases',
            field=models.JSONField(default=list, validators=[core.validators.validate_template_phases]),
        ),
    ]
