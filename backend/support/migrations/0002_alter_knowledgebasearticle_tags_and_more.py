from django.db import migrations, models
import core.validators


class Migration(migrations.Migration):

    dependencies = [
        ('support', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='knowledgebasearticle',
            name='tags',
            field=models.JSONField(default=list, validators=[core.validators.validate_tags_list]),
        ),
        migrations.AlterField(
            model_name='supportticket',
            name='tags',
            field=models.JSONField(default=list, validators=[core.validators.validate_tags_list]),
        ),
        migrations.AlterField(
            model_name='ticketattachment',
            name='file',
            field=models.FileField(upload_to='ticket_attachments/%Y/%m/', validators=[core.validators.validate_file_extension, core.validators.validate_file_size]),
        ),
    ]
