from django.db import migrations, models
import core.validators


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0004_employeeprofile_absence_userskill'),
    ]

    operations = [
        migrations.AlterField(
            model_name='user',
            name='avatar',
            field=models.ImageField(blank=True, null=True, upload_to='avatars/', validators=[core.validators.validate_image_extension, core.validators.validate_image_size]),
        ),
    ]
