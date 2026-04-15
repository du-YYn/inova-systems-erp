from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0022_clientonboarding'),
    ]

    operations = [
        migrations.AlterField(
            model_name='prospect',
            name='contact_email',
            field=models.EmailField(blank=True, default='', max_length=254),
        ),
    ]
