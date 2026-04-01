from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0008_clientcost_category_description'),
    ]

    operations = [
        migrations.AlterModelOptions(
            name='clientcost',
            options={'ordering': ['-reference_month', 'customer__company_name', 'cost_category']},
        ),
    ]
